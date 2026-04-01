import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { measureScenario, nowMs, writeJsonReport } from './shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const imagePath = path.join(rootDir, 'image_test.jpg');
const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const outputPath = path.join(rootDir, 'tmp/perf/browser-benchmark.json');
const coldIterations = Number(process.env.PERF_COLD_ITERATIONS ?? 1);
const warmIterations = Number(process.env.PERF_WARM_ITERATIONS ?? 2);

async function uploadAndRecognize(page) {
  const startedAt = nowMs();
  await page.locator('input[type="file"]').waitFor({ state: 'attached' });
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await page.getByRole('button', { name: 'Recognize' }).click();
  await page.getByTestId('result-copy-button').waitFor({
    state: 'visible',
    timeout: 240_000,
  });
  return nowMs() - startedAt;
}

async function prepareTtsText(page) {
  await page.getByTestId('result-edit-toggle').click();
  await page
    .getByTestId('result-editor')
    .fill('Hello from the browser performance benchmark. This sample is intentionally short.');
  await page.getByTestId('result-edit-toggle').click();
  await page.getByTestId('result-tts-toggle').click();
}

async function measureTts(page, engine) {
  const timeout = 180_000;
  await page.getByTestId(`tts-engine-${engine}`).click();

  const startedAt = nowMs();
  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes('/api/tts') &&
      response.request().method() === 'POST',
    { timeout },
  );

  await page.getByTestId('tts-generate-button').click();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`browser tts ${engine} failed with ${response.status()}`);
  }

  await page.getByTestId('tts-generate-button').waitFor({
    state: 'visible',
    timeout,
  });
  await page.getByTestId('tts-audio-player').waitFor({
    state: 'visible',
    timeout,
  });
  return nowMs() - startedAt;
}

function collectMetric(measurements, key) {
  return measurements
    .map((measurement) => measurement?.[key])
    .filter((value) => typeof value === 'number');
}

function summarizeExtra(measurements, iterations, summarizeDurations) {
  return {
    pageLoad: summarizeDurations(collectMetric(measurements, 'pageLoadMs'), iterations),
    uploadToResult: summarizeDurations(collectMetric(measurements, 'uploadToResultMs'), iterations),
    tts: {
      supertone: summarizeDurations(collectMetric(measurements, 'supertoneMs'), iterations),
      piper: summarizeDurations(collectMetric(measurements, 'piperMs'), iterations),
      kokoro: summarizeDurations(collectMetric(measurements, 'kokoroMs'), iterations),
    },
    totalWorkflow: summarizeDurations(collectMetric(measurements, 'totalMs'), iterations),
  };
}

function summarizeDurations(durations, totalRuns) {
  if (durations.length === 0) {
    return {
      samples: [],
      count: 0,
      min: null,
      max: null,
      p50: null,
      p95: null,
      avg: null,
      failureRate: totalRuns === 0 ? 0 : 1,
    };
  }

  const sorted = [...durations].sort((left, right) => left - right);
  const percentile = (value) => {
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((value / 100) * sorted.length) - 1),
    );
    return Number(sorted[index].toFixed(2));
  };
  const sum = durations.reduce((accumulator, value) => accumulator + value, 0);
  return {
    samples: durations.map((value) => Number(value.toFixed(2))),
    count: durations.length,
    min: Number(Math.min(...durations).toFixed(2)),
    max: Number(Math.max(...durations).toFixed(2)),
    p50: percentile(50),
    p95: percentile(95),
    avg: Number((sum / durations.length).toFixed(2)),
    failureRate: Number(((totalRuns - durations.length) / totalRuns).toFixed(4)),
  };
}

async function runWorkflow(iterations) {
  const measurements = [];
  const result = await measureScenario({
    iterations,
    run: async (iteration) => {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        baseURL: baseUrl,
        permissions: ['clipboard-read', 'clipboard-write'],
      });

      try {
        const pageLoadStartedAt = nowMs();
        await page.goto(baseUrl);
        await page.locator('input[type="file"]').waitFor({ state: 'attached' });
        const pageLoadMs = nowMs() - pageLoadStartedAt;

        const uploadToResultMs = await uploadAndRecognize(page);
        await prepareTtsText(page);
        const supertoneMs = await measureTts(page, 'supertone');
        const piperMs = await measureTts(page, 'piper');
        const kokoroMs = await measureTts(page, 'kokoro');

        measurements[iteration] = {
          pageLoadMs,
          uploadToResultMs,
          supertoneMs,
          piperMs,
          kokoroMs,
          totalMs:
            pageLoadMs +
            uploadToResultMs +
            supertoneMs +
            piperMs +
            kokoroMs,
        };
      } finally {
        await browser.close();
      }
    },
  });

  return {
    summary: summarizeExtra(measurements, iterations, summarizeDurations),
    failures: result.failures,
  };
}

async function main() {
  const cold = await runWorkflow(coldIterations);
  const warm = await runWorkflow(warmIterations);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    coldIterations,
    warmIterations,
    browser: {
      cold,
      warm,
    },
  };

  await writeJsonReport(outputPath, report);
  console.log(`Browser benchmark report written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
