import { test, expect } from '@playwright/test';

const FILE_NAME = 'playwright-save-vocabulary.md';
const DOCUMENT_MARKDOWN = `# Study Notes

She gave up too early, but the lesson was a piece of cake.
The diligent student quickly mastered every detail.`;

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
  const editedTranslation = 'отредактировано в e2e';
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

  await expect(
    vocabularyPanel.getByText(editedWord, { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    vocabularyPanel.getByText(editedTranslation, { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    vocabularyPanel.getByText('Expression', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
});
