import { test, expect } from '@playwright/test';

const FILE_NAME = 'playwright-ai-editor.md';
const DOCUMENT_MARKDOWN = `# OCR Draft

Ths sentence has a typo and needs cleanup.`;

test('rewrites a saved markdown document through the live AI editor flow', async ({
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

  await page.getByTestId('result-edit-toggle').click();
  await page.getByTitle('Toggle AI Assistant').click();

  const prompt = [
    'Rewrite the entire text to exactly this markdown and nothing else:',
    '# Live AI Rewrite',
    '',
    'This content was rewritten by the AI editor flow.',
  ].join('\n');

  await page.getByPlaceholder('Type your prompt…').fill(prompt);
  await page.getByTitle('Send (Ctrl+Enter)').click();

  const response = page.locator('.ai-panel__response');
  await expect(response).toContainText('This content was rewritten by the AI editor flow.', {
    timeout: 120_000,
  });

  await page.getByText('Replace all').click();

  const editorContent = page.locator('.ck-content');
  await expect(editorContent).toContainText('This content was rewritten by the AI editor flow.', {
    timeout: 30_000,
  });
});
