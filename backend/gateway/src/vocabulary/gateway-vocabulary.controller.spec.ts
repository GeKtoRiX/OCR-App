import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { GatewayVocabularyController } from './gateway-vocabulary.controller';
import { VOCABULARY_PATTERNS } from '@ocr-app/shared';

describe('GatewayVocabularyController', () => {
  const mockVocabulary = {
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

  let controller: GatewayVocabularyController;
  let vocabularyClient: { send: jest.Mock };

  beforeEach(() => {
    vocabularyClient = {
      send: jest.fn().mockReturnValue(of(mockVocabulary)),
    };

    controller = new GatewayVocabularyController(vocabularyClient as any);
  });

  it('trims the update word field before forwarding it upstream', async () => {
    await expect(
      controller.update('v1', {
        word: '  refined  ',
        translation: 'новый',
        contextSentence: 'ctx',
      }),
    ).resolves.toEqual(mockVocabulary);

    expect(vocabularyClient.send).toHaveBeenCalledWith(
      VOCABULARY_PATTERNS.UPDATE,
      {
        id: 'v1',
        word: 'refined',
        vocabType: undefined,
        pos: undefined,
        translation: 'новый',
        contextSentence: 'ctx',
      },
    );
  });

  it('fills update defaults when optional fields are omitted', async () => {
    await controller.update('v1', {});

    expect(vocabularyClient.send).toHaveBeenCalledWith(
      VOCABULARY_PATTERNS.UPDATE,
      {
        id: 'v1',
        word: undefined,
        vocabType: undefined,
        pos: undefined,
        translation: '',
        contextSentence: '',
      },
    );
  });

  it('forwards update vocabType and pos when provided', async () => {
    await controller.update('v1', {
      word: '  refined  ',
      vocabType: 'idiom',
      pos: 'adverb',
      translation: 'новый',
      contextSentence: 'ctx',
    });

    expect(vocabularyClient.send).toHaveBeenCalledWith(
      VOCABULARY_PATTERNS.UPDATE,
      {
        id: 'v1',
        word: 'refined',
        vocabType: 'idiom',
        pos: 'adverb',
        translation: 'новый',
        contextSentence: 'ctx',
      },
    );
  });

  it('validates update vocabType before sending upstream', async () => {
    await expect(
      controller.update('v1', {
        vocabType: 'invalid' as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates update pos before sending upstream', async () => {
    await expect(
      controller.update('v1', {
        pos: 'interjection' as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates create payloads before sending them', async () => {
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

    expect(vocabularyClient.send).not.toHaveBeenCalled();
  });

  it('wraps upstream errors into HTTP errors', async () => {
    vocabularyClient.send.mockReturnValue(
      throwError(() => ({ status: 404, message: 'Word not found' })),
    );

    await expect(controller.findById('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Word not found',
    });
  });
});
