import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import type { SavedDocument } from '../frontend/src/shared/types';

const ROOT_DIR = path.resolve(__dirname, '..');
const IMAGE_PATH = path.join(ROOT_DIR, 'image_test.jpg');
const SAVED_IMAGE_FILENAME = 'image_test.html';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mark(step: string) {
  console.log(`[browser-e2e] ${step}`);
}

function getRichTextEditor(page: Page) {
  return page
    .getByTestId('result-editor')
    .locator('.ck-editor__editable[contenteditable="true"]')
    .first();
}

function getSourceEditingTextarea(page: Page) {
  return page.locator('.ck-source-editing-area textarea').first();
}

async function toggleSourceEditing(page: Page) {
  await page.getByRole('button', { name: /source/i }).click();
}

async function setEditorHtmlThroughSourceMode(page: Page, html: string) {
  await toggleSourceEditing(page);
  const sourceTextarea = getSourceEditingTextarea(page);
  await expect(sourceTextarea).toBeVisible({ timeout: 30_000 });
  await sourceTextarea.fill(html);
  await toggleSourceEditing(page);
  await expect(sourceTextarea).toBeHidden({ timeout: 30_000 });
}

async function uploadEditorImage(page: Page) {
  const response = await page.request.post('/api/editor/uploads/images', {
    multipart: {
      upload: {
        name: 'playwright-inline.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake-png-image'),
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { url: string };
  expect(body.url).toMatch(/^\/editor-assets\/.+\.png$/);
  return body.url;
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

async function saveCurrentResultAsDocument(page: Page, filename = SAVED_IMAGE_FILENAME) {
  mark('document:save:start');
  await page.getByTestId('result-tab-markdown').click();
  await page.getByTestId('result-save-button').click();
  await page.getByTestId('history-tab-saved').click();
  await expect(
    page
      .locator('.history-item--saved')
      .filter({ hasText: filename })
      .first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  mark('document:save:done');
}

async function deleteSavedDocumentsByFilename(page: Page, filename: string) {
  const response = await page.request.get('/api/documents');
  expect(response.ok()).toBeTruthy();
  const documents = (await response.json()) as SavedDocument[];

  for (const doc of documents.filter((entry) => entry.filename === filename)) {
    const deleteResponse = await page.request.delete(`/api/documents/${doc.id}`);
    expect(deleteResponse.ok()).toBeTruthy();
  }
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

  mark('vocab-context:select');
  const selectedWord = await content.evaluate((element) => {
    const container = element as HTMLElement;
    const fullText = container.textContent ?? '';
    const match = fullText.match(/\b[A-Za-z]{5,}\b/);
    if (!match || match.index === undefined) {
      throw new Error('No suitable word found for vocabulary selection');
    }

    const start = match.index;
    const end = start + match[0].length;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    let localStart = 0;
    let localEnd = 0;
    let offset = 0;

    while (walker.nextNode()) {
      const candidate = walker.currentNode as Text;
      const length = candidate.textContent?.length ?? 0;
      if (start >= offset && end <= offset + length) {
        textNode = candidate;
        localStart = start - offset;
        localEnd = end - offset;
        break;
      }
      offset += length;
    }

    if (!textNode) {
      throw new Error('Rendered result has no suitable text node');
    }

    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Browser selection API is unavailable');
    }

    const range = document.createRange();
    range.setStart(textNode, localStart);
    range.setEnd(textNode, localEnd);
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

  mark('vocab-context:menu-wait');
  await expect(page.getByTestId('vocab-context-menu')).toBeVisible();
  mark('vocab-context:menu-open');
  await page
    .getByTestId('vocab-context-menu')
    .getByRole('button', { name: 'Add to Vocabulary' })
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
  mark('vocab-context:added');

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
    const readyButton = page.getByRole('button', { name: 'Ready' });
    if (await readyButton.isVisible().catch(() => false)) {
      await readyButton.click();
      continue;
    }

    await answerCurrentExercise(page);

    const finishButton = page.getByRole('button', { name: 'Finish & Analyze' });
    const continueButton = page.getByRole('button', { name: 'Continue' });
    const nextButton = page.getByRole('button', { name: 'Next' });

    await Promise.race([
      finishButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null),
      continueButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null),
      nextButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null),
      readyButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null),
    ]);

    if (await finishButton.isVisible().catch(() => false)) {
      await finishButton.click();
      return;
    }

    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
      continue;
    }

    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click();
      continue;
    }

    if (await readyButton.isVisible().catch(() => false)) {
      await readyButton.click();
      continue;
    }

    throw new Error('Practice flow did not expose Ready, Continue, Next, or Finish & Analyze');
  }
}


