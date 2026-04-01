import { Injectable } from '@nestjs/common';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { IPracticeSessionRepository } from '../../domain/ports/practice-session-repository.port';
import type { VocabularyAttemptStats } from '../../domain/ports/practice-session-repository.port';
import { IVocabularyLlmService } from '../../domain/ports/vocabulary-llm-service.port';
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

    const generated = await this.llmService.generateExercises(words, limit);

    const session = await this.sessionRepo.createSession(
      input.targetLang ?? 'en',
      input.nativeLang ?? 'ru',
    );

    const exercises: ExerciseOutput[] = generated.map((e) => ({
      vocabularyId: e.vocabularyId,
      word: e.word,
      exerciseType: e.exerciseType,
      prompt: e.prompt,
      correctAnswer: e.correctAnswer,
      options: e.options,
    }));

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
      orderedWords.length,
    );
    const generatedByVocabularyId = new Map<string, ExerciseOutput>();

    for (const exercise of generated) {
      if (!generatedByVocabularyId.has(exercise.vocabularyId)) {
        generatedByVocabularyId.set(exercise.vocabularyId, {
          vocabularyId: exercise.vocabularyId,
          word: exercise.word,
          exerciseType: exercise.exerciseType,
          prompt: exercise.prompt,
          correctAnswer: exercise.correctAnswer,
          options: exercise.options,
        });
      }
    }

    const exercises = orderedWords.map((word) => {
      const generatedExercise = generatedByVocabularyId.get(word.id);
      if (generatedExercise) {
        return generatedExercise;
      }

      return {
        vocabularyId: word.id,
        word: word.word,
        exerciseType: 'spelling' as const,
        prompt: `Translate: ${word.translation}`,
        correctAnswer: word.word,
      };
    });

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
