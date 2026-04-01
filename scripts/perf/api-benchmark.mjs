import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureScenario, writeJsonReport } from './shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const imagePath = path.join(rootDir, 'image_test.jpg');
const outputPath = path.join(rootDir, 'tmp/perf/api-benchmark.json');
const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const coldIterations = Number(process.env.PERF_COLD_ITERATIONS ?? 1);
const warmIterations = Number(process.env.PERF_WARM_ITERATIONS ?? 3);

async function assertOk(response, label) {
  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status}: ${await response.text()}`);
  }
}

async function benchmark(name, run) {
  const cold = await measureScenario({ iterations: coldIterations, run });
  const warm = await measureScenario({ iterations: warmIterations, run });
  return { cold, warm };
}

async function benchmarkHealth() {
  return benchmark('health', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    await assertOk(response, 'health');
    await response.json();
  });
}

async function benchmarkOcr() {
  const imageBuffer = await readFile(imagePath);

  return benchmark('ocr', async () => {
    const form = new FormData();
    form.set('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image_test.jpg');
    const response = await fetch(`${baseUrl}/api/ocr`, { method: 'POST', body: form });
    await assertOk(response, 'ocr');
    await response.json();
  });
}

async function benchmarkTts(engine) {
  return benchmark(`tts:${engine}`, async () => {
    const request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Performance benchmark for ${engine}.`,
        engine,
        voice: engine === 'kokoro' ? 'af_heart' : engine === 'piper' ? 'en_US-ryan-high' : 'M1',
        lang: 'en',
        speed: 1.0,
        totalSteps: 5,
      }),
    };

    const response = await fetch(`${baseUrl}/api/tts`, request);
    await assertOk(response, `tts:${engine}`);
    await response.arrayBuffer();
  });
}

async function benchmarkDocuments() {
  return benchmark('documents:crud', async (iteration) => {
    const createResponse = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: `perf-doc-${Date.now()}-${iteration}.md`,
        markdown: `# Perf ${iteration}\n\ncontent`,
      }),
    });
    await assertOk(createResponse, 'documents:create');
    const created = await createResponse.json();

    const fetchResponse = await fetch(`${baseUrl}/api/documents/${created.id}`);
    await assertOk(fetchResponse, 'documents:get');
    await fetchResponse.json();

    const updateResponse = await fetch(`${baseUrl}/api/documents/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: `# Perf ${iteration}\n\nupdated` }),
    });
    await assertOk(updateResponse, 'documents:update');
    await updateResponse.json();

    const deleteResponse = await fetch(`${baseUrl}/api/documents/${created.id}`, {
      method: 'DELETE',
    });
    await assertOk(deleteResponse, 'documents:delete');
    await deleteResponse.text();
  });
}

async function benchmarkVocabularyAndPractice() {
  return benchmark('vocabulary+practice', async (iteration) => {
    const word = `perf-word-${Date.now()}-${iteration}`;

    const addResponse = await fetch(`${baseUrl}/api/vocabulary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word,
        vocabType: 'word',
        translation: `translation-${iteration}`,
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'Performance benchmark sentence.',
      }),
    });
    await assertOk(addResponse, 'vocabulary:add');
    const createdWord = await addResponse.json();

    const listResponse = await fetch(`${baseUrl}/api/vocabulary?targetLang=en&nativeLang=ru`);
    await assertOk(listResponse, 'vocabulary:list');
    await listResponse.json();

    const dueResponse = await fetch(`${baseUrl}/api/vocabulary/review/due?limit=10`);
    await assertOk(dueResponse, 'vocabulary:due');
    await dueResponse.json();

    const startResponse = await fetch(`${baseUrl}/api/practice/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLang: 'en', nativeLang: 'ru', wordLimit: 1 }),
    });
    await assertOk(startResponse, 'practice:start');
    const started = await startResponse.json();
    const exercise = started.exercises[0];

    const answerResponse = await fetch(`${baseUrl}/api/practice/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: started.sessionId,
        vocabularyId: exercise.vocabularyId,
        exerciseType: exercise.exerciseType,
        prompt: exercise.prompt,
        correctAnswer: exercise.correctAnswer,
        userAnswer: exercise.correctAnswer,
      }),
    });
    await assertOk(answerResponse, 'practice:answer');
    await answerResponse.json();

    const completeResponse = await fetch(`${baseUrl}/api/practice/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: started.sessionId }),
    });
    await assertOk(completeResponse, 'practice:complete');
    await completeResponse.json();

    const sessionsResponse = await fetch(`${baseUrl}/api/practice/sessions`);
    await assertOk(sessionsResponse, 'practice:sessions');
    await sessionsResponse.json();

    const statsResponse = await fetch(`${baseUrl}/api/practice/stats/${createdWord.id}`);
    await assertOk(statsResponse, 'practice:stats');
    await statsResponse.json();
  });
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    coldIterations,
    warmIterations,
    api: {
      health: await benchmarkHealth(),
      ocr: await benchmarkOcr(),
      tts: {
        supertone: await benchmarkTts('supertone'),
        piper: await benchmarkTts('piper'),
        kokoro: await benchmarkTts('kokoro'),
      },
      documentsCrud: await benchmarkDocuments(),
      vocabularyAndPractice: await benchmarkVocabularyAndPractice(),
    },
  };

  await writeJsonReport(outputPath, report);
  console.log(`API benchmark report written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
