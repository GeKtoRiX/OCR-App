import { PracticeController } from './practice.controller';
import { PracticeUseCase } from '../../application/use-cases/practice.use-case';
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';

describe('PracticeController', () => {
  let controller: PracticeController;
  let useCase: jest.Mocked<PracticeUseCase>;

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
      planPractice: jest.fn().mockResolvedValue({
        sessionId: 'sess-1',
        batchSize: 10,
        initialBatchMode: 'unseen',
        allWords: [
          {
            id: 'v1',
            word: 'test',
            translation: 'тест',
            contextSentence: 'A test sentence.',
            attemptCount: 0,
            incorrectCount: 0,
          },
        ],
        previewWords: [
          {
            id: 'v1',
            word: 'test',
            translation: 'тест',
            contextSentence: 'A test sentence.',
            attemptCount: 0,
            incorrectCount: 0,
          },
        ],
      }),
      generatePracticeRound: jest.fn().mockResolvedValue({
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
      getRecentSessions: jest.fn().mockResolvedValue([]),
      getAttemptsByVocabulary: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PracticeUseCase>;

    controller = new PracticeController(useCase);
  });

  describe('start', () => {
    it('starts a practice session', async () => {
      const result = await controller.start({
        targetLang: 'en',
        nativeLang: 'ru',
        wordLimit: 10,
      });

      expect(result.sessionId).toBe('sess-1');
      expect(result.exercises).toHaveLength(1);
      expect(useCase.startPractice).toHaveBeenCalledWith({
        targetLang: 'en',
        nativeLang: 'ru',
        wordLimit: 10,
      });
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

    it('returns 502 when the use case fails for another reason', async () => {
      useCase.startPractice.mockRejectedValue(new Error('Database unavailable'));

      await expect(controller.start({})).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        message: 'Database unavailable',
      });
    });

    it('returns a generic 502 when the start failure is not an Error instance', async () => {
      useCase.startPractice.mockRejectedValue('boom' as any);

      await expect(controller.start({})).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        message: 'Failed to start practice',
      });
    });
  });

  describe('plan', () => {
    it('returns a practice preview batch', async () => {
      const result = await controller.plan({
        targetLang: 'en',
        nativeLang: 'ru',
        wordLimit: 10,
      });

      expect(result.sessionId).toBe('sess-1');
      expect(result.previewWords).toHaveLength(1);
      expect(useCase.planPractice).toHaveBeenCalledWith({
        targetLang: 'en',
        nativeLang: 'ru',
        wordLimit: 10,
      });
    });
  });

  describe('round', () => {
    it('creates a practice round for requested vocabulary ids', async () => {
      const result = await controller.round({
        sessionId: 'sess-1',
        vocabularyIds: ['v1'],
      });

      expect(result.exercises).toHaveLength(1);
      expect(useCase.generatePracticeRound).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        vocabularyIds: ['v1'],
      });
    });

    it('rejects missing round payload fields', async () => {
      await expect(
        controller.round({
          sessionId: '',
          vocabularyIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
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

    it('rejects missing sessionId or vocabularyId', async () => {
      await expect(
        controller.answer({
          sessionId: '',
          vocabularyId: '',
          exerciseType: 'spelling',
          prompt: '',
          correctAnswer: '',
          userAnswer: '',
        }),
      ).rejects.toThrow(BadRequestException);
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

    it('rejects missing userAnswer while allowing an empty string', async () => {
      await expect(
        controller.answer({
          sessionId: 'sess-1',
          vocabularyId: 'v1',
          exerciseType: 'spelling',
          prompt: '',
          correctAnswer: '',
          userAnswer: undefined as unknown as string,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows an empty string userAnswer through to the use case', async () => {
      await expect(
        controller.answer({
          sessionId: 'sess-1',
          vocabularyId: 'v1',
          exerciseType: 'spelling',
          prompt: 'Translate',
          correctAnswer: 'test',
          userAnswer: '',
        }),
      ).resolves.toEqual({
        isCorrect: true,
        errorPosition: null,
        qualityRating: 5,
      });
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

    it('returns 502 when completion fails', async () => {
      useCase.completeSession.mockRejectedValue(new Error('Session storage failure'));

      await expect(controller.complete({ sessionId: 'sess-1' })).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        message: 'Session storage failure',
      });
    });

    it('returns a generic 502 when completion fails with a non-Error value', async () => {
      useCase.completeSession.mockRejectedValue('boom' as any);

      await expect(controller.complete({ sessionId: 'sess-1' })).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        message: 'Failed to complete session',
      });
    });
  });

  describe('sessions', () => {
    it('returns recent sessions via use case', async () => {
      const result = await controller.sessions();

      expect(useCase.getRecentSessions).toHaveBeenCalledWith(20);
      expect(result).toEqual([]);
    });

    it('passes a parsed numeric limit to the use case', async () => {
      await controller.sessions('5');

      expect(useCase.getRecentSessions).toHaveBeenCalledWith(5);
    });
  });

  describe('stats', () => {
    it('returns attempts for vocabulary via use case', async () => {
      const result = await controller.stats('v1');

      expect(useCase.getAttemptsByVocabulary).toHaveBeenCalledWith('v1');
      expect(result).toEqual([]);
    });
  });
});
