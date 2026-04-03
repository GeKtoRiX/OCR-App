import { PracticeUseCase } from './practice.use-case';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import {
  IPracticeSessionRepository,
  type CachedGeneratedExerciseSet,
} from '../../domain/ports/practice-session-repository.port';
import { IVocabularyLlmService } from '../../domain/ports/vocabulary-llm-service.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { PracticeSession } from '../../domain/entities/practice-session.entity';
import { ExerciseAttempt } from '../../domain/entities/exercise-attempt.entity';
import type { ExerciseType } from '../../domain/entities/exercise-attempt.entity';

const mockWord = new VocabularyWord(
  'v1', 'beautiful', 'word', 'красивый', 'en', 'ru',
  'The sunset was beautiful.', null,
  '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z',
  0, 2.5, 0, '2024-01-01T00:00:00.000Z',
);

const secondWord = new VocabularyWord(
  'v2', 'sunrise', 'word', 'рассвет', 'en', 'ru',
  'The sunrise was calm.', null,
  '2024-01-02T00:00:00.000Z', '2024-01-02T00:00:00.000Z',
  0, 2.5, 0, '2024-01-02T00:00:00.000Z',
);

const caseChangedWord = new VocabularyWord(
  'v1', 'Beautiful', 'word', 'КРАСИВЫЙ', 'EN', 'RU',
  'The sunset was BEAUTIFUL.', null,
  '2024-01-01T00:00:00.000Z', '2024-01-03T00:00:00.000Z',
  0, 2.5, 0, '2024-01-01T00:00:00.000Z',
);

const mockSession = new PracticeSession(
  'sess-1', '2024-01-01T00:00:00.000Z', null, 'en', 'ru', 0, 0, '{}',
);

const expectedExerciseOrder: ExerciseType[] = [
  'multiple_choice',
  'spelling',
  'context_sentence',
  'fill_blank',
];

