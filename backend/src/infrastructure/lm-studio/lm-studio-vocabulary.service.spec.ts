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
      structuringModel: 'qwen/qwen3.5-9b',
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

  it('throws on unparseable response', () => {
    expect(() => parseJsonResponse('no json here')).toThrow(
      /Failed to parse LLM response/,
    );
  });
});
