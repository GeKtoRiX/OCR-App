import { create } from 'zustand';
import {
  createDocument,
  deleteDocument,
  fetchDocuments,
  updateDocument,
} from '../../shared/api';
import type { SavedDocument } from '../../shared/types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface DocumentsState {
  documents: SavedDocument[];
  loading: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  activeSavedId: string | null;
}

interface DocumentsActions {
  load(): Promise<void>;
  save(markdown: string, filename: string): Promise<SavedDocument | null>;
  update(id: string, markdown: string): Promise<SavedDocument | null>;
  remove(id: string): Promise<boolean>;
  selectDocument(id: string): void;
  clearSelection(): void;
}

export type DocumentsStore = DocumentsState & DocumentsActions;

const initialState: DocumentsState = {
  documents: [],
  loading: true,
  saveStatus: 'idle',
  error: null,
  activeSavedId: null,
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
          error: error instanceof Error ? error.message : 'Failed to load documents',
        });
      }
    },

    async save(markdown, filename) {
      set({ saveStatus: 'saving' });

      try {
        const document = await createDocument(markdown, filename);
        set((state) => ({
          documents: [document, ...state.documents],
          saveStatus: 'saved',
          error: null,
        }));
        scheduleSaveStatusReset();
        return document;
      } catch (error) {
        set({
          saveStatus: 'error',
          error: error instanceof Error ? error.message : 'Failed to save',
        });
        return null;
      }
    },

    async update(id, markdown) {
      try {
        const document = await updateDocument(id, markdown);
        set((state) => ({
          documents: state.documents.map((item) => (item.id === id ? document : item)),
          error: null,
        }));
        return document;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to update' });
        return null;
      }
    },

    async remove(id) {
      try {
        await deleteDocument(id);
        set((state) => ({
          documents: state.documents.filter((item) => item.id !== id),
          activeSavedId: state.activeSavedId === id ? null : state.activeSavedId,
          error: null,
        }));
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to delete' });
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
  };
});
