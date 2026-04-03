import { of } from 'rxjs';
import { VOCABULARY_PATTERNS } from '@ocr-app/shared';
import { TcpVocabularyRepository } from './tcp-vocabulary.repository';

describe('TcpVocabularyRepository', () => {
  const dto = {
    id: 'v1',
    word: 'beautiful',
    vocabType: 'word' as const,
    translation: 'красивый',
    targetLang: 'en',
    nativeLang: 'ru',
    contextSentence: 'The sunset was beautiful.',
    sourceDocumentId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    intervalDays: 0,
    easinessFactor: 2.5,
    repetitions: 0,
    nextReviewAt: '2024-01-01T00:00:00.000Z',
  };

  let client: { send: jest.Mock; close: jest.Mock };
  let repository: TcpVocabularyRepository;

  beforeEach(() => {
    client = {
      send: jest.fn().mockReturnValue(of(dto)),
      close: jest.fn(),
    };
    repository = new TcpVocabularyRepository(client as any);
  });

  it('creates vocabulary items through the TCP client', async () => {
    const created = await repository.create(
      'beautiful',
      'word',
      'красивый',
      'en',
      'ru',
      'The sunset was beautiful.',
      null,
    );

    expect(client.send).toHaveBeenCalledWith(VOCABULARY_PATTERNS.ADD, {
      word: 'beautiful',
      vocabType: 'word',
      pos: null,
      translation: 'красивый',
      targetLang: 'en',
      nativeLang: 'ru',
      contextSentence: 'The sunset was beautiful.',
      sourceDocumentId: undefined,
    });
    expect(created.word).toBe('beautiful');
    expect(created.translation).toBe('красивый');
  });

  it('finds vocabulary by word and maps null responses', async () => {
    client.send.mockReturnValueOnce(of(dto)).mockReturnValueOnce(of(null));

    const found = await repository.findByWord('beautiful', 'en', 'ru');
    const missing = await repository.findByWord('missing', 'en', 'ru');

    expect(client.send).toHaveBeenNthCalledWith(1, VOCABULARY_PATTERNS.FIND_BY_WORD, {
      word: 'beautiful',
      targetLang: 'en',
      nativeLang: 'ru',
    });
    expect(found?.id).toBe('v1');
    expect(missing).toBeNull();
  });

  it('closes the TCP client on module destroy', () => {
    repository.onModuleDestroy();
    expect(client.close).toHaveBeenCalled();
  });
});