async function saveVocabularyFromOverlay(page: Page) {
  const overlay = page.getByTestId('save-vocabulary-overlay');
  const editedWord = `playwright-vocab-${Date.now()}`;
  const editedTranslation = `проверено через playwright ${Date.now()}`;
  const editedContext = 'Playwright updated this context before saving.';

  mark('vocab-overlay:open');
  await page.getByTestId('result-save-vocabulary-button').click();
  await expect(overlay).toBeVisible({ timeout: 120_000 });

  const listItems = overlay.getByTestId('save-vocab-list-item');
  await expect(listItems.first()).toBeVisible({ timeout: 120_000 });
  await expect(overlay.getByTestId('save-vocab-editor')).toBeVisible();

  mark('vocab-overlay:edit');
  await overlay.getByTestId('save-vocab-editor-word').fill(editedWord);
  await overlay.getByTestId('save-vocab-editor-type').selectOption('expression');
  await overlay.getByTestId('save-vocab-editor-translation').fill(editedTranslation);
  await overlay.getByTestId('save-vocab-editor-context').fill(editedContext);

  mark('vocab-overlay:confirm');
  await overlay.getByRole('button', { name: 'Confirm Save' }).click();
  await expect(overlay.getByText('Saved:')).toBeVisible({ timeout: 120_000 });
  await overlay.getByRole('button', { name: 'Done' }).click();
  await expect(overlay).toBeHidden({ timeout: 30_000 });
  mark('vocab-overlay:saved');

  return {
    editedWord,
    editedTranslation,
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await deleteSavedDocumentsByFilename(page, SAVED_IMAGE_FILENAME);
});

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
  expect(healthLabel).toContain('OCR');

  mark('crud:copy-raw');
  await page.getByTestId('result-tab-raw').click();
  await page.getByTestId('result-copy-button').click();
  await expect(page.getByTestId('result-copy-button')).toHaveText('Copied!');
  const rawClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(rawClipboard.length).toBeGreaterThan(20);

  mark('crud:save');
  await page.getByTestId('result-tab-markdown').click();
  await page.getByTestId('result-save-button').click();
  await page.getByTestId('history-tab-saved').click();
  await expect(
    page
      .locator('.history-item--saved')
      .filter({ hasText: SAVED_IMAGE_FILENAME })
      .first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  mark('crud:saved');

  await openSavedDocument(page, SAVED_IMAGE_FILENAME);
  await page.getByTestId('result-edit-toggle').click();
  mark('crud:editing-saved');

  const editor = getRichTextEditor(page);
  const updatedMarker = 'Saved document updated by Playwright.';
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(updatedMarker);
  await expect(editor).toContainText(updatedMarker);
  await expect(page.getByTestId('result-update-button')).toBeVisible();
  mark('crud:update-click');
  await page.getByTestId('result-update-button').click();
  mark('crud:updated');
  await openSessionDocument(page, 'image_test.jpg');
  await openSavedDocument(page, SAVED_IMAGE_FILENAME);
  mark('crud:verify-updated');
  await expect(page.getByTestId('result-content')).toContainText(updatedMarker);
  mark('crud:delete');
  await page
    .locator('.history-item--saved')
    .first()
    .getByRole('button', { name: `Delete ${SAVED_IMAGE_FILENAME}` })
    .click();
  await expect(
    page
      .locator('.history-item--saved')
      .filter({ hasText: SAVED_IMAGE_FILENAME }),
  ).toHaveCount(0);
  mark('crud:test:done');
});

