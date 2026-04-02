import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVocabularyStore } from './vocabulary.store';
import {
  addVocabularyWord,
  deleteVocabularyWord,
  fetchDueVocabulary,
  fetchVocabulary,
  updateVocabularyWord,
} from '../../shared/api';

vi.mock('../../shared/api', () => ({
  addVocabularyWord: vi.fn(),
  deleteVocabularyWord: vi.fn(),
  fetchDueVocabulary: vi.fn(),
  fetchVocabulary: vi.fn(),
  updateVocabularyWord: vi.fn(),
}));

const mockFetchVocabulary = vi.mocked(fetchVocabulary);
const mockFetchDueVocabulary = vi.mocked(fetchDueVocabulary);
const mockAddVocabularyWord = vi.mocked(addVocabularyWord);
const mockDeleteVocabularyWord = vi.mocked(deleteVocabularyWord);
const mockUpdateVocabularyWord = vi.mocked(updateVocabularyWord);

describe('useVocabularyStore', () => {
  beforeEach(() => {
    useVocabularyStore.setState({
      words: [],
      loading: true,
      error: null,
      langPair: { targetLang: 'en', nativeLang: 'ru' },
      dueCount: 0,
      existingWordsSet: new Set<string>(),
    });
    vi.clearAllMocks();
  });

  it('load() fetches words and due count', async () => {
    const words = [
      {
        id: 'w1',
        word: 'Hello',
        vocabType: 'word' as const,
        translation: 'привет',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'Hello there.',
        sourceDocumentId: null,
        intervalDays: 1,
        easinessFactor: 2.5,
        repetitions: 1,
        nextReviewAt: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    mockFetchVocabulary.mockResolvedValue(words);
    mockFetchDueVocabulary.mockResolvedValue(words);

    await useVocabularyStore.getState().load();

    expect(mockFetchVocabulary).toHaveBeenCalledWith('en', 'ru');
    expect(useVocabularyStore.getState().words).toEqual(words);
    expect(useVocabularyStore.getState().dueCount).toBe(1);
    expect(useVocabularyStore.getState().existingWordsSet.has('hello')).toBe(true);
  });

  it('setLangPair() updates state and loads with the new pair', async () => {
    mockFetchVocabulary.mockResolvedValue([]);
    mockFetchDueVocabulary.mockResolvedValue([]);

    useVocabularyStore.getState().setLangPair({ targetLang: 'de', nativeLang: 'en' });
    await Promise.resolve();
    await Promise.resolve();

    expect(useVocabularyStore.getState().langPair).toEqual({
      targetLang: 'de',
      nativeLang: 'en',
    });
    expect(mockFetchVocabulary).toHaveBeenCalledWith('de', 'en');
  });

  it('addWord() prepends the created word and updates the existingWordsSet', async () => {
    const created = {
      id: 'w1',
      word: 'Hello',
      vocabType: 'word' as const,
      translation: 'привет',
      targetLang: 'en',
      nativeLang: 'ru',
      contextSentence: 'Hello there.',
      sourceDocumentId: null,
      intervalDays: 1,
      easinessFactor: 2.5,
      repetitions: 1,
      nextReviewAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    mockAddVocabularyWord.mockResolvedValue(created);

    await useVocabularyStore.getState().addWord('Hello', 'word', 'привет', 'Hello there.');

    expect(useVocabularyStore.getState().words).toEqual([created]);
    expect(useVocabularyStore.getState().dueCount).toBe(1);
    expect(useVocabularyStore.getState().existingWordsSet.has('hello')).toBe(true);
  });

  it('removeWord() removes the matching word', async () => {
    useVocabularyStore.setState({
      words: [
        {
          id: 'w1',
          word: 'Hello',
          vocabType: 'word',
          translation: 'привет',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: 'Hello there.',
          sourceDocumentId: null,
          intervalDays: 1,
          easinessFactor: 2.5,
          repetitions: 1,
          nextReviewAt: '2024-01-01T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      existingWordsSet: new Set(['hello']),
      loading: false,
      error: null,
      langPair: { targetLang: 'en', nativeLang: 'ru' },
      dueCount: 1,
    });
    mockDeleteVocabularyWord.mockResolvedValue(undefined);

    await useVocabularyStore.getState().removeWord('w1');

    expect(useVocabularyStore.getState().words).toEqual([]);
    expect(useVocabularyStore.getState().existingWordsSet.has('hello')).toBe(false);
  });

  it('updateWord() replaces the matching word', async () => {
    const original = {
      id: 'w1',
      word: 'Hello',
      vocabType: 'word' as const,
      translation: 'привет',
      targetLang: 'en',
      nativeLang: 'ru',
      contextSentence: 'Hello there.',
      sourceDocumentId: null,
      intervalDays: 1,
      easinessFactor: 2.5,
      repetitions: 1,
      nextReviewAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    const updated = { ...original, translation: 'здравствуйте' };
    useVocabularyStore.setState({
      words: [original],
      existingWordsSet: new Set(['hello']),
      loading: false,
      error: null,
      langPair: { targetLang: 'en', nativeLang: 'ru' },
      dueCount: 1,
    });
    mockUpdateVocabularyWord.mockResolvedValue(updated);

    await useVocabularyStore.getState().updateWord(
      'w1',
      'Hello',
      'здравствуйте',
      'Hello there.',
      'word',
      undefined,
    );

    expect(useVocabularyStore.getState().words).toEqual([updated]);
  });
});
