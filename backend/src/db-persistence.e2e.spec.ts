/**
 * E2E tests for database persistence:
 *   - Document save / CRUD via /api/documents
 *   - Vocabulary word / expression save & CRUD via /api/vocabulary
 *
 * No external sidecars required. Uses an in-memory SQLite database.
 *
 * Run:
 *   npm test --workspace=backend -- --testPathPattern=db-persistence
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './presentation/app.module';
import { SqliteConfig } from './infrastructure/config/sqlite.config';
import { IVocabularyLlmService } from './domain/ports/vocabulary-llm-service.port';

let app: INestApplication;
let baseUrl: string;

const mockVocabularyLlmService = {
  generateExercises: jest.fn(async (words: any[], limit: number) =>
    words.slice(0, limit).map((word) => ({
      vocabularyId: word.id,
      word: word.word,
      exerciseType: 'spelling',
      prompt: `Type the word "${word.word}"`,
      correctAnswer: word.word,
      options: undefined,
    })),
  ),
  analyzeSession: jest.fn(async (words: any[], attempts: any[]) => ({
    overallScore:
      attempts.length === 0
        ? 0
        : Math.round(
            (attempts.filter((attempt) => attempt.isCorrect).length /
              attempts.length) *
              100,
          ),
    summary: 'Practice session complete',
    wordAnalyses: words.map((word) => ({
      vocabularyId: word.id,
      word: word.word,
      errorPattern: 'Spelling mismatch',
      mnemonicSentence: `Remember ${word.word} in context.`,
      difficultyAssessment: 'medium',
      suggestedFocus: 'Review spelling',
    })),
  })),
};

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SqliteConfig)
    .useValue({ dbPath: ':memory:' })
    .overrideProvider(IVocabularyLlmService)
    .useValue(mockVocabularyLlmService)
    .compile();

  app = moduleFixture.createNestApplication();
  await app.init();
  await app.listen(0);
  const port = (app.getHttpServer().address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

afterAll(async () => {
  if (app) await app.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function get(
  path: string,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers });
}

async function put(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function del(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

describe('E2E: Document persistence (/api/documents)', () => {
  let createdId: string;

  it('POST /api/documents — creates a document and returns 201', async () => {
    const res = await post('/api/documents', {
      markdown: '# Hello\n\nSome OCR content.',
      filename: 'test-image.jpg',
    });

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.markdown).toBe('# Hello\n\nSome OCR content.');
    expect(body.filename).toBe('test-image.jpg');
    expect(body.createdAt).toBeTruthy();
    expect(body.updatedAt).toBeTruthy();

    createdId = body.id;
  });

  it('GET /api/documents — lists all documents, includes the created one', async () => {
    const res = await get('/api/documents');
    expect(res.status).toBe(200);
    const body: any[] = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((d) => d.id === createdId);
    expect(found).toBeDefined();
    expect(found.filename).toBe('test-image.jpg');
  });

  it('GET /api/documents/:id — returns the document by id', async () => {
    const res = await get(`/api/documents/${createdId}`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.id).toBe(createdId);
    expect(body.markdown).toBe('# Hello\n\nSome OCR content.');
  });

  it('PUT /api/documents/:id — updates the markdown', async () => {
    const res = await put(`/api/documents/${createdId}`, {
      markdown: '# Updated\n\nEdited content.',
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.id).toBe(createdId);
    expect(body.markdown).toBe('# Updated\n\nEdited content.');
  });

  it('GET /api/documents/:id — reflects the updated markdown', async () => {
    const res = await get(`/api/documents/${createdId}`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.markdown).toBe('# Updated\n\nEdited content.');
  });

  it('GET /api/documents/:id — returns 304 when If-None-Match matches', async () => {
    const first = await get(`/api/documents/${createdId}`);
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');

    expect(etag).toBeTruthy();

    const cached = await get(`/api/documents/${createdId}`, {
      'If-None-Match': etag!,
    });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
  });

  it('DELETE /api/documents/:id — removes the document', async () => {
    const res = await del(`/api/documents/${createdId}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/documents/:id — returns 404 after deletion', async () => {
    const res = await get(`/api/documents/${createdId}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/documents/:id — returns 404 for unknown id', async () => {
    const res = await get('/api/documents/non-existent-id');
    expect(res.status).toBe(404);
  });

  it('POST /api/documents — returns 400 when markdown is empty', async () => {
    const res = await post('/api/documents', {
      markdown: '   ',
      filename: 'file.jpg',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/documents — returns 400 when filename is missing', async () => {
    const res = await post('/api/documents', {
      markdown: '# Content',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

describe('E2E: Vocabulary persistence (/api/vocabulary)', () => {
  let wordId: string;
  let docId: string;
  let batchIds: string[] = [];

  beforeAll(async () => {
    // Create a document so we can test sourceDocumentId linkage
    const res = await post('/api/documents', {
      markdown: '# Source doc\n\nThe **cat** sat on the mat.',
      filename: 'source.jpg',
    });
    const body: any = await res.json();
    docId = body.id;
  });

  it('POST /api/vocabulary — adds a word and returns 201', async () => {
    const res = await post('/api/vocabulary', {
      word: 'cat',
      vocabType: 'word',
      translation: 'кот',
      targetLang: 'en',
      nativeLang: 'ru',
      contextSentence: 'The cat sat on the mat.',
      sourceDocumentId: docId,
    });

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.word).toBe('cat');
    expect(body.vocabType).toBe('word');
    expect(body.translation).toBe('кот');
    expect(body.targetLang).toBe('en');
    expect(body.nativeLang).toBe('ru');
    expect(body.contextSentence).toBe('The cat sat on the mat.');
    expect(body.sourceDocumentId).toBe(docId);
    expect(typeof body.intervalDays).toBe('number');
    expect(typeof body.easinessFactor).toBe('number');
    expect(typeof body.repetitions).toBe('number');

    wordId = body.id;
  });

  it('POST /api/vocabulary — adds a phrasal_verb', async () => {
    const res = await post('/api/vocabulary', {
      word: 'give up',
      vocabType: 'phrasal_verb',
      translation: 'сдаться',
      targetLang: 'en',
      nativeLang: 'ru',
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.vocabType).toBe('phrasal_verb');
  });

  it('POST /api/vocabulary — adds an idiom', async () => {
    const res = await post('/api/vocabulary', {
      word: 'bite the bullet',
      vocabType: 'idiom',
      translation: 'стиснуть зубы',
      targetLang: 'en',
      nativeLang: 'ru',
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.vocabType).toBe('idiom');
  });

  it('POST /api/vocabulary — returns 409 on duplicate word+lang', async () => {
    const res = await post('/api/vocabulary', {
      word: 'cat',
      vocabType: 'word',
      translation: 'кошка',
      targetLang: 'en',
      nativeLang: 'ru',
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/vocabulary — allows same word for different language pair', async () => {
    const res = await post('/api/vocabulary', {
      word: 'cat',
      vocabType: 'word',
      translation: 'chat',
      targetLang: 'en',
      nativeLang: 'fr',
    });
    expect(res.status).toBe(201);
  });

  it('POST /api/vocabulary/batch — creates multiple vocabulary items', async () => {
    const res = await post('/api/vocabulary/batch', [
      {
        word: 'turn on',
        vocabType: 'phrasal_verb',
        translation: 'включать',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'Turn on the light.',
      },
      {
        word: 'piece of cake',
        vocabType: 'idiom',
        translation: 'проще простого',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'The exam was a piece of cake.',
      },
    ]);

    expect(res.status).toBe(201);
    const body: any[] = await res.json();
    expect(body).toHaveLength(2);
    batchIds = body.map((item) => item.id);
  });

  it('GET /api/vocabulary — lists all words', async () => {
    const res = await get('/api/vocabulary');
    expect(res.status).toBe(200);
    const body: any[] = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(4);
  });

  it('GET /api/vocabulary?targetLang=en&nativeLang=ru — filters by language pair', async () => {
    const res = await get('/api/vocabulary?targetLang=en&nativeLang=ru');
    expect(res.status).toBe(200);
    const body: any[] = await res.json();
    expect(body.every((w) => w.targetLang === 'en' && w.nativeLang === 'ru')).toBe(true);
    const words = body.map((w) => w.word);
    expect(words).toContain('cat');
    expect(words).toContain('give up');
    expect(words).not.toContain('chat'); // fr pair
  });

  it('GET /api/vocabulary/:id — returns the word by id', async () => {
    const res = await get(`/api/vocabulary/${wordId}`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.id).toBe(wordId);
    expect(body.word).toBe('cat');
  });

  it('GET /api/vocabulary/:id — returns 304 when If-None-Match matches', async () => {
    const first = await get(`/api/vocabulary/${wordId}`);
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');

    expect(etag).toBeTruthy();

    const cached = await get(`/api/vocabulary/${wordId}`, {
      'If-None-Match': etag!,
    });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
  });

  it('PUT /api/vocabulary/:id — updates translation and context', async () => {
    const res = await put(`/api/vocabulary/${wordId}`, {
      translation: 'кот / кошка',
      contextSentence: 'The cat is sleeping.',
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.translation).toBe('кот / кошка');
    expect(body.contextSentence).toBe('The cat is sleeping.');
  });

  it('GET /api/vocabulary/review/due — returns due words list (initially all new words are due)', async () => {
    const res = await get('/api/vocabulary/review/due');
    expect(res.status).toBe(200);
    const body: any[] = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // All new words have nextReviewAt = now, so at least 1 should be due
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /api/vocabulary/review/due?limit=1 — respects the limit parameter', async () => {
    const res = await get('/api/vocabulary/review/due?limit=1');
    expect(res.status).toBe(200);
    const body: any[] = await res.json();
    expect(body).toHaveLength(1);
  });

  it('DELETE /api/vocabulary/:id — removes the word', async () => {
    const res = await del(`/api/vocabulary/${wordId}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/vocabulary/:id — returns 404 after deletion', async () => {
    const res = await get(`/api/vocabulary/${wordId}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/vocabulary/:id — returns 404 for unknown id', async () => {
    const res = await get('/api/vocabulary/non-existent-id');
    expect(res.status).toBe(404);
  });

  it('POST /api/vocabulary — returns 400 when word is empty', async () => {
    const res = await post('/api/vocabulary', {
      word: '',
      vocabType: 'word',
      targetLang: 'en',
      nativeLang: 'ru',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/vocabulary — returns 400 when vocabType is invalid', async () => {
    const res = await post('/api/vocabulary', {
      word: 'hello',
      vocabType: 'unknown_type',
      targetLang: 'en',
      nativeLang: 'ru',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/vocabulary — returns 400 when langs are missing', async () => {
    const res = await post('/api/vocabulary', {
      word: 'hello',
      vocabType: 'word',
    });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/vocabulary/:id — returns 404 for non-existent id', async () => {
    const res = await del('/api/vocabulary/non-existent-id');
    expect(res.status).toBe(404);
  });

  afterAll(async () => {
    for (const id of batchIds) {
      await del(`/api/vocabulary/${id}`);
    }
  });
});

describe('E2E: Practice workflow (/api/practice)', () => {
  const practiceWords = ['lantern', 'harbor'];
  let wordIds: string[] = [];
  let sessionId = '';
  let exercises: any[] = [];
  let answeredVocabularyId = '';

  beforeAll(async () => {
    const results = await Promise.all(
      practiceWords.map((word) =>
        post('/api/vocabulary', {
          word,
          vocabType: 'word',
          translation: `ru-${word}`,
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: `Context for ${word}.`,
        }),
      ),
    );

    const bodies = await Promise.all(results.map((res) => res.json()));
    wordIds = bodies.map((body: any) => body.id);
  });

  afterAll(async () => {
    for (const id of wordIds) {
      await del(`/api/vocabulary/${id}`);
    }
  });

  it('POST /api/practice/start — creates a session with generated exercises', async () => {
    const res = await post('/api/practice/start', {
      targetLang: 'en',
      nativeLang: 'ru',
      wordLimit: 2,
    });

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.sessionId).toBeTruthy();
    expect(body.exercises).toHaveLength(2);
    expect(mockVocabularyLlmService.generateExercises).toHaveBeenCalled();

    sessionId = body.sessionId;
    exercises = body.exercises;
  });

  it('POST /api/practice/answer — records a correct answer', async () => {
    const first = exercises[0];
    answeredVocabularyId = first.vocabularyId;
    const res = await post('/api/practice/answer', {
      sessionId,
      vocabularyId: first.vocabularyId,
      exerciseType: first.exerciseType,
      prompt: first.prompt,
      correctAnswer: first.correctAnswer,
      userAnswer: first.correctAnswer,
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      isCorrect: true,
      errorPosition: null,
      qualityRating: 5,
    });
  });

  it('POST /api/practice/answer — records an incorrect answer', async () => {
    const second = exercises[1];
    const res = await post('/api/practice/answer', {
      sessionId,
      vocabularyId: second.vocabularyId,
      exerciseType: second.exerciseType,
      prompt: second.prompt,
      correctAnswer: second.correctAnswer,
      userAnswer: 'wrong-answer',
    });

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.isCorrect).toBe(false);
    expect(body.errorPosition).toBeTruthy();
    expect(body.qualityRating).toBe(1);
  });

  it('GET /api/practice/sessions — returns completed and in-progress sessions', async () => {
    const res = await get('/api/practice/sessions?limit=1');
    expect(res.status).toBe(200);
    const body: any[] = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(sessionId);
  });

  it('GET /api/practice/stats/:vocabularyId — returns attempts for a vocabulary item', async () => {
    const res = await get(`/api/practice/stats/${answeredVocabularyId}`);
    expect(res.status).toBe(200);
    const body: any[] = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].vocabularyId).toBe(answeredVocabularyId);
  });

  it('POST /api/practice/complete — finalizes the session and returns analysis', async () => {
    const res = await post('/api/practice/complete', { sessionId });

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.totalExercises).toBe(2);
    expect(body.correctCount).toBe(1);
    expect(body.overallScore).toBe(50);
    expect(body.wordAnalyses).toHaveLength(2);
    expect(mockVocabularyLlmService.analyzeSession).toHaveBeenCalled();
  });
});
