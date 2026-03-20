import { useState, useCallback, useEffect } from 'react';
import type { SavedDocument } from '../model/types';
import {
  fetchDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
} from '../model/api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useSavedDocuments() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (markdown: string, filename: string) => {
    setSaveStatus('saving');
    try {
      const doc = await createDocument(markdown, filename);
      setDocuments(prev => [doc, ...prev]);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return doc;
    } catch (e) {
      setSaveStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to save');
      return null;
    }
  }, []);

  const update = useCallback(async (id: string, markdown: string) => {
    try {
      const doc = await updateDocument(id, markdown);
      setDocuments(prev => prev.map(d => (d.id === id ? doc : d)));
      return doc;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      return false;
    }
  }, []);

  return { documents, loading, saveStatus, error, save, update, remove, refresh };
}
