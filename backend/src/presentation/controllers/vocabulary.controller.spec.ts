import { VocabularyController } from './vocabulary.controller';
import { VocabularyUseCase } from '../../application/use-cases/vocabulary.use-case';
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';

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
      expect(useCase.add).toHaveBeenCalled();
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
      useCase.findByWord.mockResolvedValue(mockOutput);

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
  });

  describe('findById', () => {
    it('returns 404 when not found', async () => {
      useCase.findById.mockResolvedValue(null);

      await expect(controller.findById('missing')).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    it('returns 404 when not found', async () => {
      useCase.update.mockResolvedValue(null);

      await expect(
        controller.update('missing', { translation: 'x', contextSentence: 'y' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('returns 404 when not found', async () => {
      useCase.delete.mockResolvedValue(false);

      await expect(controller.remove('missing')).rejects.toThrow(HttpException);
    });
  });
});
