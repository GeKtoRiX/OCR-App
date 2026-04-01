import { Injectable } from '@nestjs/common';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { IPracticeSessionRepository } from '../../domain/ports/practice-session-repository.port';
import { IVocabularyLlmService } from '../../domain/ports/vocabulary-llm-service.port';
import {
  StartPracticeInput,
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
