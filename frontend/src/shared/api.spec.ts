import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processImage,
  checkHealth,
  generateSpeech,
  createDocument,
  fetchDocuments,
  fetchDocument,
  updateDocument,
  deleteDocument,
  addVocabularyWord,
  fetchVocabulary,
  fetchDueVocabulary,
  updateVocabularyWord,
  deleteVocabularyWord,
  startPractice,
  submitAnswer,
  completePractice,
} from './api';

describe('API service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('processImage', () => {
    it('should send FormData with image and return response', async () => {
      const mockResponse = {
        rawText: 'Hello',
        markdown: '# Hello',
        filename: 'test.png',
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const file = new File(['data'], 'test.png', { type: 'image/png' });
      const result = await processImage(file);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ocr',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );

      const form = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(form.get('image')).toBeInstanceOf(File);
    });

    it('should pass AbortSignal when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rawText: 'Hello',
          markdown: '# Hello',
          filename: 'test.png',
        }),
      });

      const controller = new AbortController();
      const file = new File(['data'], 'test.png', { type: 'image/png' });

      await processImage(file, controller.signal);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ocr',
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });

    it('should throw Error with message from API on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'No image file provided' }),
      });

      const file = new File(['data'], 'test.png', { type: 'image/png' });
      await expect(processImage(file)).rejects.toThrow('No image file provided');
    });

    it('should fall back to statusText when json parsing fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('not json');
        },
      });

      const file = new File(['data'], 'test.png', { type: 'image/png' });
      await expect(processImage(file)).rejects.toThrow('Internal Server Error');
    });
  });

  describe('checkHealth', () => {
    it('should fetch /api/health and return response', async () => {
      const mockResponse = {
        paddleOcrReachable: true,
        paddleOcrModels: ['det', 'rec'],
        paddleOcrDevice: 'gpu',
        lmStudioReachable: true,
        lmStudioModels: ['qwen/qwen3.5-9b'],
        superToneReachable: true,
        kokoroReachable: true,
        f5TtsReachable: true,
        f5TtsDevice: 'gpu',
        voxtralReachable: false,
        voxtralDevice: null,
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await checkHealth();

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('/api/health');
    });

    it('should throw Error with message from API on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ message: 'OCR backend unavailable' }),
      });

      await expect(checkHealth()).rejects.toThrow('OCR backend unavailable');
    });
  });

  describe('generateSpeech', () => {
    const settings = {
      engine: 'supertone' as const,
      voice: 'M1',
      lang: 'en',
      speed: 1.0,
      totalSteps: 5,
    };

    it('should POST to /api/tts with serialized settings and return a Blob', async () => {
      const fakeBlob = new Blob(['audio'], { type: 'audio/wav' });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => fakeBlob });

      const result = await generateSpeech('hello world', settings);

      expect(result).toBe(fakeBlob);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'hello world', ...settings }),
        }),
      );
    });

    it('should pass AbortSignal when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() });

      const controller = new AbortController();
      await generateSpeech('text', settings, controller.signal);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts',
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('should throw Error with message from API on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ message: 'TTS sidecar down' }),
      });

      await expect(generateSpeech('text', settings)).rejects.toThrow('TTS sidecar down');
    });

    it('should reject kokoro requests with Cyrillic text before fetch', async () => {
      global.fetch = vi.fn();

      await expect(
        generateSpeech('Привет мир', {
          engine: 'kokoro',
          voice: 'af_heart',
          speed: 1.0,
        }),
      ).rejects.toThrow(
        'Kokoro in this stack supports English voices only. Use another TTS engine for Cyrillic text.',
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fall back to statusText when json parsing fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('not json'); },
      });

      await expect(generateSpeech('text', settings)).rejects.toThrow('Internal Server Error');
    });

    it('should POST FormData for f5 requests', async () => {
      const fakeBlob = new Blob(['audio'], { type: 'audio/wav' });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => fakeBlob });

      const result = await generateSpeech('hello world', {
        engine: 'f5',
        refText: 'Reference text',
        refAudioFile: new File(['wav'], 'reference.wav', { type: 'audio/wav' }),
        autoTranscribe: false,
        removeSilence: true,
      });

      expect(result).toBe(fakeBlob);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
      const form = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(form.get('engine')).toBe('f5');
      expect(form.get('refText')).toBe('Reference text');
      expect(form.get('autoTranscribe')).toBe('false');
      expect(form.get('removeSilence')).toBe('true');
      expect(form.get('refAudio')).toBeInstanceOf(File);
    });

    it('should POST JSON for voxtral requests', async () => {
      const fakeBlob = new Blob(['audio'], { type: 'audio/wav' });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => fakeBlob });

      const result = await generateSpeech('hello world', {
        engine: 'voxtral',
        voice: 'casual_male',
        format: 'wav',
      });

      expect(result).toBe(fakeBlob);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'hello world',
            engine: 'voxtral',
            voice: 'casual_male',
            format: 'wav',
          }),
        }),
      );
    });
  });

  describe('createDocument', () => {
    it('should POST to /api/documents and return saved document', async () => {
      const mockDoc = {
        id: '1',
        markdown: '# Hi',
        filename: 'a.png',
        createdAt: '',
        updatedAt: '',
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockDoc });

      const result = await createDocument('# Hi', 'a.png');

      expect(result).toEqual(mockDoc);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/documents',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: '# Hi', filename: 'a.png' }),
        }),
      );
    });

    it('should throw on error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 400, statusText: 'Bad Request',
        json: async () => ({ message: 'markdown is required' }),
      });

      await expect(createDocument('', 'a.png')).rejects.toThrow('markdown is required');
    });
  });

  describe('fetchDocuments', () => {
    it('should GET /api/documents and return list', async () => {
      const mockDocs = [{
        id: '1',
        markdown: '# Hi',
        filename: 'a.png',
        createdAt: '',
        updatedAt: '',
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      }];
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockDocs });

      const result = await fetchDocuments();

      expect(result).toEqual(mockDocs);
      expect(global.fetch).toHaveBeenCalledWith('/api/documents');
    });
  });

  describe('fetchDocument', () => {
    it('should GET /api/documents/:id and return document', async () => {
      const mockDoc = {
        id: '1',
        markdown: '# Hi',
        filename: 'a.png',
        createdAt: '',
        updatedAt: '',
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockDoc });

      const result = await fetchDocument('1');

      expect(result).toEqual(mockDoc);
      expect(global.fetch).toHaveBeenCalledWith('/api/documents/1');
    });

    it('should throw 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 404, statusText: 'Not Found',
        json: async () => ({ message: 'Document not found' }),
      });

      await expect(fetchDocument('missing')).rejects.toThrow('Document not found');
    });
  });

  describe('updateDocument', () => {
    it('should PUT to /api/documents/:id and return updated document', async () => {
      const mockDoc = {
        id: '1',
        markdown: '# Updated',
        filename: 'a.png',
        createdAt: '',
        updatedAt: '',
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockDoc });

      const result = await updateDocument('1', '# Updated');

      expect(result).toEqual(mockDoc);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/documents/1',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: '# Updated' }),
        }),
      );
    });
  });

  describe('deleteDocument', () => {
    it('should DELETE /api/documents/:id', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await deleteDocument('1');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/documents/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should throw on error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 404, statusText: 'Not Found',
        json: async () => ({ message: 'Document not found' }),
      });

      await expect(deleteDocument('missing')).rejects.toThrow('Document not found');
    });
  });

  describe('vocabulary API', () => {
    it('should POST /api/vocabulary and return created word', async () => {
      const mockWord = {
        id: 'word-1',
        word: 'hello',
        vocabType: 'word',
        translation: 'привет',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'Hello there.',
        sourceDocumentId: null,
        intervalDays: 1,
        easinessFactor: 2.5,
        repetitions: 0,
        nextReviewAt: '2026-03-21T00:00:00.000Z',
        createdAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:00.000Z',
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockWord });

      const result = await addVocabularyWord({
        word: 'hello',
        vocabType: 'word',
        translation: 'привет',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'Hello there.',
      });

      expect(result).toEqual(mockWord);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/vocabulary',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: 'hello',
            vocabType: 'word',
            translation: 'привет',
            targetLang: 'en',
            nativeLang: 'ru',
            contextSentence: 'Hello there.',
          }),
        }),
      );
    });

    it('should GET /api/vocabulary with language filters', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

      await fetchVocabulary('en', 'ru');

      expect(global.fetch).toHaveBeenCalledWith('/api/vocabulary?targetLang=en&nativeLang=ru');
    });

    it('should GET /api/vocabulary without filters', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

      await fetchVocabulary();

      expect(global.fetch).toHaveBeenCalledWith('/api/vocabulary');
    });

    it('should GET /api/vocabulary/review/due with limit', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

      await fetchDueVocabulary(10);

      expect(global.fetch).toHaveBeenCalledWith('/api/vocabulary/review/due?limit=10');
    });

    it('should PUT /api/vocabulary/:id and return updated word', async () => {
      const mockWord = {
        id: 'word-1',
        word: 'hello',
        vocabType: 'word',
        translation: 'здравствуй',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'Hello again.',
        sourceDocumentId: null,
        intervalDays: 2,
        easinessFactor: 2.6,
        repetitions: 1,
        nextReviewAt: '2026-03-22T00:00:00.000Z',
        createdAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T01:00:00.000Z',
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockWord });

      const result = await updateVocabularyWord('word-1', 'здравствуй', 'Hello again.');

      expect(result).toEqual(mockWord);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/vocabulary/word-1',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            translation: 'здравствуй',
            contextSentence: 'Hello again.',
          }),
        }),
      );
    });

    it('should DELETE /api/vocabulary/:id', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await deleteVocabularyWord('word-1');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/vocabulary/word-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('practice API', () => {
    it('should POST /api/practice/start with payload', async () => {
      const mockSession = {
        sessionId: 'session-1',
        exercises: [{
          vocabularyId: 'word-1',
          word: 'hello',
          exerciseType: 'spelling',
          prompt: 'Spell hello',
          correctAnswer: 'hello',
        }],
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockSession });

      const result = await startPractice({ targetLang: 'en', nativeLang: 'ru', wordLimit: 5 });

      expect(result).toEqual(mockSession);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/practice/start',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLang: 'en', nativeLang: 'ru', wordLimit: 5 }),
        }),
      );
    });

    it('should POST /api/practice/start with empty payload by default', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessionId: 'session-1', exercises: [] }),
      });

      await startPractice();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/practice/start',
        expect.objectContaining({
          body: JSON.stringify({}),
        }),
      );
    });

    it('should POST /api/practice/answer', async () => {
      const mockResult = {
        isCorrect: false,
        errorPosition: '2',
        qualityRating: 2,
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResult });

      const result = await submitAnswer({
        sessionId: 'session-1',
        vocabularyId: 'word-1',
        exerciseType: 'spelling',
        prompt: 'Spell hello',
        correctAnswer: 'hello',
        userAnswer: 'helo',
      });

      expect(result).toEqual(mockResult);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/practice/answer',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'session-1',
            vocabularyId: 'word-1',
            exerciseType: 'spelling',
            prompt: 'Spell hello',
            correctAnswer: 'hello',
            userAnswer: 'helo',
          }),
        }),
      );
    });

    it('should POST /api/practice/complete', async () => {
      const mockAnalysis = {
        sessionId: 'session-1',
        overallScore: 80,
        summary: 'Good work',
        totalExercises: 5,
        correctCount: 4,
        wordAnalyses: [],
      };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockAnalysis });

      const result = await completePractice('session-1');

      expect(result).toEqual(mockAnalysis);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/practice/complete',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: 'session-1' }),
        }),
      );
    });
  });
});