test('persists rich HTML formatting for saved documents after reopen', async ({
  page,
}) => {
  await uploadAndRecognize(page);
  await saveCurrentResultAsDocument(page);
  await openSavedDocument(page, SAVED_IMAGE_FILENAME);
  await page.getByTestId('result-edit-toggle').click();

  const uploadedImageUrl = await uploadEditorImage(page);
  const richHtml = [
    '<h2>Rich formatting survives</h2>',
    '<p><span style="color:#c62828;font-size:28px;font-family:\'Courier New\', Courier, monospace;">Styled content survives.</span></p>',
    '<figure class="table"><table><thead><tr><th>Column</th></tr></thead><tbody><tr><td>Table cell persists.</td></tr></tbody></table></figure>',
    `<figure class="image"><img src="${uploadedImageUrl}" alt="Uploaded from Playwright"></figure>`,
  ].join('');

  await setEditorHtmlThroughSourceMode(page, richHtml);
  await expect(getRichTextEditor(page)).toContainText('Styled content survives.');

  await page.getByTestId('result-update-button').click();
  await openSessionDocument(page, 'image_test.jpg');
  await openSavedDocument(page, SAVED_IMAGE_FILENAME);

  const content = page.getByTestId('result-content');
  await expect(content.locator('h2')).toContainText('Rich formatting survives');
  await expect(content.locator('table')).toBeVisible();
  await expect(content.locator('td')).toContainText('Table cell persists.');
  await expect(content.locator('img')).toHaveAttribute('src', uploadedImageUrl);
  await expect(content.locator('span')).toContainText('Styled content survives.');
  await expect(content.locator('span')).toHaveCSS('font-size', '28px');
  await expect(content.locator('span')).toHaveCSS('color', 'rgb(198, 40, 40)');
});

test('adds vocabulary via context menu and starts a practice round', async ({
  page,
}) => {
  const isolatedNativeLang = `p${Date.now().toString().slice(-4)}`;

  await uploadAndRecognize(page);
  await page.getByTestId('history-tab-vocab').click();
  await page.getByTestId('vocab-native-lang').fill(isolatedNativeLang);

  const selectedWord = await addVocabularyFromCurrentResult(page);
  const vocabularyPanel = page.getByTestId('vocabulary-panel');

  mark('practice:vocab-tab');
  await page.getByTestId('history-tab-vocab').click();
  await expect(
    vocabularyPanel.getByText(selectedWord, { exact: true }),
  ).toBeVisible();
  await page.getByTestId('vocab-native-lang').fill('fr');
  await expect(page.getByText('No vocabulary words yet.')).toBeVisible();
  await page.getByTestId('vocab-native-lang').fill(isolatedNativeLang);
  await expect(
    vocabularyPanel.getByText(selectedWord, { exact: true }),
  ).toBeVisible();

  mark('practice:start');
  await page.getByTestId('vocab-practice-button').click();
  await expect(page.getByTestId('practice-view')).toBeVisible({
    timeout: 120_000,
  });
  mark('practice:flow');
  await page.getByRole('button', { name: 'Ready' }).click();
  await expect(page.locator('.practice-card__type')).toBeVisible({
    timeout: 120_000,
  });
  mark('practice:started');
});

test('saves edited vocabulary from the review overlay into the real vocabulary list', async ({
  page,
}) => {
  await uploadAndRecognize(page);
  await saveCurrentResultAsDocument(page);
  await openSavedDocument(page, SAVED_IMAGE_FILENAME);

  const { editedWord, editedTranslation } = await saveVocabularyFromOverlay(page);
  const vocabularyPanel = page.getByTestId('vocabulary-panel');
  const savedWordRow = vocabularyPanel
    .locator('.vocab-panel__item')
    .filter({ hasText: editedWord })
    .first();

  await page.getByTestId('history-tab-vocab').click();
  await expect(savedWordRow).toBeVisible({ timeout: 60_000 });
  await expect(savedWordRow.getByText(editedWord, { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(savedWordRow.getByText(editedTranslation, { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(savedWordRow.getByText('Expression', { exact: true })).toBeVisible();
});

// TTS engine tests live in playwright.tts.config.ts — not part of the OCR browser e2e suite.
