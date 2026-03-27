import { create } from 'zustand';
import { processImage } from '../../shared/api';
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
          file,
          result: data,
          processedAt: new Date(),
        };

        set((state) => ({
          status: 'success',
          result: data,
          error: null,
          entries: [entry, ...state.entries],
          activeHistoryId: entry.id,
        }));
      } catch (error) {
        if (nextController.signal.aborted || controller !== nextController) {
          return;
        }

        set({
          status: 'error',
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        if (controller === nextController) {
          controller = null;
        }
      }
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
        const entries = state.entries.filter((entry) => entry.id !== id);
        return {
          entries,
          activeHistoryId:
            state.activeHistoryId === id ? (entries[0]?.id ?? null) : state.activeHistoryId,
        };
      });
    },
  };
});
