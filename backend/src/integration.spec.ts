/**
 * Full integration test for the production OCR pipeline:
 *   PaddleOCR sidecar -> backend -> LM Studio qwen structuring
 *
 * Prerequisites:
 *   - PaddleOCR sidecar running on localhost:8000
 *   - LM Studio running on localhost:1234
 *   - Structuring model loaded in LM Studio
 *   - Test image at project root: image_test.jpg
 *
 * Run:  npm test --workspace=backend -- --testPathPattern=integration
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './presentation/app.module';

const TEST_IMAGE = path.resolve(__dirname, '..', '..', 'image_test.jpg');
const LM_STUDIO_URL = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
const STRUCTURING_MODEL = process.env.STRUCTURING_MODEL || 'qwen/qwen3.5-9b';

let lmStudioAvailable = false;
let paddleOcrAvailable = false;
let imageExists = false;
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
      structuringModelLoaded = modelIds.includes(STRUCTURING_MODEL);
      console.log('LM Studio models:', modelIds.join(', '));
    }
  } catch {
    lmStudioAvailable = false;
  }

  try {
    const res = await fetch('http://localhost:8000/health', {
      signal: AbortSignal.timeout(5000),
    });
    paddleOcrAvailable = res.ok;
  } catch {
    paddleOcrAvailable = false;
  }

  if (!lmStudioAvailable) console.warn('LM Studio not running');
  if (!paddleOcrAvailable) console.warn('PaddleOCR sidecar not running');
  if (!imageExists) console.warn(`Test image not found at ${TEST_IMAGE}`);
});

describe('Integration: LM Studio structuring', () => {
  it('should reach LM Studio and list the structuring model', async () => {
    if (!lmStudioAvailable) {
      skipIf('LM Studio not running');
      return;
    }

    const res = await fetch(`${LM_STUDIO_URL}/models`);
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    const ids: string[] = data.data.map((m: any) => m.id);
    expect(ids).toContain(STRUCTURING_MODEL);
  });

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

describe('Integration: PaddleOCR sidecar', () => {
  it('should be reachable when available', async () => {
    if (!paddleOcrAvailable) {
      skipIf('PaddleOCR sidecar not running');
      return;
    }

    const res = await fetch('http://localhost:8000/health');
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.model_loaded).toBe(true);
  }, 10000);

  it('should list loaded OCR models when available', async () => {
    if (!paddleOcrAvailable) {
      skipIf('PaddleOCR sidecar not running');
      return;
    }

    const res = await fetch('http://localhost:8000/models');
    expect(res.ok).toBe(true);
    const data: any = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.models).toBeTruthy();
  }, 10000);

  it('PaddleOCRService should extract raw text from image', async () => {
    if (!paddleOcrAvailable || !imageExists) {
      skipIf('PaddleOCR sidecar or test image unavailable');
      return;
    }

    const { PaddleOCRConfig } = require('./infrastructure/config/paddleocr.config');
    const { PaddleOCRService } = require('./infrastructure/paddleocr/paddleocr-ocr.service');
    const { ImageData } = require('./domain/entities/image-data.entity');

    const config = new PaddleOCRConfig();
    const service = new PaddleOCRService(config);

    const buffer = fs.readFileSync(TEST_IMAGE);
    const image = new ImageData(buffer, 'image/jpeg', 'image_test.jpg');
    const text: string = await service.extractText(image);

    expect(text.length).toBeGreaterThan(20);
  }, 180000);
});

describe('Integration: Full NestJS pipeline', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!lmStudioAvailable || !paddleOcrAvailable || !imageExists) {
      return;
    }
    if (!structuringModelLoaded) {
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

  it('GET /api/health should report both dependencies as reachable', async () => {
    if (!lmStudioAvailable || !paddleOcrAvailable || !imageExists) {
      skipIf('Pipeline dependencies unavailable');
      return;
    }
    if (!structuringModelLoaded) {
      skipIf(`Structuring model ${STRUCTURING_MODEL} not loaded`);
      return;
    }

    const port = app.getHttpServer().address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.paddleOcrReachable).toBe(true);
    expect(body.lmStudioReachable).toBe(true);
    expect(body.paddleOcrModels.length).toBeGreaterThan(0);
    expect(body.lmStudioModels).toContain(STRUCTURING_MODEL);
  }, 15000);

  it('POST /api/ocr should process image through PaddleOCR and qwen structuring', async () => {
    if (!lmStudioAvailable || !paddleOcrAvailable || !imageExists) {
      skipIf('Pipeline dependencies unavailable');
      return;
    }
    if (!structuringModelLoaded) {
      skipIf(`Structuring model ${STRUCTURING_MODEL} not loaded`);
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
