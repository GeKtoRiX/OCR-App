import { DocumentController } from './document.controller';
import { SavedDocumentUseCase } from '../../application/use-cases/saved-document.use-case';
import { BadRequestException, HttpException } from '@nestjs/common';

describe('DocumentController', () => {
  let controller: DocumentController;
  let mockUseCase: jest.Mocked<SavedDocumentUseCase>;

  const now = '2024-01-01T00:00:00.000Z';
  const docOutput = {
    id: 'id-1',
    markdown: '# Hello',
    filename: 'test.png',
    createdAt: now,
    updatedAt: now,
    analysisStatus: 'idle' as const,
    analysisError: null,
    analysisUpdatedAt: null,
  };

  beforeEach(() => {
    mockUseCase = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      prepareVocabulary: jest.fn(),
      confirmVocabulary: jest.fn(),
    } as any;
    controller = new DocumentController(mockUseCase);
  });

  describe('create', () => {
    it('creates and returns a document', async () => {
      mockUseCase.create.mockResolvedValue(docOutput);

      const result = await controller.create({
        markdown: '# Hello',
        filename: 'test.png',
      });

      expect(result).toEqual(docOutput);
      expect(mockUseCase.create).toHaveBeenCalledWith({
        markdown: '# Hello',
        filename: 'test.png',
      });
    });

    it('accepts rich text html without markdown', async () => {
      mockUseCase.create.mockResolvedValue(docOutput);

      await controller.create({
        richTextHtml: '<p>Hello</p>',
        filename: 'test.html',
      });

      expect(mockUseCase.create).toHaveBeenCalledWith({
        markdown: undefined,
        richTextHtml: '<p>Hello</p>',
        filename: 'test.html',
      });
    });

    it('throws BadRequest when markdown is empty', async () => {
      await expect(
        controller.create({ markdown: '  ', filename: 'test.png' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when filename is empty', async () => {
      await expect(
        controller.create({ markdown: '# Hi', filename: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when filename is missing', async () => {
      await expect(
        controller.create({ markdown: '# Hi', filename: undefined as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns all documents', async () => {
      mockUseCase.findAll.mockResolvedValue([docOutput]);

      const result = await controller.findAll();

      expect(result).toEqual([docOutput]);
    });
  });

  describe('findById', () => {
    it('returns document when found', async () => {
      mockUseCase.findById.mockResolvedValue(docOutput);

      const result = await controller.findById('id-1');

      expect(result).toEqual(docOutput);
    });

    it('throws 404 when not found', async () => {
      mockUseCase.findById.mockResolvedValue(null);

      await expect(controller.findById('missing')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('update', () => {
    it('returns updated document', async () => {
      const updated = { ...docOutput, markdown: '# Updated' };
      mockUseCase.update.mockResolvedValue(updated);

      const result = await controller.update('id-1', {
        markdown: '# Updated',
      });

      expect(result.markdown).toBe('# Updated');
    });

    it('accepts rich text html without markdown', async () => {
      mockUseCase.update.mockResolvedValue(docOutput);

      await controller.update('id-1', {
        richTextHtml: '<p>Updated</p>',
      });

      expect(mockUseCase.update).toHaveBeenCalledWith('id-1', {
        markdown: undefined,
        richTextHtml: '<p>Updated</p>',
      });
    });

    it('throws BadRequest when markdown is empty', async () => {
      await expect(
        controller.update('id-1', { markdown: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when markdown is missing', async () => {
      await expect(
        controller.update('id-1', { markdown: undefined as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 404 when not found', async () => {
      mockUseCase.update.mockResolvedValue(null);

      await expect(
        controller.update('missing', { markdown: '# X' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('deletes successfully', async () => {
      mockUseCase.delete.mockResolvedValue(true);

      await expect(controller.remove('id-1')).resolves.toBeUndefined();
    });

    it('throws 404 when not found', async () => {
      mockUseCase.delete.mockResolvedValue(false);

      await expect(controller.remove('missing')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('prepareVocabulary', () => {
    it('trims language values and forwards llm review settings', async () => {
      mockUseCase.prepareVocabulary.mockResolvedValue({
        document: docOutput,
        candidates: [],
        llmReviewApplied: true,
      } as any);

      await controller.prepareVocabulary('id-1', {
        llmReview: true,
        targetLang: ' en ',
        nativeLang: ' ru ',
      });

      expect(mockUseCase.prepareVocabulary).toHaveBeenCalledWith('id-1', {
        llmReview: true,
        targetLang: 'en',
        nativeLang: 'ru',
      });
    });

    it('throws BadRequest when language values are missing', async () => {
      await expect(
        controller.prepareVocabulary('id-1', {
          llmReview: false,
          targetLang: ' ',
          nativeLang: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 404 when the document is missing', async () => {
      mockUseCase.prepareVocabulary.mockResolvedValue(null);

      await expect(
        controller.prepareVocabulary('missing', {
          llmReview: false,
          targetLang: 'en',
          nativeLang: 'ru',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('confirmVocabulary', () => {
    it('trims item fields and forwards normalized payload', async () => {
      mockUseCase.confirmVocabulary.mockResolvedValue({
        savedCount: 1,
        skippedDuplicateCount: 0,
        failedCount: 0,
        savedItems: [],
        skippedItems: [],
        failedItems: [],
      } as any);

      await controller.confirmVocabulary('id-1', {
        targetLang: ' en ',
        nativeLang: ' ru ',
        items: [
          {
            candidateId: 'cand-1',
            word: ' hello ',
            vocabType: 'expression',
            pos: 'noun',
            translation: ' привет ',
            contextSentence: ' hello world ',
          },
        ],
      });

      expect(mockUseCase.confirmVocabulary).toHaveBeenCalledWith('id-1', {
        targetLang: 'en',
        nativeLang: 'ru',
        items: [
          {
            candidateId: 'cand-1',
            word: 'hello',
            vocabType: 'expression',
            pos: 'noun',
            translation: ' привет ',
            contextSentence: ' hello world ',
          },
        ],
      });
    });

    it('throws BadRequest when items is not an array', async () => {
      await expect(
        controller.confirmVocabulary('id-1', {
          targetLang: 'en',
          nativeLang: 'ru',
          items: undefined as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 404 when the document is missing', async () => {
      mockUseCase.confirmVocabulary.mockResolvedValue(null);

      await expect(
        controller.confirmVocabulary('missing', {
          targetLang: 'en',
          nativeLang: 'ru',
          items: [],
        }),
      ).rejects.toThrow(HttpException);
    });
  });
});
