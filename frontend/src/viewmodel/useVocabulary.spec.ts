import { renderHook, act } from '@testing-library/react';
import { useVocabulary } from './useVocabulary';
import * as api from '../model/api';
import type { VocabularyWord } from '../model/types';

vi.mock('../model/api');

const mockWord: VocabularyWord = {
  id: 'v1',
  word: 'beautiful',
  vocabType: 'word',
  translation: 'красивый',
  targetLang: 'en',
  nativeLang: 'ru',
  contextSentence: 'The sunset was beautiful.',
  sourceDocumentId: null,
  intervalDays: 0,
  easinessFactor: 2.5,
  repetitions: 0,
  nextReviewAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('useVocabulary', () => {
  beforeEach(() => {
    vi.mocked(api.fetchVocabulary).mockResolvedValue([mockWord]);
    vi.mocked(api.fetchDueVocabulary).mockResolvedValue([mockWord]);
    vi.mocked(api.addVocabularyWord).mockResolvedValue(mockWord);
    vi.mocked(api.deleteVocabularyWord).mockResolvedValue();
    vi.mocked(api.updateVocabularyWord).mockResolvedValue(mockWord);
  });

  it('loads vocabulary on mount', async () => {
    const { result } = renderHook(() => useVocabulary());

    await act(async () => {});

    expect(result.current.words).toHaveLength(1);
    expect(result.current.dueCount).toBe(1);
    expect(result.current.loading).toBe(false);
  });

  it('adds a word', async () => {
    const { result } = renderHook(() => useVocabulary());
    await act(async () => {});

    let created: VocabularyWord | null = null;
    await act(async () => {
      created = await result.current.addWord('test', 'word', 'тест', 'context');
    });

    expect(created).not.toBeNull();
    expect(api.addVocabularyWord).toHaveBeenCalled();
  });

  it('removes a word', async () => {
    const { result } = renderHook(() => useVocabulary());
    await act(async () => {});

    let deleted: boolean = false;
    await act(async () => {
      deleted = await result.current.removeWord('v1');
    });

    expect(deleted).toBe(true);
    expect(result.current.words).toHaveLength(0);
  });

  it('exposes existingWordsSet', async () => {
    const { result } = renderHook(() => useVocabulary());
    await act(async () => {});

    expect(result.current.existingWordsSet.has('beautiful')).toBe(true);
    expect(result.current.existingWordsSet.has('missing')).toBe(false);
  });

  it('sets error on API failure', async () => {
    vi.mocked(api.fetchVocabulary).mockRejectedValue(new Error('Network'));

    const { result } = renderHook(() => useVocabulary());
    await act(async () => {});

    expect(result.current.error).toBe('Network');
  });
});
