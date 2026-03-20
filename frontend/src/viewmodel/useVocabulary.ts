import { useState, useCallback, useEffect } from 'react';
import type { VocabularyWord, VocabType, LanguagePair } from '../model/types';
import {
  fetchVocabulary,
  addVocabularyWord,
  updateVocabularyWord,
  deleteVocabularyWord,
  fetchDueVocabulary,
} from '../model/api';

export function useVocabulary() {
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [langPair, setLangPair] = useState<LanguagePair>({
    targetLang: 'en',
    nativeLang: 'ru',
  });
  const [dueCount, setDueCount] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [all, due] = await Promise.all([
        fetchVocabulary(langPair.targetLang, langPair.nativeLang),
        fetchDueVocabulary(),
      ]);
      setWords(all);
      setDueCount(due.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load vocabulary');
    } finally {
      setLoading(false);
    }
  }, [langPair]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addWord = useCallback(
    async (
      word: string,
      vocabType: VocabType,
      translation: string,
      contextSentence: string,
      sourceDocumentId?: string,
    ) => {
      try {
        const created = await addVocabularyWord({
          word,
          vocabType,
          translation,
          targetLang: langPair.targetLang,
          nativeLang: langPair.nativeLang,
          contextSentence,
          sourceDocumentId,
        });
        setWords((prev) => [created, ...prev]);
        setDueCount((c) => c + 1);
        setError(null);
        return created;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to add word';
        setError(msg);
        return null;
      }
    },
    [langPair],
  );

  const removeWord = useCallback(async (id: string) => {
    try {
      await deleteVocabularyWord(id);
      setWords((prev) => prev.filter((w) => w.id !== id));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete word');
      return false;
    }
  }, []);

  const updateWord = useCallback(
    async (id: string, translation: string, contextSentence: string) => {
      try {
        const updated = await updateVocabularyWord(id, translation, contextSentence);
        setWords((prev) => prev.map((w) => (w.id === id ? updated : w)));
        return updated;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update word');
        return null;
      }
    },
    [],
  );

  const existingWordsSet = new Set(words.map((w) => w.word.toLowerCase()));

  return {
    words,
    loading,
    error,
    langPair,
    setLangPair,
    dueCount,
    addWord,
    removeWord,
    updateWord,
    refresh,
    existingWordsSet,
  };
}
