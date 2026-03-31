/**
 * Full integration test for the current OCR pipeline:
 *   LM Studio OCR -> backend -> HTTP API
 *
 * Prerequisites:
 *   - LM Studio running on localhost:1234
 *   - OCR_MODEL and STRUCTURING_MODEL loaded in LM Studio
 *   - Test image at project root: image_test.jpg
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './presentation/app.module';

const TEST_IMAGE = path.resolve(__dirname, '..', '..', 'image_test.jpg');
const LM_STUDIO_URL = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
const OCR_MODEL = process.env.OCR_MODEL || 'qwen/qwen3.5-9b';
const STRUCTURING_MODEL = process.env.STRUCTURING_MODEL || 'qwen/qwen3.5-9b';

const SUPERTONE_URL = `http://${process.env.SUPERTONE_HOST || 'localhost'}:${process.env.SUPERTONE_PORT || '8100'}`;
const KOKORO_URL = `http://${process.env.KOKORO_HOST || 'localhost'}:${process.env.KOKORO_PORT || '8200'}`;

let lmStudioAvailable = false;
let supertoneAvailable = false;
let kokoroAvailable = false;
let imageExists = false;
let ocrModelLoaded = false;
let structuringModelLoaded = false;

function skipIf(reason: string) {
  console.warn(`SKIP: ${reason}`);
}

beforeAll(async () => {
  imageExists = fs.existsSync(TEST_IMAGE);

  try {
    const res = await fetch(`${LM_STUDIO_URL}/models`, {
      signal: AbortSignal.timeout(5000),
    });
    lmStudioAvailable = res.ok;
    if (lmStudioAvailable) {
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      const modelIds = Array.isArray(data.data)
        ? data.data.map((model) => model.id)
        : [];
      ocrModelLoaded = modelIds.includes(OCR_MODEL);
      structuringModelLoaded = modelIds.includes(STRUCTURING_MODEL);
      console.log('LM Studio models:', modelIds.join(', '));
    }
  } catch {
    lmStudioAvailable = false;
  }

  try {
    const res = await fetch(`${SUPERTONE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    supertoneAvailable = res.ok;
  } catch {
    supertoneAvailable = false;
  }

  try {
    const res = await fetch(`${KOKORO_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    kokoroAvailable = res.ok;
  } catch {
    kokoroAvailable = false;
  }

  if (!lmStudioAvailable) console.warn('LM Studio not running');
  if (!supertoneAvailable) console.warn(`Supertone sidecar not running (${SUPERTONE_URL})`);
  if (!kokoroAvailable) console.warn(`Kokoro sidecar not running (${KOKORO_URL})`);
  if (!imageExists) console.warn(`Test image not found at ${TEST_IMAGE}`);
});

describe('Integration: LM Studio OCR', () => {
  it('should reach LM Studio and list the OCR model', async () => {
    if (!lmStudioAvailable) {
      skipIf('LM Studio not running');
      return;
    }

    const res = await fetch(`${LM_STUDIO_URL}/models`);
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    const ids: string[] = data.data.map((m: any) => m.id);
    expect(ids).toContain(OCR_MODEL);
  });

  it('should extract OCR text from the test image', async () => {
    if (!lmStudioAvailable) {
      skipIf('LM Studio not running');
      return;
    }
    if (!ocrModelLoaded) {
      skipIf(`OCR model ${OCR_MODEL} not loaded`);
      return;
    }
    if (!imageExists) {
      skipIf('Test image unavailable');
      return;
    }

    const imageBuffer = fs.readFileSync(TEST_IMAGE);
    const base64 = imageBuffer.toString('base64');

    const res = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are an OCR engine. Return only the visible text with preserved line breaks.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
              {
                type: 'text',
                text: 'Extract all visible text only.',
              },
            ],
          },
        ],
        temperature: 0.0,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(180000),
    });

    expect(res.ok).toBe(true);
    const data: any = await res.json();
    const text: string = data.choices[0]?.message?.content ?? '';

    expect(text.length).toBeGreaterThan(20);
    expect(text.toLowerCase()).toContain('new friends');
    expect(text).not.toContain('<think>');
  }, 180000);
});

describe('Integration: LM Studio structuring', () => {
  it('should structure raw OCR text into markdown', async () => {
    if (!lmStudioAvailable) {
      skipIf('LM Studio not running');
      return;
    }
    if (!structuringModelLoaded) {
      skipIf(`Structuring model ${STRUCTURING_MODEL} not loaded`);
      return;
    }

    const sampleOcrText = `1 New friends
1A What's your name?
Hello!
a) Look at the photo. Read and listen to conversation 1.
STEFAN Hello, I'm Stefan. What's your name?
EMEL Hello, my name's Emel.
STEFAN Nice to meet you.
EMEL You too.`;

    const res = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: STRUCTURING_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You reconstruct raw OCR text into Markdown. Output only Markdown.',
          },
          {
            role: 'user',
            content: `Reconstruct the following OCR text into a well-structured Markdown document:\n\n${sampleOcrText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(180000),
    });

    expect(res.ok).toBe(true);
    const data: any = await res.json();
    const markdown: string = data.choices[0].message.content;

    expect(markdown.length).toBeGreaterThan(20);
    expect(markdown).toMatch(/#/);
    expect(markdown.toLowerCase()).toContain('stefan');
  }, 180000);
});

describe('Smoke: Supertone TTS sidecar', () => {
  it('should be reachable when available', async () => {
    if (!supertoneAvailable) {
      skipIf('Supertone sidecar not running');
      return;
    }

    const res = await fetch(`${SUPERTONE_URL}/health`);
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    expect(data.status).toBe('healthy');
  }, 10000);

  it('should synthesize speech and return audio bytes when available', async () => {
    if (!supertoneAvailable) {
      skipIf('Supertone sidecar not running');
      return;
    }

    const res = await fetch(`${SUPERTONE_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Integration test.',
        engine: 'supertone',
        voice: 'M1',
        lang: 'en',
        speed: 1.0,
        total_steps: 3,
      }),
      signal: AbortSignal.timeout(60000),
    });

    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toMatch(/audio/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(100);
  }, 60000);
});

describe('Smoke: Kokoro TTS sidecar', () => {
  it('should be reachable when available', async () => {
    if (!kokoroAvailable) {
      skipIf('Kokoro sidecar not running');
      return;
    }

    const res = await fetch(`${KOKORO_URL}/health`);
    expect(res.ok).toBe(true);
  }, 10000);

  it('should synthesize speech and return audio bytes when available', async () => {
    if (!kokoroAvailable) {
      skipIf('Kokoro sidecar not running');
      return;
    }

    const res = await fetch(`${KOKORO_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Integration test.',
        voice: 'af_heart',
        speed: 1.0,
      }),
      signal: AbortSignal.timeout(30000),
    });

    expect(res.ok).toBe(true);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(100);
  }, 30000);
});

describe('Integration: Full NestJS pipeline', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!lmStudioAvailable || !ocrModelLoaded || !imageExists) {
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/health should report OCR and LM Studio as reachable', async () => {
    if (!lmStudioAvailable || !ocrModelLoaded || !imageExists) {
      skipIf('Pipeline dependencies unavailable');
      return;
    }

    const port = app.getHttpServer().address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ocrReachable).toBe(true);
    expect(body.lmStudioReachable).toBe(true);
    expect(body.ocrModels.length).toBeGreaterThan(0);
    expect(body.lmStudioModels).toContain(STRUCTURING_MODEL);
  }, 15000);

  it('POST /api/ocr should process image through LM Studio OCR', async () => {
    if (!lmStudioAvailable || !ocrModelLoaded || !imageExists) {
      skipIf('Pipeline dependencies unavailable');
      return;
    }

    const port = app.getHttpServer().address().port;
    const imageBuffer = fs.readFileSync(TEST_IMAGE);

    const form = new FormData();
    form.append(
      'image',
      new Blob([imageBuffer], { type: 'image/jpeg' }),
      'image_test.jpg',
    );

    const res = await fetch(`http://127.0.0.1:${port}/api/ocr`, {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(201);
    const body: any = await res.json();

    expect(body.filename).toBe('image_test.jpg');
    expect(typeof body.rawText).toBe('string');
    expect(typeof body.markdown).toBe('string');
    expect(body.rawText.length).toBeGreaterThan(20);
    expect(body.markdown.length).toBeGreaterThan(20);
    expect(body.rawText).not.toContain('<think>');
    expect(body.rawText).not.toContain('No text detected');
    expect(body.markdown).not.toContain('No text detected');
  }, 360000);
});
