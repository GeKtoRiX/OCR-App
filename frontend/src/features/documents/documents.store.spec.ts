import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentsStore } from './documents.store';
import {
  createDocument,
  deleteDocument,
  fetchDocuments,
  updateDocument,
} from '../../shared/api';

vi.mock('../../shared/api', () => ({
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  fetchDocuments: vi.fn(),
  updateDocument: vi.fn(),
}));

const mockFetchDocuments = vi.mocked(fetchDocuments);
const mockCreateDocument = vi.mocked(createDocument);
const mockUpdateDocument = vi.mocked(updateDocument);
const mockDeleteDocument = vi.mocked(deleteDocument);

describe('useDocumentsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDocumentsStore.setState({
      documents: [],
      loading: true,
      saveStatus: 'idle',
      error: null,
      activeSavedId: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('load() fetches documents into state', async () => {
    const documents = [
      {
        id: 'doc-1',
        markdown: '# doc',
        filename: 'doc.md',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    mockFetchDocuments.mockResolvedValue(documents);

    await useDocumentsStore.getState().load();

    expect(useDocumentsStore.getState().documents).toEqual(documents);
    expect(useDocumentsStore.getState().loading).toBe(false);
  });

  it('save() prepends the new document and resets saveStatus after 2 seconds', async () => {
    const document = {
      id: 'doc-1',
      markdown: '# saved',
      filename: 'saved.md',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    mockCreateDocument.mockResolvedValue(document);

    await useDocumentsStore.getState().save('# saved', 'saved.md');

    expect(useDocumentsStore.getState().documents[0]).toEqual(document);
    expect(useDocumentsStore.getState().saveStatus).toBe('saved');

    vi.advanceTimersByTime(2000);

    expect(useDocumentsStore.getState().saveStatus).toBe('idle');
  });

  it('update() replaces the matching document', async () => {
    const original = {
      id: 'doc-1',
      markdown: '# old',
      filename: 'saved.md',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    const updated = { ...original, markdown: '# updated' };
    useDocumentsStore.setState({ documents: [original], loading: false });
    mockUpdateDocument.mockResolvedValue(updated);

    await useDocumentsStore.getState().update('doc-1', '# updated');

    expect(useDocumentsStore.getState().documents).toEqual([updated]);
  });

  it('remove() clears activeSavedId when deleting the selected document', async () => {
    useDocumentsStore.setState({
      documents: [
        {
          id: 'doc-1',
          markdown: '# doc',
          filename: 'doc.md',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      loading: false,
      activeSavedId: 'doc-1',
    });
    mockDeleteDocument.mockResolvedValue(undefined);

    const removed = await useDocumentsStore.getState().remove('doc-1');

    expect(removed).toBe(true);
    expect(useDocumentsStore.getState().documents).toEqual([]);
    expect(useDocumentsStore.getState().activeSavedId).toBeNull();
  });

  it('selectDocument() and clearSelection() manage activeSavedId', () => {
    useDocumentsStore.getState().selectDocument('doc-1');
    expect(useDocumentsStore.getState().activeSavedId).toBe('doc-1');

    useDocumentsStore.getState().clearSelection();
    expect(useDocumentsStore.getState().activeSavedId).toBeNull();
  });
});
