import { Injectable } from '@nestjs/common';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { IPracticeSessionRepository } from '../../domain/ports/practice-session-repository.port';
import type { VocabularyAttemptStats } from '../../domain/ports/practice-session-repository.port';
import {
  IVocabularyLlmService,
  type GeneratedExercise,
} from '../../domain/ports/vocabulary-llm-service.port';
import {
  StartPracticeInput,
  PracticePlanInput,
  PracticePlanOutput,
  PracticePreviewWordOutput,
  GeneratePracticeRoundInput,
  GeneratePracticeRoundOutput,
  SubmitAnswerInput,
  ExerciseOutput,
  SubmitAnswerOutput,
  SessionAnalysisOutput,
} from '../dto/practice.dto';
import {
  calculateSm2,
  computeErrorPosition,
  computeQualityRating,
} from '../utils/sm2';
import type { ExerciseType } from '../../domain/entities/exercise-attempt.entity';
import type { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';

const REQUIRED_EXERCISE_ORDER: ExerciseType[] = [
  'multiple_choice',
  'spelling',
  'context_sentence',
  'fill_blank',
];


function toPreviewWord(
  word: VocabularyWord,
  stats: VocabularyAttemptStats | undefined,
): PracticePreviewWordOutput {
  return {
    id: word.id,
    word: word.word,
    translation: word.translation,
    contextSentence: word.contextSentence,
    attemptCount: stats?.attemptCount ?? 0,
    incorrectCount: stats?.incorrectCount ?? 0,
  };
}

function pickHardestWords(
  words: PracticePreviewWordOutput[],
  limit: number,
): PracticePreviewWordOutput[] {
  return [...words]
    .map((word) => ({ word, tieBreaker: Math.random() }))
    .sort((left, right) => {
      if (right.word.incorrectCount !== left.word.incorrectCount) {
        return right.word.incorrectCount - left.word.incorrectCount;
      }
      return left.tieBreaker - right.tieBreaker;
    })
    .slice(0, limit)
    .map((entry) => entry.word);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeOptionText(value: string): string {
  return value
    .trim()
    .replace(/^[A-D]\s*[\).\:-]\s*/i, '')
    .replace(/^[-*•]\s*/, '')
    .trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function maskWordInSentence(
  sentence: string,
  word: string,
  replacement: string,
): string | null {
  const trimmedSentence = sentence.trim();
  const trimmedWord = word.trim();
  if (!trimmedSentence || !trimmedWord) {
    return null;
  }

  const pattern = new RegExp(escapeRegExp(trimmedWord), 'i');
  if (!pattern.test(trimmedSentence)) {
    return null;
  }

  return trimmedSentence.replace(pattern, replacement);
}

function buildSyntheticDistractors(word: string): string[] {
  const normalizedWord = normalizeWhitespace(word);
  if (!normalizedWord) {
    return [];
  }

  const compact = normalizedWord.replace(/\s+/g, '');
  const variants = new Set<string>();
  const words = normalizedWord.split(/\s+/);

  if (words.length > 1) {
    variants.add([...words].reverse().join(' '));
    variants.add(`${normalizedWord}s`);
    variants.add(words.slice(0, -1).concat(`${words[words.length - 1]}s`).join(' '));
  }

  if (compact.length > 3) {
    variants.add(normalizedWord.slice(0, -1));
    variants.add(normalizedWord.slice(1));
    variants.add(`${normalizedWord}${normalizedWord[normalizedWord.length - 1]}`);
    variants.add(`${normalizedWord}s`);
  }

  if (compact.length > 2) {
    variants.add(`${normalizedWord}ed`);
    variants.add(`${normalizedWord}ing`);
  }

  if (normalizedWord.length > 3) {
    variants.add(
      `${normalizedWord[1]}${normalizedWord[0]}${normalizedWord.slice(2)}`,
    );
  }

  return [...variants].filter(
    (variant) =>
      normalizeWhitespace(variant).length > 0 &&
      normalizeWhitespace(variant).toLowerCase() !== normalizedWord.toLowerCase(),
  );
}

function hashText(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildMultipleChoiceOptions(
  word: VocabularyWord,
  allWords: VocabularyWord[],
  existingOptions?: string[],
): string[] {
  const correctAnswer = normalizeWhitespace(word.word);
  const distractors: string[] = [];
  const seen = new Set<string>([correctAnswer.toLowerCase()]);

  const pushOption = (option: string) => {
    const normalized = normalizeOptionText(option);
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    distractors.push(normalized);
  };

  for (const option of existingOptions ?? []) {
    pushOption(option);
  }

  for (const candidate of allWords) {
    if (candidate.id === word.id) {
      continue;
    }
    pushOption(candidate.word);
  }

  for (const variant of buildSyntheticDistractors(word.word)) {
    pushOption(variant);
  }

  let syntheticIndex = 1;
  while (distractors.length < 3) {
    pushOption(`${correctAnswer}-${syntheticIndex}`);
    syntheticIndex += 1;
  }

  const finalOptions = distractors.slice(0, 3);
  const answerIndex = hashText(word.id || word.word) % 4;
  finalOptions.splice(answerIndex, 0, correctAnswer);
  return finalOptions;
}

function buildBlankSentence(word: VocabularyWord): string | null {
  return maskWordInSentence(word.contextSentence, word.word, '___');
}

function buildContextHint(word: VocabularyWord): string {
  const maskedSentence = maskWordInSentence(word.contextSentence, word.word, '[...]');
  return maskedSentence || word.contextSentence.trim() || 'No context provided.';
}

function buildFallbackExercise(
  word: VocabularyWord,
  allWords: VocabularyWord[],
  exerciseType: ExerciseType,
): ExerciseOutput {
  const blankSentence = buildBlankSentence(word);

  switch (exerciseType) {
    case 'multiple_choice':
      return {
        vocabularyId: word.id,
        word: word.word,
        exerciseType,
        prompt: blankSentence
          ? `Choose the word that best completes the sentence.\n${blankSentence}`
          : `Choose the ${word.targetLang} word that matches "${word.translation}".`,
        correctAnswer: word.word,
        options: buildMultipleChoiceOptions(word, allWords),
      };
    case 'spelling':
      return {
        vocabularyId: word.id,
        word: word.word,
        exerciseType,
        prompt: `Type the ${word.targetLang} word for "${word.translation}".`,
        correctAnswer: word.word,
      };
    case 'context_sentence':
      return {
        vocabularyId: word.id,
        word: word.word,
        exerciseType,
        prompt: `Type the ${word.targetLang} word that matches this meaning.\nTranslation: "${word.translation}"\nContext: ${buildContextHint(word)}`,
        correctAnswer: word.word,
      };
    case 'fill_blank':
      return {
        vocabularyId: word.id,
        word: word.word,
        exerciseType,
        prompt: blankSentence
          ? `Fill in the blank with the missing word.\n${blankSentence}`
          : `Fill in the blank with the ${word.targetLang} word for "${word.translation}".\n___`,
        correctAnswer: word.word,
      };
  }
}

function normalizeGeneratedExercise(
  exercise: GeneratedExercise,
  word: VocabularyWord,
  allWords: VocabularyWord[],
): ExerciseOutput | null {
  const prompt = exercise.prompt?.trim();
  if (!prompt) {
    return null;
  }

  if (exercise.exerciseType === 'multiple_choice') {
    return {
      vocabularyId: word.id,
      word: word.word,
      exerciseType: 'multiple_choice',
      prompt,
      correctAnswer: word.word,
      options: buildMultipleChoiceOptions(word, allWords, exercise.options),
    };
  }

  return {
    vocabularyId: word.id,
    word: word.word,
    exerciseType: exercise.exerciseType,
    prompt,
    correctAnswer: word.word,
  };
}

function buildOrderedExercises(
  words: VocabularyWord[],
  generated: GeneratedExercise[],
): ExerciseOutput[] {
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const generatedByWord = new Map<string, Map<ExerciseType, ExerciseOutput>>();

  for (const word of words) {
    generatedByWord.set(word.id, new Map<ExerciseType, ExerciseOutput>());
  }

  for (const exercise of generated) {
    const word = wordsById.get(exercise.vocabularyId);
    if (!word || !REQUIRED_EXERCISE_ORDER.includes(exercise.exerciseType)) {
      continue;
    }

    const generatedForWord = generatedByWord.get(word.id);
    if (!generatedForWord || generatedForWord.has(exercise.exerciseType)) {
      continue;
    }

    const normalized = normalizeGeneratedExercise(exercise, word, words);
    if (normalized) {
      generatedForWord.set(exercise.exerciseType, normalized);
    }
  }

  return REQUIRED_EXERCISE_ORDER.flatMap((exerciseType) =>
    words.map((word) =>
      generatedByWord.get(word.id)?.get(exerciseType) ??
      buildFallbackExercise(word, words, exerciseType),
    ),
  );
}

@Injectable()
export class PracticeUseCase {
  constructor(
    private readonly vocabRepo: IVocabularyRepository,
    private readonly sessionRepo: IPracticeSessionRepository,
    private readonly llmService: IVocabularyLlmService,
  ) {}

  async startPractice(
    input: StartPracticeInput,
  ): Promise<{ sessionId: string; exercises: ExerciseOutput[] }> {
    const limit = input.wordLimit ?? 10;
    const words = await this.vocabRepo.findDueForReview(limit, input.targetLang, input.nativeLang);
    if (words.length === 0) {
      throw new Error('No words due for review');
    }

    const generated = await this.llmService.generateExercises(
      words,
      words.length * REQUIRED_EXERCISE_ORDER.length,
    );

    const session = await this.sessionRepo.createSession(
      input.targetLang ?? 'en',
      input.nativeLang ?? 'ru',
    );

    const exercises = buildOrderedExercises(words, generated);

    return { sessionId: session.id, exercises };
  }

  async planPractice(
    input: PracticePlanInput,
  ): Promise<PracticePlanOutput> {
    const batchSize = input.wordLimit ?? 10;
    const words = await this.vocabRepo.findAll(input.targetLang, input.nativeLang);
    if (words.length === 0) {
      throw new Error('No vocabulary words available');
    }

    const stats = await this.sessionRepo.findVocabularyStats(words.map((word) => word.id));
    const statsByVocabularyId = new Map(stats.map((item) => [item.vocabularyId, item]));
    const allWords = words.map((word) => toPreviewWord(word, statsByVocabularyId.get(word.id)));
    const unseenWords = allWords.filter((word) => word.attemptCount === 0);
    const session = await this.sessionRepo.createSession(
      input.targetLang ?? 'en',
      input.nativeLang ?? 'ru',
    );

    if (unseenWords.length > 0) {
      return {
        sessionId: session.id,
        batchSize,
        initialBatchMode: 'unseen',
        allWords,
        previewWords: unseenWords.slice(0, batchSize),
      };
    }

    return {
      sessionId: session.id,
      batchSize,
      initialBatchMode: 'hardest',
      allWords,
      previewWords: pickHardestWords(allWords, batchSize),
    };
  }

  async generatePracticeRound(
    input: GeneratePracticeRoundInput,
  ): Promise<GeneratePracticeRoundOutput> {
    const session = await this.sessionRepo.findSessionById(input.sessionId);
    if (!session) {
      throw new Error('Practice session not found');
    }

    if (!Array.isArray(input.vocabularyIds) || input.vocabularyIds.length === 0) {
      throw new Error('vocabularyIds must be a non-empty array');
    }

    const uniqueVocabularyIds = [...new Set(input.vocabularyIds)];
    const words = await this.vocabRepo.findByIds(uniqueVocabularyIds);
    const wordsById = new Map(words.map((word) => [word.id, word]));
    const orderedWords = uniqueVocabularyIds
      .map((vocabularyId) => wordsById.get(vocabularyId))
      .filter((word): word is VocabularyWord => Boolean(word));

    if (orderedWords.length !== uniqueVocabularyIds.length) {
      throw new Error('One or more vocabulary words were not found');
    }

    const generated = await this.llmService.generateExercises(
      orderedWords,
      orderedWords.length * REQUIRED_EXERCISE_ORDER.length,
    );
    const exercises = buildOrderedExercises(orderedWords, generated);

    return { exercises };
  }

  async submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
    const isCorrect =
      input.userAnswer.trim().toLowerCase() ===
      input.correctAnswer.trim().toLowerCase();
    const errorPosition = isCorrect
      ? null
      : computeErrorPosition(input.userAnswer, input.correctAnswer);
    const qualityRating = computeQualityRating(
      isCorrect,
      input.exerciseType as ExerciseType,
    );

    await this.sessionRepo.createAttempt(
      input.sessionId,
      input.vocabularyId,
      input.exerciseType,
      input.prompt,
      input.correctAnswer,
      input.userAnswer,
      isCorrect,
      errorPosition,
      qualityRating,
    );

    return { isCorrect, errorPosition, qualityRating };
  }

  async getRecentSessions(limit: number) {
    return this.sessionRepo.findRecentSessions(limit);
  }

  async getAttemptsByVocabulary(vocabularyId: string) {
    return this.sessionRepo.findAttemptsByVocabulary(vocabularyId);
  }

  async completeSession(
    sessionId: string,
  ): Promise<SessionAnalysisOutput> {
    const attempts = await this.sessionRepo.findAttemptsBySession(sessionId);
    const vocabIds = [...new Set(attempts.map((a) => a.vocabularyId))];
    const words = await this.vocabRepo.findByIds(vocabIds);

    const analysis = await this.llmService.analyzeSession(words, attempts);

    for (const word of words) {
      const wordAttempts = attempts.filter(
        (a) => a.vocabularyId === word.id,
      );
      const avgQuality =
        wordAttempts.reduce((sum, a) => sum + a.qualityRating, 0) /
        wordAttempts.length;
      const sm2 = calculateSm2(
        word.repetitions,
        word.easinessFactor,
        word.intervalDays,
        Math.round(avgQuality),
      );
      const nextReview = new Date(
        Date.now() + sm2.interval * 24 * 60 * 60 * 1000,
      ).toISOString();
      await this.vocabRepo.updateSrs(
        word.id,
        sm2.interval,
        sm2.easinessFactor,
        sm2.repetitions,
        nextReview,
      );
    }

    for (const wa of analysis.wordAnalyses) {
      const relevantAttempts = attempts.filter(
        (a) => a.vocabularyId === wa.vocabularyId,
      );
      for (const attempt of relevantAttempts) {
        await this.sessionRepo.updateAttemptMnemonic(
          attempt.id,
          wa.mnemonicSentence,
        );
      }
    }

    const totalExercises = attempts.length;
    const correctCount = attempts.filter((a) => a.isCorrect).length;
    await this.sessionRepo.completeSession(
      sessionId,
      totalExercises,
      correctCount,
      JSON.stringify(analysis),
    );

    return {
      sessionId,
      overallScore: analysis.overallScore,
      summary: analysis.summary,
      totalExercises,
      correctCount,
      wordAnalyses: analysis.wordAnalyses,
    };
  }
}
