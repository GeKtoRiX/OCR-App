import { LMStudioVocabularyService, parseJsonResponse } from './lm-studio-vocabulary.service';
import { LMStudioClient } from './lm-studio.client';
import { LMStudioConfig } from '../config/lm-studio.config';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { ExerciseAttempt } from '../../domain/entities/exercise-attempt.entity';

const mockWord = new VocabularyWord(
  'v1', 'beautiful', 'word', 'красивый', 'en', 'ru',
  'The sunset was beautiful.', null,
  '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z',
  0, 2.5, 0, '2024-01-01T00:00:00.000Z',
);

const mockAttempt = new ExerciseAttempt(
  'att-1', 'sess-1', 'v1', 'spelling',
  'Translate: красивый', 'beautiful', 'beatiful',
  false, 'middle', 1, null, '2024-01-01T00:00:00.000Z',
);

describe('LMStudioVocabularyService', () => {
  let service: LMStudioVocabularyService;
  let client: jest.Mocked<LMStudioClient>;

  beforeEach(() => {
    client = {
      chatCompletion: jest.fn(),
    } as unknown as jest.Mocked<LMStudioClient>;
    const config = {
      vocabularyModel: 'qwen/qwen3.5-9b',
    } as LMStudioConfig;
    service = new LMStudioVocabularyService(client, config);
  });

  describe('generateExercises', () => {
    it('calls chatCompletion and parses exercises', async () => {
      const exercises = [
        {
          vocabularyId: 'v1',
          word: 'beautiful',
          exerciseType: 'spelling',
          prompt: 'Translate: красивый',
          correctAnswer: 'beautiful',
        },
      ];
      client.chatCompletion.mockResolvedValue(JSON.stringify(exercises));

      const result = await service.generateExercises([mockWord], 2);

      expect(client.chatCompletion).toHaveBeenCalledTimes(1);
      const callArgs = client.chatCompletion.mock.calls[0][0];
      expect(callArgs.model).toBe('qwen/qwen3.5-9b');
      expect(callArgs.temperature).toBe(0.7);
      expect(result).toEqual(exercises);
    });

    it('parses exercises from code-fenced response', async () => {
      const exercises = [{ vocabularyId: 'v1', word: 'test', exerciseType: 'spelling', prompt: 'p', correctAnswer: 'test' }];
      client.chatCompletion.mockResolvedValue('```json\n' + JSON.stringify(exercises) + '\n```');

      const result = await service.generateExercises([mockWord], 1);

      expect(result).toEqual(exercises);
    });

    it('falls back to default language hints when the vocabulary list is empty', async () => {
      client.chatCompletion.mockResolvedValue('[]');

      await service.generateExercises([], 1);

      const callArgs = client.chatCompletion.mock.calls[0][0];
      expect(callArgs.messages[1].content).toContain('target language: en');
      expect(callArgs.messages[1].content).toContain('native language: ru');
    });
  });

  describe('analyzeSession', () => {
    it('calls chatCompletion and parses analysis', async () => {
      const analysis = {
        overallScore: 50,
        summary: 'Needs work.',
        wordAnalyses: [{
          vocabularyId: 'v1',
          word: 'beautiful',
          errorPattern: "Drops the 'u'",
          mnemonicSentence: 'Big Elephants Are Ugly',
          difficultyAssessment: 'hard',
          suggestedFocus: "Practice 'eau'",
        }],
      };
      client.chatCompletion.mockResolvedValue(JSON.stringify(analysis));

      const result = await service.analyzeSession([mockWord], [mockAttempt]);

      expect(client.chatCompletion).toHaveBeenCalledTimes(1);
      const callArgs = client.chatCompletion.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.3);
      expect(result.overallScore).toBe(50);
      expect(result.wordAnalyses).toHaveLength(1);
    });

    it('renders correct attempts with Yes and N/A in the analysis prompt', async () => {
      const correctAttempt = new ExerciseAttempt(
        'att-2',
        'sess-1',
        'v1',
        'spelling',
        'Translate: красивый',
        'beautiful',
        'beautiful',
        true,
        null,
        5,
        null,
        '2024-01-01T00:00:00.000Z',
      );
      client.chatCompletion.mockResolvedValue(
        JSON.stringify({
          overallScore: 100,
          summary: 'Perfect!',
          wordAnalyses: [],
        }),
      );

      await service.analyzeSession([mockWord], [correctAttempt]);

      const callArgs = client.chatCompletion.mock.calls[0][0];
      expect(callArgs.messages[1].content).toContain('| Yes | N/A |');
    });
  });
});

describe('parseJsonResponse', () => {
  it('parses direct JSON', () => {
    expect(parseJsonResponse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses JSON from code fences', () => {
    expect(parseJsonResponse('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON from plain code fences', () => {
    expect(parseJsonResponse('```\n[1]\n```')).toEqual([1]);
  });

  it('extracts JSON from surrounding text', () => {
    expect(parseJsonResponse('Here is the result:\n{"x": 2}\nDone.')).toEqual({ x: 2 });
  });

  it('falls back from invalid fenced JSON to the first valid JSON object', () => {
    expect(
      parseJsonResponse('```json\nnot valid json\n```\nResult: {"x": 2}'),
    ).toEqual({ x: 2 });
  });

  it('throws when a detected JSON fragment is malformed', () => {
    expect(() => parseJsonResponse('before {not-json} after')).toThrow(
      /Failed to parse LLM response/,
    );
  });

  it('throws on unparseable response', () => {
    expect(() => parseJsonResponse('no json here')).toThrow(
      /Failed to parse LLM response/,
    );
  });
});
