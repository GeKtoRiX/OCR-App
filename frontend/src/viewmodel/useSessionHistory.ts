import { useState, useCallback } from 'react';
import type { HistoryEntry } from '../model/types';
import type { OcrResponse } from '../model/types';

export function useSessionHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const addEntry = useCallback((file: File, result: OcrResponse) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      file,
      result,
      processedAt: new Date(),
    };
    setEntries(prev => [entry, ...prev]);
    setActiveId(entry.id);
  }, []);

  const selectEntry = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  return { entries, activeId, addEntry, selectEntry };
}
