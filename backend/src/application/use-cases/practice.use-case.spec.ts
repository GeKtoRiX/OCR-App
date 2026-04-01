import { PracticeUseCase } from './practice.use-case';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { IPracticeSessionRepository } from '../../domain/ports/practice-session-repository.port';
import { IVocabularyLlmService } from '../../domain/ports/vocabulary-llm-service.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { PracticeSession } from '../../domain/entities/practice-session.entity';
import { ExerciseAttempt } from '../../domain/entities/exercise-attempt.entity';

const mockWord = new VocabularyWord(
  'v1', 'beautiful', 'word', 'красивый', 'en', 'ru',
  'The sunset was beautiful.', null,
  '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z',
  0, 2.5, 0, '2024-01-01T00:00:00.000Z',
);

const mockSession = new PracticeSession(
  'sess-1', '2024-01-01T00:00:00.000Z', null, 'en', 'ru', 0, 0, '{}',
);

describe('PracticeUseCase', () => {
  let useCase: PracticeUseCase;
  let vocabRepo: jest.Mocked<IVocabularyRepository>;
  let sessionRepo: jest.Mocked<IPracticeSessionRepository>;
  let llmService: jest.Mocked<IVocabularyLlmService>;

  beforeEach(() => {
    vocabRepo = {
      findDueForReview: jest.fn().mockResolvedValue([mockWord]),
      findByIds: jest.fn().mockResolvedValue([mockWord]),
      updateSrs: jest.fn().mockResolvedValue(mockWord),
    } as unknown as jest.Mocked<IVocabularyRepository>;

    sessionRepo = {
      createSession: jest.fn().mockResolvedValue(mockSession),
      createAttempt: jest.fn().mockResolvedValue(
        new ExerciseAttempt(
          'att-1', 'sess-1', 'v1', 'spelling',
          'Translate: красивый', 'beautiful', 'beautiful',
          true, null, 5, null, '2024-01-01T00:00:00.000Z',
        ),
      ),
      findAttemptsBySession: jest.fn().mockResolvedValue([
        new ExerciseAttempt(
          'att-1', 'sess-1', 'v1', 'spelling',
          'Translate: красивый', 'beautiful', 'beautiful',
          true, null, 5, null, '2024-01-01T00:00:00.000Z',
        ),
      ]),
      completeSession: jest.fn().mockResolvedValue(mockSession),
      updateAttemptMnemonic: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IPracticeSessionRepository>;

    llmService = {
      generateExercises: jest.fn().mockResolvedValue([{
        vocabularyId: 'v1',
        word: 'beautiful',
        exerciseType: 'spelling',
        prompt: 'Translate: красивый',
        correctAnswer: 'beautiful',
      }]),
      analyzeSession: jest.fn().mockResolvedValue({
        overallScore: 100,
        summary: 'Perfect!',
        wordAnalyses: [{
          vocabularyId: 'v1',
          word: 'beautiful',
          errorPattern: 'None',
          mnemonicSentence: 'Beauty is in the eye of the beholder',
          difficultyAssessment: 'easy',
          suggestedFocus: 'None needed',
        }],
      }),
    } as unknown as jest.Mocked<IVocabularyLlmService>;

    useCase = new PracticeUseCase(vocabRepo, sessionRepo, llmService);
  });

  describe('startPractice', () => {
    it('fetches due words and generates exercises', async () => {
      const result = await useCase.startPractice({});

      expect(vocabRepo.findDueForReview).toHaveBeenCalledWith(10, undefined, undefined);
      expect(llmService.generateExercises).toHaveBeenCalledWith([mockWord], 10);
      expect(result.sessionId).toBe('sess-1');
      expect(result.exercises).toHaveLength(1);
      expect(result.exercises[0].exerciseType).toBe('spelling');
    });

    it('does not create session when LLM fails', async () => {
      llmService.generateExercises.mockRejectedValue(new Error('LLM unavailable'));

      await expect(useCase.startPractice({})).rejects.toThrow('LLM unavailable');
      expect(sessionRepo.createSession).not.toHaveBeenCalled();
    });

    it('throws when no words are due', async () => {
      vocabRepo.findDueForReview.mockResolvedValue([]);

      await expect(useCase.startPractice({})).rejects.toThrow(
        'No words due for review',
      );
    });

    it('uses custom word limit', async () => {
      await useCase.startPractice({ wordLimit: 5 });

      expect(vocabRepo.findDueForReview).toHaveBeenCalledWith(5, undefined, undefined);
    });

    it('filters by language pair', async () => {
      await useCase.startPractice({ targetLang: 'es', nativeLang: 'en', wordLimit: 3 });

      expect(vocabRepo.findDueForReview).toHaveBeenCalledWith(3, 'es', 'en');
    });
  });

  describe('submitAnswer', () => {
    it('records correct answer', async () => {
      const result = await useCase.submitAnswer({
        sessionId: 'sess-1',
        vocabularyId: 'v1',
        exerciseType: 'spelling',
        prompt: 'Translate: красивый',
        correctAnswer: 'beautiful',
        userAnswer: 'beautiful',
      });

      expect(result.isCorrect).toBe(true);
      expect(result.errorPosition).toBeNull();
      expect(result.qualityRating).toBe(5);
      expect(sessionRepo.createAttempt).toHaveBeenCalled();
    });

    it('records incorrect answer with error position', async () => {
      const result = await useCase.submitAnswer({
        sessionId: 'sess-1',
        vocabularyId: 'v1',
        exerciseType: 'spelling',
        prompt: 'Translate: красивый',
        correctAnswer: 'beautiful',
        userAnswer: 'beatiful',
      });

      expect(result.isCorrect).toBe(false);
      expect(result.errorPosition).toBe('middle');
      expect(result.qualityRating).toBe(1);
    });
  });

  describe('getRecentSessions', () => {
    it('delegates to session repository', async () => {
      sessionRepo.findRecentSessions = jest.fn().mockResolvedValue([mockSession]);

      const result = await useCase.getRecentSessions(20);

      expect(sessionRepo.findRecentSessions).toHaveBeenCalledWith(20);
      expect(result).toEqual([mockSession]);
    });
  });

  describe('getAttemptsByVocabulary', () => {
    it('delegates to session repository', async () => {
      const mockAttempt = new ExerciseAttempt(
        'att-1', 'sess-1', 'v1', 'spelling',
        'Translate: красивый', 'beautiful', 'beautiful',
        true, null, 5, null, '2024-01-01T00:00:00.000Z',
      );
      sessionRepo.findAttemptsByVocabulary = jest.fn().mockResolvedValue([mockAttempt]);

      const result = await useCase.getAttemptsByVocabulary('v1');

      expect(sessionRepo.findAttemptsByVocabulary).toHaveBeenCalledWith('v1');
      expect(result).toEqual([mockAttempt]);
    });
  });

  describe('completeSession', () => {
    it('analyzes session, updates SM-2, and returns analysis', async () => {
      const result = await useCase.completeSession('sess-1');

      expect(sessionRepo.findAttemptsBySession).toHaveBeenCalledWith('sess-1');
      expect(llmService.analyzeSession).toHaveBeenCalled();
      expect(vocabRepo.updateSrs).toHaveBeenCalled();
      expect(sessionRepo.updateAttemptMnemonic).toHaveBeenCalledWith(
        'att-1',
        'Beauty is in the eye of the beholder',
      );
      expect(sessionRepo.completeSession).toHaveBeenCalled();
      expect(result.overallScore).toBe(100);
      expect(result.totalExercises).toBe(1);
      expect(result.correctCount).toBe(1);
    });
  });
});
