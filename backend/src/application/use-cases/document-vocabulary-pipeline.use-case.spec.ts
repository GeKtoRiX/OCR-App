import { DocumentVocabularyPipelineUseCase } from './document-vocabulary-pipeline.use-case';
import { ISavedDocumentRepository } from '../../domain/ports/saved-document-repository.port';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { IVocabularyLlmService } from '../../domain/ports/vocabulary-llm-service.port';
import { IDocumentVocabularyExtractor } from '../../domain/ports/document-vocabulary-extractor.port';
import { SavedDocument } from '../../domain/entities/saved-document.entity';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';

describe('DocumentVocabularyPipelineUseCase', () => {
  let useCase: DocumentVocabularyPipelineUseCase;
  let mockRepo: jest.Mocked<ISavedDocumentRepository>;
  let mockVocabularyRepo: jest.Mocked<IVocabularyRepository>;
  let mockVocabularyLlmService: jest.Mocked<IVocabularyLlmService>;
  let mockVocabularyExtractor: jest.Mocked<IDocumentVocabularyExtractor>;

  const now = '2024-01-01T00:00:00.000Z';
  const doc = new SavedDocument('id-1', '# Hello', null, 'test.png', now, now, 'idle', null, null);

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
      findByIds: jest.fn(),
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

    useCase = new DocumentVocabularyPipelineUseCase(
      mockRepo,
      mockVocabularyRepo,
      mockVocabularyLlmService,
      mockVocabularyExtractor,
    );
  });

  describe('prepareVocabulary', () => {
    it('skips LLM enrichment when llmReview is false', async () => {
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
      mockVocabularyRepo.findByWord.mockResolvedValue(null);

      const result = await useCase.prepareVocabulary('id-1', {
        llmReview: false,
        targetLang: 'en',
        nativeLang: 'ru',
      });

      expect(mockVocabularyExtractor.extract).toHaveBeenCalled();
      expect(mockVocabularyLlmService.enrichDocumentCandidates).not.toHaveBeenCalled();
      expect(mockRepo.replaceVocabularyCandidates).toHaveBeenCalled();
      expect(result?.candidates[0].translation).toBe('');
      expect(result?.llmReviewApplied).toBe(false);
    });

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
        pos: 'noun',
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
        'noun',
      );
      expect(result?.savedCount).toBe(1);
      expect(result?.savedItems[0].vocabularyId).toBe('vocab-1');
    });
  });
});
