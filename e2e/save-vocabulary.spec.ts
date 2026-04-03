import { test, expect, type Page } from '@playwright/test';
import type { SavedDocument } from '../frontend/src/shared/types';

const FILE_NAME = 'playwright-save-vocabulary.md';
const DOCUMENT_MARKDOWN = `# Study Notes

She gave up too early, but the lesson was a piece of cake.
The diligent student quickly mastered every detail.`;

async function deleteSavedDocumentsByFilename(page: Page, filename: string) {
  const response = await page.request.get('/api/documents');
  expect(response.ok()).toBeTruthy();
  const documents = (await response.json()) as SavedDocument[];

  for (const doc of documents.filter((entry) => entry.filename === filename)) {
    const deleteResponse = await page.request.delete(`/api/documents/${doc.id}`);
    expect(deleteResponse.ok()).toBeTruthy();
  }
}

test.beforeEach(async ({ page }) => {
  await deleteSavedDocumentsByFilename(page, FILE_NAME);
});

test('edits reviewed vocabulary in the browser before saving it to the real vocabulary list', async ({
  page,
}) => {
  const createResponse = await page.request.post('/api/documents', {
    data: {
      markdown: DOCUMENT_MARKDOWN,
      filename: FILE_NAME,
    },
  });

  expect(createResponse.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByTestId('history-tab-saved').click();

  const savedEntry = page
    .locator('.history-item--saved')
    .filter({ hasText: FILE_NAME })
    .first();
  await expect(savedEntry).toBeVisible({ timeout: 30_000 });
  await savedEntry.click();

  const saveVocabularyButton = page.getByTestId('result-save-vocabulary-button');
  await expect(saveVocabularyButton).toBeVisible();
  await saveVocabularyButton.click();

  const overlay = page.getByTestId('save-vocabulary-overlay');
  await expect(overlay).toBeVisible({ timeout: 60_000 });
  await expect(overlay.getByTestId('save-vocab-list-item').first()).toBeVisible({
    timeout: 60_000,
  });

  const editedWord = `playwright-vocab-${Date.now()}`;
  const editedTranslation = `отредактировано в e2e ${Date.now()}`;
  const editedContext = 'Playwright changed this context before saving.';

  await overlay.getByTestId('save-vocab-editor-word').fill(editedWord);
  await overlay.getByTestId('save-vocab-editor-type').selectOption('expression');
  await overlay.getByTestId('save-vocab-editor-translation').fill(editedTranslation);
  await overlay.getByTestId('save-vocab-editor-context').fill(editedContext);

  await overlay.getByRole('button', { name: 'Confirm Save' }).click();
  await expect(overlay.getByText('Saved:')).toBeVisible({ timeout: 60_000 });
  await overlay.getByRole('button', { name: 'Done' }).click();
  await expect(overlay).toBeHidden({ timeout: 30_000 });

  await page.getByTestId('history-tab-vocab').click();
  const vocabularyPanel = page.getByTestId('vocabulary-panel');
  const savedWordRow = vocabularyPanel
    .locator('.vocab-panel__item')
    .filter({ hasText: editedWord })
    .first();

  await expect(savedWordRow).toBeVisible({ timeout: 30_000 });
  await expect(savedWordRow.getByText(editedWord, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(savedWordRow.getByText(editedTranslation, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(savedWordRow.getByText('Expression', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
