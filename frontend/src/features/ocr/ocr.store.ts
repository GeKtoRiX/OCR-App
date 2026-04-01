import { create } from 'zustand';
import { processImage } from '../../shared/api';
import { removeAndReselect } from '../../shared/lib/collection';
import { toErrorMessage } from '../../shared/lib/errors';
import type { HistoryEntry, OcrResponse } from '../../shared/types';

export type OcrStatus = 'idle' | 'loading' | 'success' | 'error';

interface OcrState {
  status: OcrStatus;
  result: OcrResponse | null;
  error: string | null;
  entries: HistoryEntry[];
  activeHistoryId: string | null;
}

interface OcrActions {
  run(file: File): Promise<void>;
  submitText(text: string, filename: string): void;
  reset(): void;
  selectEntry(id: string): void;
  removeEntry(id: string): void;
}

export type OcrStore = OcrState & OcrActions;

const initialState: OcrState = {
  status: 'idle',
  result: null,
  error: null,
  entries: [],
  activeHistoryId: null,
};

export const useOcrStore = create<OcrStore>((set) => {
  // AbortController as closure variable — not part of Zustand state,
  // so store resets (e.g. in tests) don't orphan live requests.
  let controller: AbortController | null = null;

  const pushEntry = (entry: HistoryEntry) => {
    set((state) => ({
      status: 'success',
      result: entry.result,
      error: null,
      entries: [entry, ...state.entries],
      activeHistoryId: entry.id,
    }));
  };

  return {
    ...initialState,

    async run(file) {
      controller?.abort();

      const nextController = new AbortController();
      controller = nextController;

      set({ status: 'loading', result: null, error: null });

      try {
        const data = await processImage(file, nextController.signal);

        if (nextController.signal.aborted || controller !== nextController) {
          return;
        }

        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          type: 'image',
          file,
          result: data,
          processedAt: new Date(),
        };

        pushEntry(entry);
      } catch (error) {
        if (nextController.signal.aborted || controller !== nextController) {
          return;
        }

        set({
          status: 'error',
          result: null,
          error: toErrorMessage(error, 'Unknown error'),
        });
      } finally {
        if (controller === nextController) {
          controller = null;
        }
      }
    },

    submitText(text, filename) {
      controller?.abort();
      controller = null;

      const result: OcrResponse = {
        rawText: text,
        markdown: text,
        filename: filename.trim() || 'pasted-text.md',
      };

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        type: 'text',
        result,
        processedAt: new Date(),
      };

      pushEntry(entry);
    },

    reset() {
      controller?.abort();
      controller = null;
      set({ status: 'idle', result: null, error: null });
    },

    selectEntry(id) {
      set({ activeHistoryId: id });
    },

    removeEntry(id) {
      set((state) => {
        const { items: entries, activeId: activeHistoryId } = removeAndReselect(
          state.entries,
          id,
          state.activeHistoryId,
        );

        return {
          entries,
          activeHistoryId,
        };
      });
    },
  };
});
