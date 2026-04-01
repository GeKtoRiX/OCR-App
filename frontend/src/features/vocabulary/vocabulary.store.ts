import { create } from 'zustand';
import {
  addVocabularyWord,
  deleteVocabularyWord,
  fetchDueVocabulary,
  fetchVocabulary,
  updateVocabularyWord,
} from '../../shared/api';
import { toErrorMessage } from '../../shared/lib/errors';
import type { LanguagePair, VocabularyWord, VocabType } from '../../shared/types';

interface VocabularyState {
  words: VocabularyWord[];
  loading: boolean;
  error: string | null;
  langPair: LanguagePair;
  dueCount: number;
  existingWordsSet: Set<string>;
}

interface VocabularyActions {
  load(): Promise<void>;
  refresh(): Promise<void>;
  addWord(
    word: string,
    vocabType: VocabType,
    translation: string,
    contextSentence: string,
    sourceDocumentId?: string,
  ): Promise<VocabularyWord | null>;
  removeWord(id: string): Promise<boolean>;
  updateWord(
    id: string,
    word: string,
    translation: string,
  ): Promise<VocabularyWord | null>;
  setLangPair(langPair: LanguagePair): void;
}

export type VocabularyStore = VocabularyState & VocabularyActions;

const initialLangPair: LanguagePair = {
  targetLang: 'en',
  nativeLang: 'ru',
};

const initialState: VocabularyState = {
  words: [],
  loading: true,
  error: null,
  langPair: initialLangPair,
  dueCount: 0,
  existingWordsSet: new Set(),
};

function buildExistingWordsSet(words: VocabularyWord[]) {
  return new Set(words.map((word) => word.word.toLowerCase()));
}

export const useVocabularyStore = create<VocabularyStore>((set, get) => {
  const loadForPair = async (langPair: LanguagePair) => {
    set({ loading: true });

    try {
      const [words, dueWords] = await Promise.all([
        fetchVocabulary(langPair.targetLang, langPair.nativeLang),
        fetchDueVocabulary(langPair.targetLang, langPair.nativeLang),
      ]);

      set({
        words,
        dueCount: dueWords.length,
        existingWordsSet: buildExistingWordsSet(words),
        loading: false,
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        error: toErrorMessage(error, 'Failed to load vocabulary'),
      });
    }
  };

  return {
    ...initialState,

    async load() {
      await loadForPair(get().langPair);
    },

    async refresh() {
      await loadForPair(get().langPair);
    },

    async addWord(word, vocabType, translation, contextSentence, sourceDocumentId) {
      try {
        const { langPair, words, dueCount } = get();
        const created = await addVocabularyWord({
          word,
          vocabType,
          translation,
          targetLang: langPair.targetLang,
          nativeLang: langPair.nativeLang,
          contextSentence,
          sourceDocumentId,
        });

        const nextWords = [created, ...words];

        set({
          words: nextWords,
          dueCount: dueCount + 1,
          existingWordsSet: buildExistingWordsSet(nextWords),
          error: null,
        });

        return created;
      } catch (error) {
        set({
          error: toErrorMessage(error, 'Failed to add word'),
        });
        return null;
      }
    },

    async removeWord(id) {
      try {
        await deleteVocabularyWord(id);
        set((state) => {
          const words = state.words.filter((word) => word.id !== id);

          return {
            words,
            existingWordsSet: buildExistingWordsSet(words),
            error: null,
          };
        });
        return true;
      } catch (error) {
        set({
          error: toErrorMessage(error, 'Failed to delete word'),
        });
        return false;
      }
    },

    async updateWord(id, word, translation) {
      try {
        const existing = get().words.find((w) => w.id === id);
        const contextSentence = existing?.contextSentence ?? '';
        const updated = await updateVocabularyWord(id, translation, contextSentence, word);
        set((state) => {
          const words = state.words.map((word) => (word.id === id ? updated : word));

          return {
            words,
            existingWordsSet: buildExistingWordsSet(words),
            error: null,
          };
        });
        return updated;
      } catch (error) {
        set({
          error: toErrorMessage(error, 'Failed to update word'),
        });
        return null;
      }
    },

    setLangPair(langPair) {
      set({ langPair });
      void loadForPair(langPair);
    },
  };
});
