import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSavedDocuments } from './useSavedDocuments';

vi.mock('../model/api', () => ({
  fetchDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

import {
  fetchDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
} from '../model/api';

const mockFetch = fetchDocuments as ReturnType<typeof vi.fn>;
const mockCreate = createDocument as ReturnType<typeof vi.fn>;
const mockUpdate = updateDocument as ReturnType<typeof vi.fn>;
const mockDelete = deleteDocument as ReturnType<typeof vi.fn>;

const doc1 = {
  id: '1',
  markdown: '# First',
  filename: 'a.png',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('useSavedDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue([doc1]);
  });

  it('loads documents on mount', async () => {
    const { result } = renderHook(() => useSavedDocuments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.documents).toEqual([doc1]);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('save creates document and prepends to list', async () => {
    const newDoc = { ...doc1, id: '2', markdown: '# New' };
    mockCreate.mockResolvedValue(newDoc);

    const { result } = renderHook(() => useSavedDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save('# New', 'b.png');
    });

    expect(result.current.documents[0]).toEqual(newDoc);
    expect(result.current.saveStatus).toBe('saved');
    expect(mockCreate).toHaveBeenCalledWith('# New', 'b.png');
  });

  it('update modifies document in list', async () => {
    const updated = { ...doc1, markdown: '# Updated' };
    mockUpdate.mockResolvedValue(updated);

    const { result } = renderHook(() => useSavedDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.update('1', '# Updated');
    });

    expect(result.current.documents[0].markdown).toBe('# Updated');
    expect(mockUpdate).toHaveBeenCalledWith('1', '# Updated');
  });

  it('remove deletes document from list', async () => {
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSavedDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('1');
    });

    expect(result.current.documents).toHaveLength(0);
    expect(mockDelete).toHaveBeenCalledWith('1');
  });

  it('sets error when save fails', async () => {
    mockCreate.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSavedDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save('# X', 'c.png');
    });

    expect(result.current.saveStatus).toBe('error');
    expect(result.current.error).toBe('Network error');
  });
});
