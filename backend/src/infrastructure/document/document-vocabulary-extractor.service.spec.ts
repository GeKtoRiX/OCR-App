import {
  DocumentVocabularyExtractorService,
  extractHeuristicDocumentVocabulary,
} from './document-vocabulary-extractor.service';

describe('extractHeuristicDocumentVocabulary', () => {
  it('extracts idioms, phrasal verbs, and normalized lemmas from markdown text', () => {
    const candidates = extractHeuristicDocumentVocabulary({
      documentId: 'doc-1',
      markdown:
        '# Notes\n\nThey pick up ideas quickly, but the lesson was a piece of cake. Children were reading books quickly.',
      targetLang: 'en',
      nativeLang: 'ru',
    });

    expect(candidates.some((candidate) => candidate.normalized === 'pick up')).toBe(true);
    expect(candidates.some((candidate) => candidate.normalized === 'piece of cake')).toBe(true);
    expect(candidates.some((candidate) => candidate.normalized === 'child')).toBe(true);
    expect(candidates.some((candidate) => candidate.normalized === 'book')).toBe(true);
    expect(candidates.some((candidate) => candidate.pos === 'adverb')).toBe(true);
  });

  it('avoids duplicate sentence-level candidates for repeated idiom matches', () => {
    const candidates = extractHeuristicDocumentVocabulary({
      documentId: 'doc-1',
      markdown: 'This was a piece of cake and still a piece of cake.',
      targetLang: 'en',
      nativeLang: 'ru',
    });

    expect(
      candidates.filter((candidate) => candidate.normalized === 'piece of cake'),
    ).toHaveLength(1);
  });
});

describe('DocumentVocabularyExtractorService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('falls back to the heuristic extractor when stanza extraction fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
    const service = new DocumentVocabularyExtractorService();

    const candidates = await service.extract({
      documentId: 'doc-1',
      markdown: 'They pick up new skills quickly.',
      targetLang: 'en',
      nativeLang: 'ru',
    });

    expect(candidates.some((candidate) => candidate.normalized === 'pick up')).toBe(true);
  });

  it('applies BERT defaults for English stanza candidates', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              surface: 'Beautiful',
              normalized: 'beautiful',
              lemma: 'beautiful',
              vocabType: 'word',
              pos: 'adjective',
              contextSentence: 'Beautiful sunsets inspire everyone.',
              sentenceIndex: 0,
              startOffset: 0,
              endOffset: 9,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          scores: [{ id: '0', bertProb: 0.95, selectedByDefault: false }],
        }),
      }) as any;

    const service = new DocumentVocabularyExtractorService();
    const candidates = await service.extract({
      documentId: 'doc-1',
      markdown: 'Beautiful sunsets inspire everyone.',
      targetLang: 'en',
      nativeLang: 'ru',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].surface).toBe('Beautiful');
    expect(candidates[0].selectedByDefault).toBe(false);
    expect(candidates[0].reviewSource).toBe('base_nlp');
  });

  it('skips BERT scoring for non-English targets and returns stanza candidates as-is', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            surface: 'bonjour',
            normalized: 'bonjour',
            lemma: 'bonjour',
            vocabType: 'word',
            pos: 'noun',
            contextSentence: 'bonjour tout le monde',
            sentenceIndex: 0,
            startOffset: 0,
            endOffset: 7,
            selectedByDefault: true,
          },
        ],
      }),
    }) as any;

    const service = new DocumentVocabularyExtractorService();
    const candidates = await service.extract({
      documentId: 'doc-1',
      markdown: 'bonjour tout le monde',
      targetLang: 'fr',
      nativeLang: 'ru',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(candidates[0].normalized).toBe('bonjour');
    expect(candidates[0].selectedByDefault).toBe(true);
  });
});
