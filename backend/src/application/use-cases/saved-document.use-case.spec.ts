import { SavedDocumentUseCase } from './saved-document.use-case';
import { ISavedDocumentRepository } from '../../domain/ports/saved-document-repository.port';
import { SavedDocument } from '../../domain/entities/saved-document.entity';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { IVocabularyLlmService } from '../../domain/ports/vocabulary-llm-service.port';
import { IDocumentVocabularyExtractor } from '../../domain/ports/document-vocabulary-extractor.port';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';

describe('SavedDocumentUseCase', () => {
  let useCase: SavedDocumentUseCase;
  let mockRepo: jest.Mocked<ISavedDocumentRepository>;
  let mockVocabularyRepo: jest.Mocked<IVocabularyRepository>;
  let mockVocabularyLlmService: jest.Mocked<IVocabularyLlmService>;
  let mockVocabularyExtractor: jest.Mocked<IDocumentVocabularyExtractor>;

  const now = '2024-01-01T00:00:00.000Z';
  const doc = new SavedDocument('id-1', '# Hello', 'test.png', now, now, 'idle', null, null);

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceVocabularyCandidates: jest.fn(),
      findVocabularyCandidates: jest.fn(),
      updateAnalysisStatus: jest.fn(),
    } as jest.Mocked<ISavedDocumentRepository>;
    mockVocabularyRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByWord: jest.fn(),
      findDueForReview: jest.fn(),
      updateSrs: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IVocabularyRepository>;
    mockVocabularyLlmService = {
      generateExercises: jest.fn(),
      analyzeSession: jest.fn(),
      enrichDocumentCandidates: jest.fn(),
    } as jest.Mocked<IVocabularyLlmService>;
    mockVocabularyExtractor = {
      extract: jest.fn(),
    } as jest.Mocked<IDocumentVocabularyExtractor>;

    useCase = new SavedDocumentUseCase(
      mockRepo,
      mockVocabularyRepo,
      mockVocabularyLlmService,
      mockVocabularyExtractor,
    );
  });

  describe('create', () => {
    it('delegates to repository and returns output', async () => {
      mockRepo.create.mockResolvedValue(doc);

      const result = await useCase.create({
        markdown: '# Hello',
        filename: 'test.png',
      });

      expect(mockRepo.create).toHaveBeenCalledWith('# Hello', 'test.png');
      expect(result).toEqual({
        id: 'id-1',
        markdown: '# Hello',
        filename: 'test.png',
        createdAt: now,
        updatedAt: now,
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      });
    });
  });

  describe('findAll', () => {
    it('returns all documents', async () => {
      mockRepo.findAll.mockResolvedValue([doc]);

      const result = await useCase.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('id-1');
    });

    it('returns empty array when no documents', async () => {
      mockRepo.findAll.mockResolvedValue([]);

      const result = await useCase.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns document when found', async () => {
      mockRepo.findById.mockResolvedValue(doc);

      const result = await useCase.findById('id-1');

      expect(mockRepo.findById).toHaveBeenCalledWith('id-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('id-1');
    });

    it('returns null when not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const result = await useCase.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('returns updated document', async () => {
      const updated = new SavedDocument(
        'id-1',
        '# Updated',
        'test.png',
        now,
        '2024-01-02T00:00:00.000Z',
        'idle',
        null,
        null,
      );
      mockRepo.update.mockResolvedValue(updated);

      const result = await useCase.update('id-1', { markdown: '# Updated' });

      expect(mockRepo.update).toHaveBeenCalledWith('id-1', '# Updated');
      expect(result!.markdown).toBe('# Updated');
    });

    it('returns null when document not found', async () => {
      mockRepo.update.mockResolvedValue(null);

      const result = await useCase.update('missing', { markdown: 'x' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when deleted', async () => {
      mockRepo.delete.mockResolvedValue(true);

      const result = await useCase.delete('id-1');

      expect(mockRepo.delete).toHaveBeenCalledWith('id-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockRepo.delete.mockResolvedValue(false);

      const result = await useCase.delete('missing');

      expect(result).toBe(false);
    });
  });

  describe('prepareVocabulary', () => {
    it('extracts, enriches, marks duplicates, and persists candidates', async () => {
      const candidate = new DocumentVocabCandidate(
        'candidate-1',
        doc.id,
        'Markdown',
        'markdown',
        'markdown',
        'word',
        'noun',
        '',
        'Markdown content',
        0,
        0,
        8,
        true,
        false,
        'base_nlp',
      );

      mockRepo.findById.mockResolvedValue(doc);
      mockRepo.updateAnalysisStatus.mockResolvedValue(doc);
      mockVocabularyExtractor.extract.mockResolvedValue([candidate]);
      mockVocabularyLlmService.enrichDocumentCandidates.mockResolvedValue([
        new DocumentVocabCandidate(
          candidate.id,
          candidate.documentId,
          candidate.surface,
          candidate.normalized,
          candidate.lemma,
          candidate.vocabType,
          candidate.pos,
          'разметка',
          candidate.contextSentence,
          candidate.sentenceIndex,
          candidate.startOffset,
          candidate.endOffset,
          candidate.selectedByDefault,
          false,
          'base_nlp',
        ),
      ]);
      mockVocabularyRepo.findByWord.mockResolvedValue(null);

      const result = await useCase.prepareVocabulary('id-1', {
        llmReview: true,
        targetLang: 'en',
        nativeLang: 'ru',
      });

      expect(mockVocabularyExtractor.extract).toHaveBeenCalled();
      expect(mockVocabularyLlmService.enrichDocumentCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          llmReview: true,
          targetLang: 'en',
          nativeLang: 'ru',
        }),
      );
      expect(mockRepo.replaceVocabularyCandidates).toHaveBeenCalled();
      expect(result?.candidates[0].translation).toBe('разметка');
      expect(result?.llmReviewApplied).toBe(true);
    });
  });

  describe('confirmVocabulary', () => {
    it('saves non-duplicate candidates into vocabulary storage', async () => {
      const candidate = new DocumentVocabCandidate(
        'candidate-1',
        doc.id,
        'markdown',
        'markdown',
        'markdown',
        'word',
        'noun',
        'разметка',
        'Markdown content',
        0,
        0,
        8,
        true,
        false,
        'base_nlp',
      );

      const createdVocabularyWord = {
        id: 'vocab-1',
        word: 'markdown',
        vocabType: 'word',
        translation: 'разметка',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'Markdown content',
        sourceDocumentId: doc.id,
        createdAt: now,
        updatedAt: now,
        intervalDays: 0,
        easinessFactor: 2.5,
        repetitions: 0,
        nextReviewAt: now,
      };

      mockRepo.findById.mockResolvedValue(doc);
      mockRepo.findVocabularyCandidates.mockResolvedValue([candidate]);
      mockVocabularyRepo.findByWord.mockResolvedValue(null);
      mockVocabularyRepo.create.mockResolvedValue(createdVocabularyWord as any);

      const result = await useCase.confirmVocabulary('id-1', {
        targetLang: 'en',
        nativeLang: 'ru',
        items: [
          {
            candidateId: candidate.id,
            word: 'markdown',
            vocabType: 'word',
            translation: 'разметка',
            contextSentence: 'Markdown content',
          },
        ],
      });

      expect(mockVocabularyRepo.create).toHaveBeenCalledWith(
        'markdown',
        'word',
        'разметка',
        'en',
        'ru',
        'Markdown content',
        'id-1',
      );
      expect(result?.savedCount).toBe(1);
      expect(result?.savedItems[0].vocabularyId).toBe('vocab-1');
    });
  });
});
