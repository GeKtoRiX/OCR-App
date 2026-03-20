import { PracticeController } from './practice.controller';
import { PracticeUseCase } from '../../application/use-cases/practice.use-case';
import { IPracticeSessionRepository } from '../../domain/ports/practice-session-repository.port';
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';

describe('PracticeController', () => {
  let controller: PracticeController;
  let useCase: jest.Mocked<PracticeUseCase>;
  let sessionRepo: jest.Mocked<IPracticeSessionRepository>;

  beforeEach(() => {
    useCase = {
      startPractice: jest.fn().mockResolvedValue({
        sessionId: 'sess-1',
        exercises: [{
          vocabularyId: 'v1',
          word: 'test',
          exerciseType: 'spelling',
          prompt: 'Translate',
          correctAnswer: 'test',
        }],
      }),
      submitAnswer: jest.fn().mockResolvedValue({
        isCorrect: true,
        errorPosition: null,
        qualityRating: 5,
      }),
      completeSession: jest.fn().mockResolvedValue({
        sessionId: 'sess-1',
        overallScore: 100,
        summary: 'Perfect',
        totalExercises: 1,
        correctCount: 1,
        wordAnalyses: [],
      }),
    } as unknown as jest.Mocked<PracticeUseCase>;

    sessionRepo = {
      findRecentSessions: jest.fn().mockResolvedValue([]),
      findAttemptsByVocabulary: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IPracticeSessionRepository>;

    controller = new PracticeController(useCase, sessionRepo);
  });

  describe('start', () => {
    it('starts a practice session', async () => {
      const result = await controller.start({});

      expect(result.sessionId).toBe('sess-1');
      expect(result.exercises).toHaveLength(1);
    });

    it('returns 400 when no words due', async () => {
      useCase.startPractice.mockRejectedValue(
        new Error('No words due for review'),
      );

      try {
        await controller.start({});
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });
  });

  describe('answer', () => {
    it('submits an answer', async () => {
      const result = await controller.answer({
        sessionId: 'sess-1',
        vocabularyId: 'v1',
        exerciseType: 'spelling',
        prompt: 'Translate',
        correctAnswer: 'test',
        userAnswer: 'test',
      });

      expect(result.isCorrect).toBe(true);
    });

    it('rejects invalid exercise type', async () => {
      await expect(
        controller.answer({
          sessionId: 'sess-1',
          vocabularyId: 'v1',
          exerciseType: 'invalid',
          prompt: '',
          correctAnswer: '',
          userAnswer: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('complete', () => {
    it('completes a session', async () => {
      const result = await controller.complete({ sessionId: 'sess-1' });

      expect(result.overallScore).toBe(100);
    });

    it('rejects missing sessionId', async () => {
      await expect(
        controller.complete({ sessionId: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('sessions', () => {
    it('returns recent sessions', async () => {
      const result = await controller.sessions();

      expect(sessionRepo.findRecentSessions).toHaveBeenCalledWith(20);
      expect(result).toEqual([]);
    });
  });

  describe('stats', () => {
    it('returns attempts for vocabulary', async () => {
      const result = await controller.stats('v1');

      expect(sessionRepo.findAttemptsByVocabulary).toHaveBeenCalledWith('v1');
      expect(result).toEqual([]);
    });
  });
});
