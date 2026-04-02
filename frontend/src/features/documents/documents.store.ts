import { create } from 'zustand';
import {
  confirmDocumentVocabulary,
  createDocument,
  deleteDocument,
  fetchDocuments,
  prepareDocumentVocabulary,
  updateDocument,
} from '../../shared/api';
import { removeAndReselect } from '../../shared/lib/collection';
import { toErrorMessage } from '../../shared/lib/errors';
import type {
  ConfirmDocumentVocabularyResult,
  DocumentCandidatePos,
  DocumentVocabCandidate,
  SavedDocument,
  VocabType,
} from '../../shared/types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type VocabularyReviewStatus = 'idle' | 'preparing' | 'reviewing' | 'ready' | 'saving' | 'saved' | 'error';

interface DocumentsState {
  documents: SavedDocument[];
  loading: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  activeSavedId: string | null;
  vocabularyReviewStatus: VocabularyReviewStatus;
  vocabularyReviewDocumentId: string | null;
  vocabularyReviewCandidates: DocumentVocabCandidate[];
  vocabularyReviewError: string | null;
  vocabularyReviewLlmApplied: boolean;
  vocabularyConfirmResult: ConfirmDocumentVocabularyResult | null;
}

interface DocumentsActions {
  load(): Promise<void>;
  save(input: {
    markdown?: string;
    richTextHtml?: string | null;
    filename: string;
  }): Promise<SavedDocument | null>;
  update(
    id: string,
    input: {
      markdown?: string;
      richTextHtml?: string | null;
    },
  ): Promise<SavedDocument | null>;
  remove(id: string): Promise<boolean>;
  selectDocument(id: string): void;
  clearSelection(): void;
  prepareVocabulary(
    id: string,
    options: { llmReview: boolean; targetLang: string; nativeLang: string; selectedIds?: string[] },
  ): Promise<DocumentVocabCandidate[]>;
  confirmVocabulary(
    id: string,
    options: {
      targetLang: string;
      nativeLang: string;
      items: Array<{
        candidateId: string;
        word: string;
        vocabType: VocabType;
        pos?: DocumentCandidatePos;
        translation: string;
        contextSentence: string;
      }>;
    },
  ): Promise<ConfirmDocumentVocabularyResult | null>;
  clearVocabularyReview(): void;
}

export type DocumentsStore = DocumentsState & DocumentsActions;

const initialState: DocumentsState = {
  documents: [],
  loading: true,
  saveStatus: 'idle',
  error: null,
  activeSavedId: null,
  vocabularyReviewStatus: 'idle',
  vocabularyReviewDocumentId: null,
  vocabularyReviewCandidates: [],
  vocabularyReviewError: null,
  vocabularyReviewLlmApplied: false,
  vocabularyConfirmResult: null,
};

export const useDocumentsStore = create<DocumentsStore>((set, get) => {
  // Timer as closure variable — not part of Zustand state,
  // so store resets (e.g. in tests) don't leave dangling timers.
  let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleSaveStatusReset() {
    if (saveStatusTimer !== null) {
      clearTimeout(saveStatusTimer);
    }
    saveStatusTimer = setTimeout(() => {
      useDocumentsStore.setState({ saveStatus: 'idle' });
      saveStatusTimer = null;
    }, 2000);
  }

  return {
    ...initialState,

    async load() {
      set({ loading: true });

      try {
        const documents = await fetchDocuments();
        set({ documents, loading: false, error: null });
      } catch (error) {
        set({
          loading: false,
          error: toErrorMessage(error, 'Failed to load documents'),
        });
      }
    },

    async save(input) {
      set({ saveStatus: 'saving' });

      try {
        const document = await createDocument(input);
        set((state) => ({
          documents: [document, ...state.documents],
          saveStatus: 'saved',
          error: null,
          activeSavedId: document.id,
        }));
        scheduleSaveStatusReset();
        return document;
      } catch (error) {
        set({
          saveStatus: 'error',
          error: toErrorMessage(error, 'Failed to save'),
        });
        return null;
      }
    },

    async update(id, input) {
      try {
        const document = await updateDocument(id, input);
        set((state) => ({
          documents: state.documents.map((item) => (item.id === id ? document : item)),
          error: null,
        }));
        return document;
      } catch (error) {
        set({ error: toErrorMessage(error, 'Failed to update') });
        return null;
      }
    },

    async remove(id) {
      try {
        await deleteDocument(id);
        set((state) => {
          const { items: documents, activeId: activeSavedId } = removeAndReselect(
            state.documents,
            id,
            state.activeSavedId,
          );

          return {
            documents,
            activeSavedId,
            error: null,
          };
        });
        return true;
      } catch (error) {
        set({ error: toErrorMessage(error, 'Failed to delete') });
        return false;
      }
    },

    selectDocument(id) {
      if (get().activeSavedId === id) return;
      set({ activeSavedId: id });
    },

    clearSelection() {
      set({ activeSavedId: null });
    },

    async prepareVocabulary(id, options) {
      set({
        vocabularyReviewStatus: options.llmReview ? 'reviewing' : 'preparing',
        vocabularyReviewDocumentId: id,
        vocabularyReviewError: null,
        vocabularyConfirmResult: null,
      });

      try {
        if (options.llmReview) {
          const reviewed = await prepareDocumentVocabulary({
            id,
            llmReview: true,
            targetLang: options.targetLang,
            nativeLang: options.nativeLang,
            selectedCandidateIds: options.selectedIds,
          });

          set((state) => ({
            documents: state.documents.map((document) =>
              document.id === id ? reviewed.document : document,
            ),
            vocabularyReviewCandidates: reviewed.candidates,
            vocabularyReviewStatus: 'ready',
            vocabularyReviewLlmApplied: reviewed.llmReviewApplied,
            vocabularyReviewError: null,
          }));

          return reviewed.candidates;
        }

        const base = await prepareDocumentVocabulary({
          id,
          llmReview: false,
          targetLang: options.targetLang,
          nativeLang: options.nativeLang,
        });

        set((state) => ({
          documents: state.documents.map((document) =>
            document.id === id ? base.document : document,
          ),
          vocabularyReviewCandidates: base.candidates,
          vocabularyReviewStatus: 'ready',
          vocabularyReviewLlmApplied: false,
          vocabularyReviewError: null,
        }));

        return base.candidates;
      } catch (error) {
        set({
          vocabularyReviewStatus: 'error',
          vocabularyReviewError: toErrorMessage(error, 'Failed to prepare vocabulary'),
        });
        return [];
      }
    },

    async confirmVocabulary(id, options) {
      set({
        vocabularyReviewStatus: 'saving',
        vocabularyReviewError: null,
      });

      try {
        const result = await confirmDocumentVocabulary({
          id,
          targetLang: options.targetLang,
          nativeLang: options.nativeLang,
          items: options.items,
        });

        set({
          vocabularyReviewStatus: 'saved',
          vocabularyConfirmResult: result,
          vocabularyReviewError: null,
        });

        return result;
      } catch (error) {
        set({
          vocabularyReviewStatus: 'error',
          vocabularyReviewError: toErrorMessage(error, 'Failed to save vocabulary'),
        });
        return null;
      }
    },

    clearVocabularyReview() {
      set({
        vocabularyReviewStatus: 'idle',
        vocabularyReviewDocumentId: null,
        vocabularyReviewCandidates: [],
        vocabularyReviewError: null,
        vocabularyReviewLlmApplied: false,
        vocabularyConfirmResult: null,
      });
    },
  };
});
