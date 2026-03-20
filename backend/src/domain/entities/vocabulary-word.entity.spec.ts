import { VocabularyWord } from './vocabulary-word.entity';

describe('VocabularyWord', () => {
  it('stores all properties', () => {
    const word = new VocabularyWord(
      'id-1',
      'beautiful',
      'word',
      'красивый',
      'en',
      'ru',
      'The sunset was beautiful.',
      'doc-1',
      '2024-01-01T00:00:00.000Z',
      '2024-01-01T00:00:00.000Z',
      0,
      2.5,
      0,
      '2024-01-01T00:00:00.000Z',
    );

    expect(word.id).toBe('id-1');
    expect(word.word).toBe('beautiful');
    expect(word.vocabType).toBe('word');
    expect(word.translation).toBe('красивый');
    expect(word.targetLang).toBe('en');
    expect(word.nativeLang).toBe('ru');
    expect(word.contextSentence).toBe('The sunset was beautiful.');
    expect(word.sourceDocumentId).toBe('doc-1');
    expect(word.intervalDays).toBe(0);
    expect(word.easinessFactor).toBe(2.5);
    expect(word.repetitions).toBe(0);
    expect(word.nextReviewAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('allows null sourceDocumentId', () => {
    const word = new VocabularyWord(
      'id-2', 'give up', 'phrasal_verb', 'сдаваться', 'en', 'ru',
      'Never give up.', null,
      '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z',
      0, 2.5, 0, '2024-01-01T00:00:00.000Z',
    );

    expect(word.sourceDocumentId).toBeNull();
    expect(word.vocabType).toBe('phrasal_verb');
  });
});
