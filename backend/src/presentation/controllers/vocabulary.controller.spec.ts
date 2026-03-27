import { VocabularyController } from './vocabulary.controller';
import { VocabularyUseCase } from '../../application/use-cases/vocabulary.use-case';
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { VOCABULARY_DUPLICATE_ERROR } from '../../domain/ports/vocabulary-repository.port';

const mockOutput = {
  id: 'v1',
  word: 'beautiful',
  vocabType: 'word' as const,
  translation: 'красивый',
  targetLang: 'en',
  nativeLang: 'ru',
  contextSentence: 'The sunset was beautiful.',
  sourceDocumentId: null,
  intervalDays: 0,
  easinessFactor: 2.5,
  repetitions: 0,
  nextReviewAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('VocabularyController', () => {
  let controller: VocabularyController;
  let useCase: jest.Mocked<VocabularyUseCase>;

  beforeEach(() => {
    useCase = {
      add: jest.fn().mockResolvedValue(mockOutput),
      addMany: jest.fn().mockResolvedValue([mockOutput]),
      findAll: jest.fn().mockResolvedValue([mockOutput]),
      findById: jest.fn().mockResolvedValue(mockOutput),
      findByWord: jest.fn().mockResolvedValue(null),
      findDueForReview: jest.fn().mockResolvedValue([mockOutput]),
      update: jest.fn().mockResolvedValue(mockOutput),
      delete: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<VocabularyUseCase>;
    controller = new VocabularyController(useCase);
  });

  describe('create', () => {
    it('creates a vocabulary word', async () => {
      const result = await controller.create({
        word: 'beautiful',
        vocabType: 'word',
        translation: 'красивый',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'The sunset was beautiful.',
      });

      expect(result.id).toBe('v1');
      expect(useCase.add).toHaveBeenCalledWith({
        word: 'beautiful',
        vocabType: 'word',
        translation: 'красивый',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'The sunset was beautiful.',
        sourceDocumentId: undefined,
      });
    });

    it('rejects empty word', async () => {
      await expect(
        controller.create({
          word: '',
          vocabType: 'word',
          translation: '',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid vocabType', async () => {
      await expect(
        controller.create({
          word: 'test',
          vocabType: 'invalid',
          translation: '',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns 409 if word already exists', async () => {
      useCase.add.mockRejectedValue(new Error(VOCABULARY_DUPLICATE_ERROR));

      try {
        await controller.create({
          word: 'beautiful',
          vocabType: 'word',
          translation: '',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: '',
        });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
      }
    });

    it('rejects missing target and native languages', async () => {
      await expect(
        controller.create({
          word: 'beautiful',
          vocabType: 'word',
          translation: '',
          targetLang: '',
          nativeLang: '',
          contextSentence: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createBatch', () => {
    it('creates a batch of vocabulary words', async () => {
      const result = await controller.createBatch([
        {
          word: ' beautiful ',
          vocabType: 'word',
          translation: 'красивый',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: 'The sunset was beautiful.',
        },
      ]);

      expect(result).toEqual([mockOutput]);
      expect(useCase.addMany).toHaveBeenCalledWith([
        {
          word: 'beautiful',
          vocabType: 'word',
          translation: 'красивый',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: 'The sunset was beautiful.',
          sourceDocumentId: undefined,
        },
      ]);
    });

    it('rejects an empty batch', async () => {
      await expect(controller.createBatch([])).rejects.toThrow(BadRequestException);
    });

    it('rejects oversized batches', async () => {
      await expect(
        controller.createBatch(
          Array.from({ length: 501 }, () => ({
            word: 'word',
            vocabType: 'word' as const,
            translation: '',
            targetLang: 'en',
            nativeLang: 'ru',
            contextSentence: '',
          })),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid items in the batch', async () => {
      await expect(
        controller.createBatch([
          {
            word: '',
            vocabType: 'word',
            translation: '',
            targetLang: 'en',
            nativeLang: 'ru',
            contextSentence: '',
          },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid batch vocab types', async () => {
      await expect(
        controller.createBatch([
          {
            word: 'beautiful',
            vocabType: 'invalid',
            translation: '',
            targetLang: 'en',
            nativeLang: 'ru',
            contextSentence: '',
          } as any,
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects batch items without language metadata', async () => {
      await expect(
        controller.createBatch([
          {
            word: 'beautiful',
            vocabType: 'word',
            translation: '',
            targetLang: '',
            nativeLang: '',
            contextSentence: '',
          },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects batch items when the word field is missing', async () => {
      await expect(
        controller.createBatch([
          {
            vocabType: 'word',
            translation: '',
            targetLang: 'en',
            nativeLang: 'ru',
            contextSentence: '',
          } as any,
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('fills in default translation and context for batch items when omitted', async () => {
      await controller.createBatch([
        {
          word: 'beautiful',
          vocabType: 'word',
          targetLang: 'en',
          nativeLang: 'ru',
        } as any,
      ]);

      expect(useCase.addMany).toHaveBeenCalledWith([
        {
          word: 'beautiful',
          vocabType: 'word',
          translation: '',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: '',
          sourceDocumentId: undefined,
        },
      ]);
    });

    it('returns 409 if a batch contains a duplicate word', async () => {
      useCase.addMany.mockRejectedValue(new Error(VOCABULARY_DUPLICATE_ERROR));

      try {
        await controller.createBatch([
          {
            word: 'beautiful',
            vocabType: 'word',
            translation: '',
            targetLang: 'en',
            nativeLang: 'ru',
            contextSentence: '',
          },
        ]);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
      }
    });
  });

  describe('findAll', () => {
    it('returns all words', async () => {
      const result = await controller.findAll();

      expect(result).toHaveLength(1);
    });

    it('passes language filter', async () => {
      await controller.findAll('en', 'ru');

      expect(useCase.findAll).toHaveBeenCalledWith('en', 'ru');
    });
  });

  describe('findDue', () => {
    it('returns due words', async () => {
      const result = await controller.findDue();

      expect(result).toHaveLength(1);
    });

    it('passes a parsed numeric limit to the use case', async () => {
      await controller.findDue('15');

      expect(useCase.findDueForReview).toHaveBeenCalledWith(15);
    });
  });

  describe('findById', () => {
    it('returns a word when found', async () => {
      await expect(controller.findById('v1')).resolves.toEqual(mockOutput);
      expect(useCase.findById).toHaveBeenCalledWith('v1');
    });

    it('returns 404 when not found', async () => {
      useCase.findById.mockResolvedValue(null);

      await expect(controller.findById('missing')).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    it('updates a word when it exists', async () => {
      await expect(
        controller.update('v1', { translation: 'новый', contextSentence: 'ctx' }),
      ).resolves.toEqual(mockOutput);
      expect(useCase.update).toHaveBeenCalledWith('v1', {
        translation: 'новый',
        contextSentence: 'ctx',
      });
    });

    it('returns 404 when not found', async () => {
      useCase.update.mockResolvedValue(null);

      await expect(
        controller.update('missing', { translation: 'x', contextSentence: 'y' }),
      ).rejects.toThrow(HttpException);
    });

    it('fills default update fields when they are omitted', async () => {
      await controller.update('v1', {});

      expect(useCase.update).toHaveBeenCalledWith('v1', {
        translation: '',
        contextSentence: '',
      });
    });
  });

  describe('remove', () => {
    it('removes a word when it exists', async () => {
      await expect(controller.remove('v1')).resolves.toBeUndefined();
      expect(useCase.delete).toHaveBeenCalledWith('v1');
    });

    it('returns 404 when not found', async () => {
      useCase.delete.mockResolvedValue(false);

      await expect(controller.remove('missing')).rejects.toThrow(HttpException);
    });
  });
});
