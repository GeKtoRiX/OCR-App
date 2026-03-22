import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '..');
const IMAGE_PATH = path.join(ROOT_DIR, 'image_test.jpg');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mark(step: string) {
  console.log(`[browser-e2e] ${step}`);
}

function createReferenceWavBuffer(): Buffer {
  const sampleRate = 24_000;
  const seconds = 1;
  const sampleCount = sampleRate * seconds;
  const pcm = Buffer.alloc(sampleCount * 2);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(
      10_000 * Math.sin((2 * Math.PI * 440 * index) / sampleRate),
    );
    pcm.writeInt16LE(sample, index * 2);
  }

  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}

async function uploadAndRecognize(page: Page) {
  mark('upload:start');
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(IMAGE_PATH);
  await page.getByRole('button', { name: 'Recognize' }).click();
  await expect(page.getByTestId('result-copy-button')).toBeVisible({
    timeout: 240_000,
  });
  await expect(page.getByTestId('result-save-button')).toBeVisible();
  mark('upload:recognized');
}

async function openTtsPanel(page: Page) {
  mark('tts:panel:open');
  const toggle = page.getByTestId('result-tts-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByTestId('tts-generate-button')).toBeVisible();
  mark('tts:panel:opened');
}

async function selectHistoryEntry(page: Page, filename: string) {
  await page.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(filename)}\\b`),
  }).click();
}

async function selectSavedDocument(page: Page, filename: string) {
  await page
    .locator('.history-item--saved')
    .filter({ hasText: filename })
    .first()
    .click();
}

async function expectSessionResultMode(page: Page) {
  await expect(page.getByTestId('result-save-button')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId('result-tab-raw')).toBeVisible({
    timeout: 10_000,
  });
}

async function expectSavedResultMode(page: Page) {
  await expect(page.getByTestId('result-save-button')).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.getByTestId('result-tab-raw')).toHaveCount(0, {
    timeout: 10_000,
  });
}

async function openSavedDocument(page: Page, filename: string) {
  mark(`saved:open:${filename}`);
  await page.getByTestId('history-tab-saved').click();
  await selectSavedDocument(page, filename);
  await expectSavedResultMode(page);
  mark(`saved:opened:${filename}`);
}

async function openSessionDocument(page: Page, filename: string) {
  mark(`session:open:${filename}`);
  await page.getByTestId('history-tab-session').click();
  await selectHistoryEntry(page, filename);
  await expectSessionResultMode(page);
  mark(`session:opened:${filename}`);
}

async function addVocabularyFromCurrentResult(page: Page) {
  const content = page.getByTestId('result-content');

  const selectedWord = await content.evaluate((element) => {
    const container = element as HTMLPreElement;
    const fullText = container.textContent ?? '';
    const match = fullText.match(/\b[A-Za-z]{5,}\b/);
    if (!match || match.index === undefined) {
      throw new Error('No suitable word found for vocabulary selection');
    }

    const start = match.index;
    const end = start + match[0].length;
    const textNode = container.firstChild;
    if (!textNode) {
      throw new Error('Rendered result has no text node');
    }

    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Browser selection API is unavailable');
    }

    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    selection.removeAllRanges();
    selection.addRange(range);

    const rect = container.getBoundingClientRect();
    container.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.left + 24,
        clientY: rect.top + 24,
      }),
    );
    container.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 24,
        clientY: rect.top + 24,
      }),
    );

    return match[0];
  });

  await expect(page.getByTestId('vocab-context-menu')).toBeVisible();
  await page
    .getByTestId('vocab-context-menu')
    .getByRole('button', { name: 'Word' })
    .click();
  await expect(page.getByTestId('vocab-add-form')).toBeVisible();
  await page
    .getByTestId('vocab-add-form')
    .getByPlaceholder('Translation...')
    .fill(`translation-${selectedWord.toLowerCase()}`);
  await page
    .getByTestId('vocab-add-form')
    .getByRole('button', { name: 'Add' })
    .click();
  await expect(page.getByTestId('result-edit-toggle')).toHaveText('Edit');

  return selectedWord;
}

async function answerCurrentExercise(page: Page) {
  const options = page.locator('.practice-card__option');
  if ((await options.count()) > 0) {
    await options.first().click();
    return;
  }

  await page.getByPlaceholder('Type your answer...').fill('browser-answer');
  await page.getByRole('button', { name: 'Submit' }).click();
}

async function completePracticeFlow(page: Page) {
  for (;;) {
    await answerCurrentExercise(page);

    const finishButton = page.getByRole('button', { name: 'Finish & Analyze' });
    const nextButton = page.getByRole('button', { name: 'Next' });

    await Promise.race([
      finishButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null),
      nextButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null),
    ]);

    if (await finishButton.isVisible().catch(() => false)) {
      await finishButton.click();
      return;
    }

    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click();
      continue;
    }

    throw new Error('Practice flow did not expose Next or Finish & Analyze');
  }
}

async function generateTts(
  page: Page,
  engine: 'supertone' | 'piper' | 'kokoro' | 'f5',
) {
  const timeout = engine === 'f5' ? 300_000 : 180_000;
  mark(`tts:${engine}:start`);
  await page.getByTestId(`tts-engine-${engine}`).click();

  if (engine === 'f5') {
    await page.locator('#f5-ref-audio').setInputFiles({
      name: 'reference.wav',
      mimeType: 'audio/wav',
      buffer: createReferenceWavBuffer(),
    });
    await page.locator('#f5-ref-text').fill('This is a short reference clip.');
  }

  const player = page.getByTestId('tts-audio-player');
  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes('/api/tts') &&
      response.request().method() === 'POST',
    { timeout },
  );

  mark(`tts:${engine}:click-generate`);
  await page.getByTestId('tts-generate-button').click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  mark(`tts:${engine}:response-ok`);
  mark(`tts:${engine}:wait-button-enabled`);
  await expect(page.getByTestId('tts-generate-button')).toBeEnabled({
    timeout,
  });
  mark(`tts:${engine}:button-enabled`);
  await expect(player).toBeVisible({
    timeout,
  });
  mark(`tts:${engine}:player-visible`);
  await expect(player).toHaveAttribute('src', /.+/, { timeout });
  mark(`tts:${engine}:src-present`);
  mark(`tts:${engine}:done`);
}

test.describe.configure({ mode: 'serial' });

test('rejects unsupported upload types in the browser', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'invalid.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });

  await expect(
    page.getByText('Unsupported format: text/plain. Allowed: PNG, JPEG, WebP, BMP, TIFF'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Recognize' }),
  ).toBeDisabled();
});

test('handles OCR copy and saved document CRUD in the browser', async ({
  page,
}) => {
  mark('crud:test:start');
  await uploadAndRecognize(page);

  const healthLabel = await page.getByTestId('health-light').getAttribute('aria-label');
  expect(healthLabel).toContain('PaddleOCR');

  mark('crud:copy-raw');
  await page.getByTestId('result-tab-raw').click();
  await page.getByTestId('result-copy-button').click();
  await expect(page.getByTestId('result-copy-button')).toHaveText('Copied!');
  const rawClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(rawClipboard.length).toBeGreaterThan(20);

  mark('crud:save');
  await page.getByTestId('result-tab-markdown').click();
  await page.getByTestId('result-save-button').click();
  await expect(page.getByTestId('result-save-button')).toContainText('Saved', {
    timeout: 30_000,
  });
  mark('crud:saved');

  await openSavedDocument(page, 'image_test.jpg');
  await page.getByTestId('result-edit-toggle').click();
  mark('crud:editing-saved');

  const editor = page.getByTestId('result-editor');
  const updatedMarker = '\n\nSaved document updated by Playwright.';
  await editor.fill(`${await editor.inputValue()}${updatedMarker}`);
  await expect(page.getByTestId('result-update-button')).toBeVisible();
  mark('crud:update-click');
  await page.getByTestId('result-update-button').click();
  mark('crud:updated');
  await openSessionDocument(page, 'image_test.jpg');
  await openSavedDocument(page, 'image_test.jpg');
  await page.getByTestId('result-edit-toggle').click();
  mark('crud:verify-updated');
  await expect(page.getByTestId('result-editor')).toHaveValue(
    new RegExp(updatedMarker.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  await page.getByTestId('result-edit-toggle').click();
  mark('crud:delete');
  await page
    .locator('.history-item--saved')
    .first()
    .getByRole('button', { name: 'Delete image_test.jpg' })
    .click();
  await expect(page.getByText('No saved documents yet.')).toBeVisible();
  mark('crud:test:done');
});

test('adds vocabulary via context menu and completes practice flow', async ({
  page,
}) => {
  await uploadAndRecognize(page);
  const selectedWord = await addVocabularyFromCurrentResult(page);
  const vocabularyPanel = page.getByTestId('vocabulary-panel');

  await page.getByTestId('history-tab-vocab').click();
  await expect(
    vocabularyPanel.getByText(selectedWord, { exact: true }),
  ).toBeVisible();
  await page.getByTestId('vocab-native-lang').fill('fr');
  await expect(page.getByText('No vocabulary words yet.')).toBeVisible();
  await page.getByTestId('vocab-native-lang').fill('ru');
  await expect(
    vocabularyPanel.getByText(selectedWord, { exact: true }),
  ).toBeVisible();

  await page.getByTestId('vocab-practice-button').click();
  await expect(page.getByTestId('practice-view')).toBeVisible({
    timeout: 120_000,
  });
  await completePracticeFlow(page);
  await expect(page.getByText('Session Complete')).toBeVisible({
    timeout: 180_000,
  });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('practice-view')).toBeHidden();
});

test('generates TTS audio for all engines from the OCR result', async ({ page }) => {
  await uploadAndRecognize(page);
  await expectSessionResultMode(page);

  await page.getByTestId('result-edit-toggle').click();
  const editor = page.getByTestId('result-editor');
  await editor.fill('Hello from the browser TTS test. This sample is intentionally short.');
  await page.getByTestId('result-edit-toggle').click();

  await openTtsPanel(page);

  await generateTts(page, 'supertone');
  await generateTts(page, 'piper');
  await generateTts(page, 'kokoro');
  await generateTts(page, 'f5');
});
