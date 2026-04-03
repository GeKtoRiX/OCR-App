import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentsStore } from './documents.store';
import {
  confirmDocumentVocabulary,
  createDocument,
  deleteDocument,
  fetchDocuments,
  prepareDocumentVocabulary,
  updateDocument,
} from '../../shared/api';

vi.mock('../../shared/api', () => ({
  confirmDocumentVocabulary: vi.fn(),
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  fetchDocuments: vi.fn(),
  prepareDocumentVocabulary: vi.fn(),
  updateDocument: vi.fn(),
}));

const mockFetchDocuments = vi.mocked(fetchDocuments);
const mockCreateDocument = vi.mocked(createDocument);
const mockUpdateDocument = vi.mocked(updateDocument);
const mockDeleteDocument = vi.mocked(deleteDocument);
const mockPrepareDocumentVocabulary = vi.mocked(prepareDocumentVocabulary);
const mockConfirmDocumentVocabulary = vi.mocked(confirmDocumentVocabulary);

describe('useDocumentsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDocumentsStore.setState({
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
        richTextHtml: null,
        filename: 'doc.md',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      },
    ];
    mockFetchDocuments.mockResolvedValue(documents);

    await useDocumentsStore.getState().load();

    expect(useDocumentsStore.getState().documents).toEqual(documents);
    expect(useDocumentsStore.getState().loading).toBe(false);
  });

  it('load() stores an error when fetch fails', async () => {
    mockFetchDocuments.mockRejectedValue(new Error('network down'));

    await useDocumentsStore.getState().load();

    expect(useDocumentsStore.getState().loading).toBe(false);
    expect(useDocumentsStore.getState().error).toBe('network down');
  });

  it('save() prepends the new document and resets saveStatus after 2 seconds', async () => {
    const document = {
      id: 'doc-1',
      markdown: '# saved',
      richTextHtml: null,
      filename: 'saved.md',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      analysisStatus: 'idle',
      analysisError: null,
      analysisUpdatedAt: null,
    };
    mockCreateDocument.mockResolvedValue(document);

    await useDocumentsStore.getState().save({ markdown: '# saved', filename: 'saved.md' });

    expect(useDocumentsStore.getState().documents[0]).toEqual(document);
    expect(useDocumentsStore.getState().saveStatus).toBe('saved');
    expect(useDocumentsStore.getState().activeSavedId).toBe('doc-1');

    vi.advanceTimersByTime(2000);

    expect(useDocumentsStore.getState().saveStatus).toBe('idle');
  });

  it('save() stores an error when creation fails', async () => {
    mockCreateDocument.mockRejectedValue(new Error('cannot save'));

    const result = await useDocumentsStore.getState().save({
      markdown: '# saved',
      filename: 'saved.md',
    });

    expect(result).toBeNull();
    expect(useDocumentsStore.getState().saveStatus).toBe('error');
    expect(useDocumentsStore.getState().error).toBe('cannot save');
  });

  it('update() replaces the matching document', async () => {
    const original = {
      id: 'doc-1',
      markdown: '# old',
      richTextHtml: null,
      filename: 'saved.md',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      analysisStatus: 'idle',
      analysisError: null,
      analysisUpdatedAt: null,
    };
    const updated = { ...original, markdown: '# updated', richTextHtml: '<p>updated</p>' };
    useDocumentsStore.setState({ documents: [original], loading: false });
    mockUpdateDocument.mockResolvedValue(updated);

    await useDocumentsStore.getState().update('doc-1', { richTextHtml: '<p>updated</p>' });

    expect(useDocumentsStore.getState().documents).toEqual([updated]);
  });

  it('update() stores an error when update fails', async () => {
    useDocumentsStore.setState({ documents: [], loading: false, error: null });
    mockUpdateDocument.mockRejectedValue(new Error('cannot update'));

    const result = await useDocumentsStore.getState().update('doc-1', {
      markdown: '# updated',
    });

    expect(result).toBeNull();
    expect(useDocumentsStore.getState().error).toBe('cannot update');
  });

  it('remove() clears activeSavedId when deleting the selected document', async () => {
    useDocumentsStore.setState({
      documents: [
        {
          id: 'doc-1',
          markdown: '# doc',
          richTextHtml: null,
          filename: 'doc.md',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          analysisStatus: 'idle',
          analysisError: null,
          analysisUpdatedAt: null,
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

  it('remove() reselects the next available document', async () => {
    useDocumentsStore.setState({
      documents: [
        {
          id: 'doc-1',
          markdown: '# first',
          richTextHtml: null,
          filename: 'first.md',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          analysisStatus: 'idle',
          analysisError: null,
          analysisUpdatedAt: null,
        },
        {
          id: 'doc-2',
          markdown: '# second',
          richTextHtml: null,
          filename: 'second.md',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          analysisStatus: 'idle',
          analysisError: null,
          analysisUpdatedAt: null,
        },
      ],
      loading: false,
      activeSavedId: 'doc-1',
    });
    mockDeleteDocument.mockResolvedValue(undefined);

    const removed = await useDocumentsStore.getState().remove('doc-1');

    expect(removed).toBe(true);
    expect(useDocumentsStore.getState().documents.map((doc) => doc.id)).toEqual([
      'doc-2',
    ]);
    expect(useDocumentsStore.getState().activeSavedId).toBe('doc-2');
  });

  it('remove() stores an error when deletion fails', async () => {
    mockDeleteDocument.mockRejectedValue(new Error('cannot delete'));

    const removed = await useDocumentsStore.getState().remove('doc-1');

    expect(removed).toBe(false);
    expect(useDocumentsStore.getState().error).toBe('cannot delete');
  });

  it('selectDocument() and clearSelection() manage activeSavedId', () => {
    useDocumentsStore.getState().selectDocument('doc-1');
    expect(useDocumentsStore.getState().activeSavedId).toBe('doc-1');

    useDocumentsStore.getState().clearSelection();
    expect(useDocumentsStore.getState().activeSavedId).toBeNull();
  });

  it('prepareVocabulary() stores review candidates', async () => {
    useDocumentsStore.setState({
      documents: [
        {
          id: 'doc-1',
          markdown: '# doc',
          richTextHtml: null,
          filename: 'doc.md',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          analysisStatus: 'idle',
          analysisError: null,
          analysisUpdatedAt: null,
        },
      ],
      loading: false,
    });
    mockPrepareDocumentVocabulary.mockResolvedValue({
      document: {
        id: 'doc-1',
        markdown: '# doc',
        richTextHtml: null,
        filename: 'doc.md',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        analysisStatus: 'ready',
        analysisError: null,
        analysisUpdatedAt: '2024-01-01T00:00:01.000Z',
      },
      candidates: [
        {
          id: 'c-1',
          surface: 'hello',
          normalized: 'hello',
          lemma: 'hello',
          vocabType: 'word',
          pos: 'noun',
          translation: 'привет',
          contextSentence: 'hello world',
          sentenceIndex: 0,
          startOffset: 0,
          endOffset: 5,
          selectedByDefault: true,
          isDuplicate: false,
          reviewSource: 'base_nlp',
        },
      ],
      llmReviewApplied: false,
    });

    const candidates = await useDocumentsStore.getState().prepareVocabulary('doc-1', {
      llmReview: false,
      targetLang: 'en',
      nativeLang: 'ru',
    });

    expect(candidates).toHaveLength(1);
    expect(useDocumentsStore.getState().vocabularyReviewStatus).toBe('ready');
  });

  it('prepareVocabulary() sends selected ids during llm review', async () => {
    useDocumentsStore.setState({
      documents: [
        {
          id: 'doc-1',
          markdown: '# doc',
          richTextHtml: null,
          filename: 'doc.md',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          analysisStatus: 'idle',
          analysisError: null,
          analysisUpdatedAt: null,
        },
      ],
      loading: false,
    });
    mockPrepareDocumentVocabulary.mockResolvedValue({
      document: {
        id: 'doc-1',
        markdown: '# doc',
        richTextHtml: null,
        filename: 'doc.md',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        analysisStatus: 'ready',
        analysisError: null,
        analysisUpdatedAt: '2024-01-01T00:00:01.000Z',
      },
      candidates: [],
      llmReviewApplied: true,
    });

    await useDocumentsStore.getState().prepareVocabulary('doc-1', {
      llmReview: true,
      targetLang: 'en',
      nativeLang: 'ru',
      selectedIds: ['c-1', 'c-2'],
    });

    expect(mockPrepareDocumentVocabulary).toHaveBeenCalledWith({
      id: 'doc-1',
      llmReview: true,
      targetLang: 'en',
      nativeLang: 'ru',
      selectedCandidateIds: ['c-1', 'c-2'],
    });
    expect(useDocumentsStore.getState().vocabularyReviewLlmApplied).toBe(true);
  });

  it('prepareVocabulary() stores an error when preparation fails', async () => {
    mockPrepareDocumentVocabulary.mockRejectedValue(new Error('cannot prepare'));

    const result = await useDocumentsStore.getState().prepareVocabulary('doc-1', {
      llmReview: false,
      targetLang: 'en',
      nativeLang: 'ru',
    });

    expect(result).toEqual([]);
    expect(useDocumentsStore.getState().vocabularyReviewStatus).toBe('error');
    expect(useDocumentsStore.getState().vocabularyReviewError).toBe(
      'cannot prepare',
    );
  });

  it('confirmVocabulary() stores the confirmation summary', async () => {
    mockConfirmDocumentVocabulary.mockResolvedValue({
      savedCount: 1,
      skippedDuplicateCount: 0,
      failedCount: 0,
      savedItems: [{ candidateId: 'c-1', vocabularyId: 'v-1', word: 'hello' }],
      skippedItems: [],
      failedItems: [],
    });

    const result = await useDocumentsStore.getState().confirmVocabulary('doc-1', {
      targetLang: 'en',
      nativeLang: 'ru',
      items: [
        {
          candidateId: 'c-1',
          word: 'hello',
          vocabType: 'word',
          translation: 'привет',
          contextSentence: 'hello world',
        },
      ],
    });

    expect(result?.savedCount).toBe(1);
    expect(useDocumentsStore.getState().vocabularyReviewStatus).toBe('saved');
  });

  it('confirmVocabulary() stores an error when saving fails', async () => {
    mockConfirmDocumentVocabulary.mockRejectedValue(new Error('cannot confirm'));

    const result = await useDocumentsStore.getState().confirmVocabulary('doc-1', {
      targetLang: 'en',
      nativeLang: 'ru',
      items: [
        {
          candidateId: 'c-1',
          word: 'hello',
          vocabType: 'word',
          translation: 'привет',
          contextSentence: 'hello world',
        },
      ],
    });

    expect(result).toBeNull();
    expect(useDocumentsStore.getState().vocabularyReviewStatus).toBe('error');
    expect(useDocumentsStore.getState().vocabularyReviewError).toBe(
      'cannot confirm',
    );
  });

  it('clearVocabularyReview() resets the review slice', () => {
    useDocumentsStore.setState({
      vocabularyReviewStatus: 'saved',
      vocabularyReviewDocumentId: 'doc-1',
      vocabularyReviewCandidates: [
        {
          id: 'c-1',
          surface: 'hello',
          normalized: 'hello',
          lemma: 'hello',
          vocabType: 'word',
          pos: 'noun',
          translation: 'привет',
          contextSentence: 'hello world',
          sentenceIndex: 0,
          startOffset: 0,
          endOffset: 5,
          selectedByDefault: true,
          isDuplicate: false,
          reviewSource: 'base_nlp',
        },
      ],
      vocabularyReviewError: 'boom',
      vocabularyReviewLlmApplied: true,
      vocabularyConfirmResult: {
        savedCount: 1,
        skippedDuplicateCount: 0,
        failedCount: 0,
        savedItems: [],
        skippedItems: [],
        failedItems: [],
      },
    });

    useDocumentsStore.getState().clearVocabularyReview();

    expect(useDocumentsStore.getState().vocabularyReviewStatus).toBe('idle');
    expect(useDocumentsStore.getState().vocabularyReviewDocumentId).toBeNull();
    expect(useDocumentsStore.getState().vocabularyReviewCandidates).toEqual([]);
    expect(useDocumentsStore.getState().vocabularyReviewError).toBeNull();
    expect(useDocumentsStore.getState().vocabularyReviewLlmApplied).toBe(false);
    expect(useDocumentsStore.getState().vocabularyConfirmResult).toBeNull();
  });
});