describe('PracticeUseCase', () => {
  let useCase: PracticeUseCase;
  let vocabRepo: jest.Mocked<IVocabularyRepository>;
  let sessionRepo: jest.Mocked<IPracticeSessionRepository>;
  let llmService: jest.Mocked<IVocabularyLlmService>;

  beforeEach(() => {
    vocabRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findAll: jest.fn().mockResolvedValue([mockWord, secondWord]),
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([mockWord, secondWord]),
      findByWord: jest.fn(),
      findDueForReview: jest.fn().mockResolvedValue([mockWord]),
      updateSrs: jest.fn().mockResolvedValue(mockWord),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IVocabularyRepository>;

    sessionRepo = {
      createSession: jest.fn().mockResolvedValue(mockSession),
      completeSession: jest.fn().mockResolvedValue(mockSession),
      findSessionById: jest.fn().mockResolvedValue(mockSession),
      findRecentSessions: jest.fn().mockResolvedValue([]),
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
      findAttemptsByVocabulary: jest.fn().mockResolvedValue([]),
      findVocabularyStats: jest.fn().mockResolvedValue([
        { vocabularyId: 'v1', attemptCount: 0, incorrectCount: 0 },
        { vocabularyId: 'v2', attemptCount: 3, incorrectCount: 2 },
      ]),
      findGeneratedExerciseSets: jest.fn().mockResolvedValue([]),
      saveGeneratedExerciseSet: jest.fn().mockResolvedValue(undefined),
      updateAttemptMnemonic: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IPracticeSessionRepository>;

    llmService = {
      generateExercises: jest.fn().mockResolvedValue([
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'spelling',
          prompt: 'Translate: красивый',
          correctAnswer: 'beautiful',
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'context_sentence',
          prompt: 'Name the calm part of the day after night.',
          correctAnswer: 'sunrise',
        },
      ]),
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
      enrichDocumentCandidates: jest.fn(),
    } as unknown as jest.Mocked<IVocabularyLlmService>;

    useCase = new PracticeUseCase(vocabRepo, sessionRepo, llmService);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('startPractice', () => {
    it('fetches due words and returns exercises in type-first order (all words per type)', async () => {
      const result = await useCase.startPractice({});

      expect(vocabRepo.findDueForReview).toHaveBeenCalledWith(10, undefined, undefined);
      expect(sessionRepo.findGeneratedExerciseSets).toHaveBeenCalled();
      expect(llmService.generateExercises).toHaveBeenCalledWith([mockWord], 4);
      expect(sessionRepo.saveGeneratedExerciseSet).toHaveBeenCalledTimes(1);
      expect(result.sessionId).toBe('sess-1');
      expect(result.exercises).toHaveLength(4);
      expect(result.exercises.map((exercise) => exercise.exerciseType)).toEqual(expectedExerciseOrder);
      expect(result.exercises.every((exercise) => exercise.vocabularyId === 'v1')).toBe(true);
    });
  });

  describe('planPractice', () => {
    it('returns unseen words first in repository order', async () => {
      const result = await useCase.planPractice({
        targetLang: 'en',
        nativeLang: 'ru',
        wordLimit: 10,
      });

      expect(vocabRepo.findAll).toHaveBeenCalledWith('en', 'ru');
      expect(sessionRepo.findVocabularyStats).toHaveBeenCalledWith(['v1', 'v2']);
      expect(result.sessionId).toBe('sess-1');
      expect(result.initialBatchMode).toBe('unseen');
      expect(result.previewWords.map((word) => word.id)).toEqual(['v1']);
      expect(result.allWords).toHaveLength(2);
    });

    it('falls back to hardest words when there are no unseen words', async () => {
      sessionRepo.findVocabularyStats.mockResolvedValue([
        { vocabularyId: 'v1', attemptCount: 5, incorrectCount: 3 },
        { vocabularyId: 'v2', attemptCount: 4, incorrectCount: 1 },
      ]);

      const result = await useCase.planPractice({ wordLimit: 1 });

      expect(result.initialBatchMode).toBe('hardest');
      expect(result.previewWords).toHaveLength(1);
      expect(result.previewWords[0].id).toBe('v1');
    });

    it('throws when there are no vocabulary words', async () => {
      vocabRepo.findAll.mockResolvedValue([]);

      await expect(useCase.planPractice({})).rejects.toThrow(
        'No vocabulary words available',
      );
    });
  });

  describe('generatePracticeRound', () => {
    it('generates four exercises for one requested word in the exact locked order', async () => {
      vocabRepo.findByIds.mockResolvedValue([secondWord]);
      llmService.generateExercises.mockResolvedValue([
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'fill_blank',
          prompt: 'The ___ was calm.',
          correctAnswer: 'sunrise',
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'multiple_choice',
          prompt: 'Choose the word that best completes the sentence.\nThe ___ was calm.',
          correctAnswer: 'sunrise',
          options: ['harbor', 'sunrise', 'lantern', 'sunrize'],
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'context_sentence',
          prompt: 'Name the calm part of the day after night.',
          correctAnswer: 'sunrise',
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'spelling',
          prompt: 'Type the en word for "рассвет".',
          correctAnswer: 'sunrise',
        },
      ]);

      const result = await useCase.generatePracticeRound({
        sessionId: 'sess-1',
        vocabularyIds: ['v2'],
      });

      expect(sessionRepo.findSessionById).toHaveBeenCalledWith('sess-1');
      expect(vocabRepo.findByIds).toHaveBeenCalledWith(['v2']);
      expect(llmService.generateExercises).toHaveBeenCalledWith([secondWord], 4);
      expect(sessionRepo.saveGeneratedExerciseSet).toHaveBeenCalledWith(
        'v2',
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ exerciseType: 'multiple_choice' }),
          expect.objectContaining({ exerciseType: 'spelling' }),
          expect.objectContaining({ exerciseType: 'context_sentence' }),
          expect.objectContaining({ exerciseType: 'fill_blank' }),
        ]),
      );
      expect(result.exercises).toHaveLength(4);
      expect(result.exercises.map((exercise) => exercise.exerciseType)).toEqual(expectedExerciseOrder);
      expect(result.exercises.map((exercise) => exercise.vocabularyId)).toEqual([
        'v2',
        'v2',
        'v2',
        'v2',
      ]);
    });

    it('preserves grouped per-word ordering for multiple requested words', async () => {
      vocabRepo.findByIds.mockResolvedValue([mockWord, secondWord]);
      llmService.generateExercises.mockResolvedValue([
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'fill_blank',
          prompt: 'The ___ was calm.',
          correctAnswer: 'sunrise',
        },
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'fill_blank',
          prompt: 'The sunset was ___.',
          correctAnswer: 'beautiful',
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'multiple_choice',
          prompt: 'Choose the word that best completes the sentence.\nThe ___ was calm.',
          correctAnswer: 'sunrise',
          options: ['harbor', 'sunrise', 'lantern', 'sunrize'],
        },
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'multiple_choice',
          prompt: 'Choose the word that best completes the sentence.\nThe sunset was ___.',
          correctAnswer: 'beautiful',
          options: ['beautiful', 'beautifull', 'sunrise', 'harbor'],
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'spelling',
          prompt: 'Type the en word for "рассвет".',
          correctAnswer: 'sunrise',
        },
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'spelling',
          prompt: 'Type the en word for "красивый".',
          correctAnswer: 'beautiful',
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'context_sentence',
          prompt: 'Name the calm part of the day after night.',
          correctAnswer: 'sunrise',
        },
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'context_sentence',
          prompt: 'Name a word meaning very attractive.',
          correctAnswer: 'beautiful',
        },
      ]);

      const result = await useCase.generatePracticeRound({
        sessionId: 'sess-1',
        vocabularyIds: ['v1', 'v2'],
      });

      expect(result.exercises).toHaveLength(8);
      expect(result.exercises.map((exercise) => `${exercise.vocabularyId}:${exercise.exerciseType}`)).toEqual([
        'v1:multiple_choice',
        'v2:multiple_choice',
        'v1:spelling',
        'v2:spelling',
        'v1:context_sentence',
        'v2:context_sentence',
        'v1:fill_blank',
        'v2:fill_blank',
      ]);
    });

    it('reorders shuffled generator output into the locked exercise sequence', async () => {
      vocabRepo.findByIds.mockResolvedValue([mockWord]);
      llmService.generateExercises.mockResolvedValue([
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'fill_blank',
          prompt: 'The sunset was ___.',
          correctAnswer: 'beautiful',
        },
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'context_sentence',
          prompt: 'Name a word meaning very attractive.',
          correctAnswer: 'beautiful',
        },
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'multiple_choice',
          prompt: 'Choose the word that best completes the sentence.\nThe sunset was ___.',
          correctAnswer: 'beautiful',
          options: ['sunrise', 'beautiful', 'harbor', 'beautifull'],
        },
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'spelling',
          prompt: 'Type the en word for "красивый".',
          correctAnswer: 'beautiful',
        },
      ]);

      const result = await useCase.generatePracticeRound({
        sessionId: 'sess-1',
        vocabularyIds: ['v1'],
      });

      expect(result.exercises.map((exercise) => exercise.exerciseType)).toEqual(expectedExerciseOrder);
    });

    it('fills missing exercise types with deterministic fallbacks in the correct slots', async () => {
      vocabRepo.findByIds.mockResolvedValue([mockWord]);
      llmService.generateExercises.mockResolvedValue([
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'spelling',
          prompt: 'Type the en word for "красивый".',
          correctAnswer: 'beautiful',
        },
      ]);

      const result = await useCase.generatePracticeRound({
        sessionId: 'sess-1',
        vocabularyIds: ['v1'],
      });

      expect(result.exercises).toHaveLength(4);
      expect(result.exercises.map((exercise) => exercise.exerciseType)).toEqual(expectedExerciseOrder);
      expect(result.exercises[0].options).toHaveLength(4);
      expect(result.exercises[0].options).toContain('beautiful');
      expect(result.exercises[2].prompt).toContain('Translation: "красивый"');
      expect(result.exercises[3].prompt).toContain('___');
    });

    it('throws when the session does not exist', async () => {
      sessionRepo.findSessionById.mockResolvedValue(null);

      await expect(useCase.generatePracticeRound({
        sessionId: 'missing',
        vocabularyIds: ['v1'],
      })).rejects.toThrow('Practice session not found');
    });

    it('reuses a valid cached set without calling the LLM', async () => {
      const cachedSet: CachedGeneratedExerciseSet = {
        setId: 'set-1',
        vocabularyId: 'v2',
        contentSignature: 'sig-1',
        createdAt: '2024-01-04T00:00:00.000Z',
        exercises: [
          {
            exerciseType: 'multiple_choice',
            prompt: 'Cached multiple choice',
            correctAnswer: 'sunrise',
            options: ['harbor', 'sunrise', 'lantern', 'sunrize'],
          },
          {
            exerciseType: 'spelling',
            prompt: 'Cached spelling',
            correctAnswer: 'sunrise',
          },
          {
            exerciseType: 'context_sentence',
            prompt: 'Cached context',
            correctAnswer: 'sunrise',
          },
          {
            exerciseType: 'fill_blank',
            prompt: 'Cached blank',
            correctAnswer: 'sunrise',
          },
        ],
      };
      vocabRepo.findByIds.mockResolvedValue([secondWord]);
      sessionRepo.findGeneratedExerciseSets.mockResolvedValue([cachedSet]);

      const result = await useCase.generatePracticeRound({
        sessionId: 'sess-1',
        vocabularyIds: ['v2'],
      });

      expect(llmService.generateExercises).not.toHaveBeenCalled();
      expect(sessionRepo.saveGeneratedExerciseSet).not.toHaveBeenCalled();
      expect(result.exercises.map((exercise) => exercise.prompt)).toEqual([
        'Cached multiple choice',
        'Cached spelling',
        'Cached context',
        'Cached blank',
      ]);
    });

    it('calls the LLM only for uncached words in a mixed batch', async () => {
      const cachedSet: CachedGeneratedExerciseSet = {
        setId: 'set-1',
        vocabularyId: 'v1',
        contentSignature: 'sig-1',
        createdAt: '2024-01-04T00:00:00.000Z',
        exercises: [
          {
            exerciseType: 'multiple_choice',
            prompt: 'Cached beautiful multiple choice',
            correctAnswer: 'beautiful',
            options: ['sunrise', 'beautiful', 'harbor', 'beautifull'],
          },
          {
            exerciseType: 'spelling',
            prompt: 'Cached beautiful spelling',
            correctAnswer: 'beautiful',
          },
          {
            exerciseType: 'context_sentence',
            prompt: 'Cached beautiful context',
            correctAnswer: 'beautiful',
          },
          {
            exerciseType: 'fill_blank',
            prompt: 'Cached beautiful blank',
            correctAnswer: 'beautiful',
          },
        ],
      };
      sessionRepo.findGeneratedExerciseSets.mockResolvedValue([cachedSet]);
      llmService.generateExercises.mockResolvedValue([
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'multiple_choice',
          prompt: 'Generated sunrise multiple choice',
          correctAnswer: 'sunrise',
          options: ['sunrise', 'sunrize', 'harbor', 'lantern'],
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'spelling',
          prompt: 'Generated sunrise spelling',
          correctAnswer: 'sunrise',
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'context_sentence',
          prompt: 'Generated sunrise context',
          correctAnswer: 'sunrise',
        },
        {
          vocabularyId: 'v2',
          word: 'sunrise',
          exerciseType: 'fill_blank',
          prompt: 'Generated sunrise blank',
          correctAnswer: 'sunrise',
        },
      ]);

      const result = await useCase.generatePracticeRound({
        sessionId: 'sess-1',
        vocabularyIds: ['v1', 'v2'],
      });

      expect(llmService.generateExercises).toHaveBeenCalledWith([secondWord], 4);
      expect(sessionRepo.saveGeneratedExerciseSet).toHaveBeenCalledTimes(1);
      expect(result.exercises.map((exercise) => `${exercise.vocabularyId}:${exercise.prompt}`)).toEqual([
        'v1:Cached beautiful multiple choice',
        'v2:Generated sunrise multiple choice',
        'v1:Cached beautiful spelling',
        'v2:Generated sunrise spelling',
        'v1:Cached beautiful context',
        'v2:Generated sunrise context',
        'v1:Cached beautiful blank',
        'v2:Generated sunrise blank',
      ]);
    });

    it('reuses cache when a word changed only by letter case', async () => {
      const cachedSet: CachedGeneratedExerciseSet = {
        setId: 'set-1',
        vocabularyId: 'v1',
        contentSignature: 'sig-1',
        createdAt: '2024-01-04T00:00:00.000Z',
        exercises: [
          {
            exerciseType: 'multiple_choice',
            prompt: 'Choose the word that best completes the sentence.\nThe sunset was ___.',
            correctAnswer: 'beautiful',
            options: ['sunrise', 'beautiful', 'harbor', 'beautifull'],
          },
          {
            exerciseType: 'spelling',
            prompt: 'Type the en word for "красивый".',
            correctAnswer: 'beautiful',
          },
          {
            exerciseType: 'context_sentence',
            prompt: 'Name a word meaning very attractive.',
            correctAnswer: 'beautiful',
          },
          {
            exerciseType: 'fill_blank',
            prompt: 'The sunset was ___.',
            correctAnswer: 'beautiful',
          },
        ],
      };
      vocabRepo.findByIds.mockResolvedValue([caseChangedWord]);
      sessionRepo.findGeneratedExerciseSets.mockResolvedValue([cachedSet]);

      const result = await useCase.generatePracticeRound({
        sessionId: 'sess-1',
        vocabularyIds: ['v1'],
      });

      expect(llmService.generateExercises).not.toHaveBeenCalled();
      expect(result.exercises.every((exercise) => exercise.correctAnswer === 'Beautiful')).toBe(true);
      expect(result.exercises[0].options).toContain('Beautiful');
    });
  });

  describe('submitAnswer', () => {
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
      expect(sessionRepo.createAttempt).toHaveBeenCalled();
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
