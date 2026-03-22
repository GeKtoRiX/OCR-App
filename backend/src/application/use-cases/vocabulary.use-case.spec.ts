import { VocabularyUseCase } from './vocabulary.use-case';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';

const mockWord = new VocabularyWord(
  'id-1', 'beautiful', 'word', 'красивый', 'en', 'ru',
  'The sunset was beautiful.', null,
  '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z',
  0, 2.5, 0, '2024-01-01T00:00:00.000Z',
);

describe('VocabularyUseCase', () => {
  let useCase: VocabularyUseCase;
  let repo: jest.Mocked<IVocabularyRepository>;

  beforeEach(() => {
    repo = {
      create: jest.fn().mockResolvedValue(mockWord),
      createMany: jest.fn().mockResolvedValue([mockWord]),
      findAll: jest.fn().mockResolvedValue([mockWord]),
      findById: jest.fn().mockResolvedValue(mockWord),
      findByWord: jest.fn().mockResolvedValue(mockWord),
      findDueForReview: jest.fn().mockResolvedValue([mockWord]),
      updateSrs: jest.fn().mockResolvedValue(mockWord),
      update: jest.fn().mockResolvedValue(mockWord),
      delete: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IVocabularyRepository>;
    useCase = new VocabularyUseCase(repo);
  });

  it('add calls repository.create and returns output', async () => {
    const result = await useCase.add({
      word: 'beautiful',
      vocabType: 'word',
      translation: 'красивый',
      targetLang: 'en',
      nativeLang: 'ru',
      contextSentence: 'The sunset was beautiful.',
    });

    expect(repo.create).toHaveBeenCalledWith(
      'beautiful', 'word', 'красивый', 'en', 'ru',
      'The sunset was beautiful.', null,
    );
    expect(result.id).toBe('id-1');
    expect(result.vocabType).toBe('word');
  });

  it('add propagates a non-null source document id', async () => {
    await useCase.add({
      word: 'beautiful',
      vocabType: 'word',
      translation: 'красивый',
      targetLang: 'en',
      nativeLang: 'ru',
      contextSentence: 'The sunset was beautiful.',
      sourceDocumentId: 'doc-1',
    });

    expect(repo.create).toHaveBeenCalledWith(
      'beautiful',
      'word',
      'красивый',
      'en',
      'ru',
      'The sunset was beautiful.',
      'doc-1',
    );
  });

  it('addMany maps repository input and output', async () => {
    const result = await useCase.addMany([
      {
        word: 'beautiful',
        vocabType: 'word',
        translation: 'красивый',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'The sunset was beautiful.',
      },
    ]);

    expect(repo.createMany).toHaveBeenCalledWith([
      {
        word: 'beautiful',
        vocabType: 'word',
        translation: 'красивый',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'The sunset was beautiful.',
        sourceDocumentId: null,
      },
    ]);
    expect(result).toHaveLength(1);
  });

  it('findAll delegates to repository', async () => {
    const result = await useCase.findAll('en', 'ru');

    expect(repo.findAll).toHaveBeenCalledWith('en', 'ru');
    expect(result).toHaveLength(1);
  });

  it('findById returns null when not found', async () => {
    repo.findById.mockResolvedValue(null);

    expect(await useCase.findById('missing')).toBeNull();
  });

  it('findById returns mapped output when found', async () => {
    await expect(useCase.findById('id-1')).resolves.toMatchObject({
      id: 'id-1',
      word: 'beautiful',
    });
  });

  it('findByWord delegates to repository', async () => {
    const result = await useCase.findByWord('beautiful', 'en', 'ru');

    expect(result).not.toBeNull();
    expect(result!.word).toBe('beautiful');
  });

  it('findByWord returns null when repository misses', async () => {
    repo.findByWord.mockResolvedValue(null);

    await expect(useCase.findByWord('missing', 'en', 'ru')).resolves.toBeNull();
  });

  it('findDueForReview uses default limit of 10', async () => {
    await useCase.findDueForReview();

    expect(repo.findDueForReview).toHaveBeenCalledWith(10);
  });

  it('findDueForReview passes through an explicit limit', async () => {
    await useCase.findDueForReview(3);

    expect(repo.findDueForReview).toHaveBeenCalledWith(3);
  });

  it('update returns null when not found', async () => {
    repo.update.mockResolvedValue(null);

    const result = await useCase.update('missing', {
      translation: 'new',
      contextSentence: 'new',
    });

    expect(result).toBeNull();
  });

  it('update returns mapped output when the repository updates a word', async () => {
    await expect(
      useCase.update('id-1', {
        translation: 'новый',
        contextSentence: 'новый контекст',
      }),
    ).resolves.toMatchObject({
      translation: 'красивый',
      word: 'beautiful',
    });
  });

  it('delete delegates to repository', async () => {
    expect(await useCase.delete('id-1')).toBe(true);
  });
});
