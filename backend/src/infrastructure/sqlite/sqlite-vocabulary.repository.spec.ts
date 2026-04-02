import { SqliteVocabularyRepository } from './sqlite-vocabulary.repository';
import { SqliteConnectionProvider } from './sqlite-connection.provider';
import { SqliteConfig } from '../config/sqlite.config';
import { VOCABULARY_DUPLICATE_ERROR } from '../../domain/ports/vocabulary-repository.port';

describe('SqliteVocabularyRepository', () => {
  let repo: SqliteVocabularyRepository;
  let connection: SqliteConnectionProvider;

  beforeEach(() => {
    const config = { dbPath: ':memory:' } as SqliteConfig;
    connection = new SqliteConnectionProvider(config);
    connection.onModuleInit();
    repo = new SqliteVocabularyRepository(connection);
    repo.onModuleInit();
  });

  afterEach(() => {
    connection.onModuleDestroy();
  });

  it('creates a vocabulary word and returns it', async () => {
    const word = await repo.create(
      'beautiful', 'word', 'красивый', 'en', 'ru',
      'The sunset was beautiful.', null,
    );

    expect(word.id).toBeDefined();
    expect(word.word).toBe('beautiful');
    expect(word.vocabType).toBe('word');
    expect(word.translation).toBe('красивый');
    expect(word.targetLang).toBe('en');
    expect(word.nativeLang).toBe('ru');
    expect(word.intervalDays).toBe(0);
    expect(word.easinessFactor).toBe(2.5);
    expect(word.repetitions).toBe(0);
  });

  it('rejects duplicate word+lang pair', async () => {
    await repo.create('beautiful', 'word', 'красивый', 'en', 'ru', '', null);

    await expect(
      repo.create('beautiful', 'idiom', 'другой', 'en', 'ru', '', null),
    ).rejects.toThrow();
  });

  it('allows same word with different lang pair', async () => {
    await repo.create('beautiful', 'word', 'красивый', 'en', 'ru', '', null);
    const word2 = await repo.create('beautiful', 'word', 'hermoso', 'en', 'es', '', null);

    expect(word2.nativeLang).toBe('es');
  });

  it('createMany returns an empty array for empty input', async () => {
    await expect(repo.createMany([])).resolves.toEqual([]);
  });

  it('createMany inserts multiple vocabulary records', async () => {
    const words = await repo.createMany([
      {
        word: 'hello',
        vocabType: 'word',
        translation: 'привет',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: '',
        sourceDocumentId: null,
      },
      {
        word: 'goodbye',
        vocabType: 'word',
        translation: 'пока',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: '',
        sourceDocumentId: 'doc-1',
      },
    ]);

    expect(words).toHaveLength(2);
    expect(await repo.findAll()).toHaveLength(2);
  });

  it('createMany normalizes unique constraint failures to the domain duplicate error', async () => {
    await repo.create('hello', 'word', 'привет', 'en', 'ru', '', null);

    await expect(
      repo.createMany([
        {
          word: 'hello',
          vocabType: 'word',
          translation: 'дубликат',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: '',
          sourceDocumentId: null,
        },
      ]),
    ).rejects.toThrow(VOCABULARY_DUPLICATE_ERROR);
  });

  it('findAll returns all words', async () => {
    await repo.create('hello', 'word', 'привет', 'en', 'ru', '', null);
    await repo.create('goodbye', 'word', 'пока', 'en', 'ru', '', null);

    const words = await repo.findAll();

    expect(words).toHaveLength(2);
  });

  it('findAll filters by language pair', async () => {
    await repo.create('hello', 'word', 'привет', 'en', 'ru', '', null);
    await repo.create('hola', 'word', 'hello', 'es', 'en', '', null);

    const enRu = await repo.findAll('en', 'ru');

    expect(enRu).toHaveLength(1);
    expect(enRu[0].word).toBe('hello');
  });

  it('findAll falls back to unfiltered results when only one language is provided', async () => {
    await repo.create('hello', 'word', 'привет', 'en', 'ru', '', null);
    await repo.create('hola', 'word', 'hello', 'es', 'en', '', null);

    const result = await repo.findAll('en');

    expect(result).toHaveLength(2);
  });

  it('findById returns word when found', async () => {
    const created = await repo.create('test', 'word', 'тест', 'en', 'ru', '', null);

    const found = await repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found!.word).toBe('test');
  });

  it('findById returns null when not found', async () => {
    expect(await repo.findById('nonexistent')).toBeNull();
  });

  it('findByWord returns word when found', async () => {
    await repo.create('give up', 'phrasal_verb', 'сдаваться', 'en', 'ru', '', null);

    const found = await repo.findByWord('give up', 'en', 'ru');

    expect(found).not.toBeNull();
    expect(found!.vocabType).toBe('phrasal_verb');
  });

  it('findByWord returns null when not found', async () => {
    expect(await repo.findByWord('missing', 'en', 'ru')).toBeNull();
  });

  it('findDueForReview returns words with past next_review_at', async () => {
    await repo.create('due', 'word', 'пора', 'en', 'ru', '', null);
    // Create a word with future review date
    const future = await repo.create('future', 'word', 'будущее', 'en', 'es', '', null);
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    await repo.updateSrs(future.id, 1, 2.5, 1, futureDate);

    const due = await repo.findDueForReview(10);

    expect(due).toHaveLength(1);
    expect(due[0].word).toBe('due');
  });

  it('findDueForReview filters due words by language pair when both languages are provided', async () => {
    await repo.create('hello', 'word', 'привет', 'en', 'ru', '', null);
    await repo.create('hola', 'word', 'hello', 'es', 'en', '', null);

    const due = await repo.findDueForReview(10, 'es', 'en');

    expect(due).toHaveLength(1);
    expect(due[0].word).toBe('hola');
  });

  it('findDueForReview falls back to the unfiltered query when only one language is provided', async () => {
    await repo.create('hello', 'word', 'привет', 'en', 'ru', '', null);
    await repo.create('hola', 'word', 'hello', 'es', 'en', '', null);

    const due = await repo.findDueForReview(10, 'es');

    expect(due).toHaveLength(2);
  });

  it('updateSrs modifies SM-2 fields', async () => {
    const created = await repo.create('test', 'word', 'тест', 'en', 'ru', '', null);
    const nextReview = '2025-01-02T00:00:00.000Z';

    const updated = await repo.updateSrs(created.id, 1, 2.6, 1, nextReview);

    expect(updated).not.toBeNull();
    expect(updated!.intervalDays).toBe(1);
    expect(updated!.easinessFactor).toBe(2.6);
    expect(updated!.repetitions).toBe(1);
    expect(updated!.nextReviewAt).toBe(nextReview);
  });

  it('updateSrs returns null when no row matches the id', async () => {
    await expect(
      repo.updateSrs('missing', 1, 2.6, 1, '2025-01-02T00:00:00.000Z'),
    ).resolves.toBeNull();
  });

  it('update modifies translation and context', async () => {
    const created = await repo.create('test', 'word', 'тест', 'en', 'ru', 'old', null);

    const updated = await repo.update(created.id, 'новый перевод', 'new context');

    expect(updated).not.toBeNull();
    expect(updated!.translation).toBe('новый перевод');
    expect(updated!.contextSentence).toBe('new context');
  });

  it('update also modifies the word when provided', async () => {
    const created = await repo.create('test', 'word', 'тест', 'en', 'ru', 'old', null);

    const updated = await repo.update(
      created.id,
      'новый перевод',
      'new context',
      'updated word',
    );

    expect(updated).not.toBeNull();
    expect(updated!.word).toBe('updated word');
    expect(updated!.translation).toBe('новый перевод');
    expect(updated!.contextSentence).toBe('new context');
  });

  it('update also modifies vocab type and pos when provided', async () => {
    const created = await repo.create('test', 'word', 'тест', 'en', 'ru', 'old', null);

    const updated = await repo.update(
      created.id,
      'новый перевод',
      'new context',
      'updated word',
      'idiom',
      'adjective',
    );

    expect(updated).not.toBeNull();
    expect(updated!.word).toBe('updated word');
    expect(updated!.vocabType).toBe('idiom');
    expect(updated!.pos).toBe('adjective');
  });

  it('update preserves existing pos when pos is omitted', async () => {
    const created = await repo.create(
      'test',
      'word',
      'тест',
      'en',
      'ru',
      'old',
      null,
      'verb',
    );

    const updated = await repo.update(created.id, 'новый перевод', 'new context');

    expect(updated).not.toBeNull();
    expect(updated!.pos).toBe('verb');
  });

  it('update trims the provided word before saving', async () => {
    const created = await repo.create('test', 'word', 'тест', 'en', 'ru', 'old', null);

    const updated = await repo.update(
      created.id,
      'новый перевод',
      'new context',
      '  updated word  ',
    );

    expect(updated).not.toBeNull();
    expect(updated!.word).toBe('updated word');
  });

  it('update returns null when no row matches the id', async () => {
    await expect(repo.update('missing', 'x', 'y')).resolves.toBeNull();
  });

  it('delete removes word and returns true', async () => {
    const created = await repo.create('test', 'word', 'тест', 'en', 'ru', '', null);

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', async () => {
    expect(await repo.delete('missing')).toBe(false);
  });
});
