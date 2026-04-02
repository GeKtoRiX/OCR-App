import { test, expect } from '@playwright/test';

// Unique lang pair so only the seeded words appear in this practice batch.
// Other tests use en/ru — this uses en/e2e-isolated to stay independent.
const TARGET_LANG = 'en';
const NATIVE_LANG = 'e2ei';
const WORD_A = `pw-word-a-${Date.now()}`;
const WORD_B = `pw-word-b-${Date.now()}`;

function mark(step: string) {
  console.log(`[practice-e2e] ${step}`);
}

test.beforeEach(async ({ request }) => {
  const words = await request.get(`/api/vocabulary?targetLang=${TARGET_LANG}&nativeLang=${NATIVE_LANG}`);
  if (words.ok()) {
    const list = (await words.json()) as Array<{ id: string }>;
    await Promise.all(list.map((w) => request.delete(`/api/vocabulary/${w.id}`)));
  }
});

test('practice button generates exercises without LLM timeout and delivers type-first ordering', async ({
  page,
}) => {
  // ── seed two vocabulary words with a unique lang pair ───────────────────
  mark('seed:start');
  for (const [word, translation] of [
    [WORD_A, 'isolated-a'],
    [WORD_B, 'isolated-b'],
  ]) {
    const res = await page.request.post('/api/vocabulary', {
      data: {
        word,
        vocabType: 'word',
        translation,
        targetLang: TARGET_LANG,
        nativeLang: NATIVE_LANG,
        contextSentence: `The word ${word} appears in a sentence.`,
      },
    });
    expect(res.ok(), `Failed to seed word "${word}": ${res.status()}`).toBe(true);
  }
  mark('seed:done');

  // ── navigate, open vocab tab, filter to isolated lang pair ──────────────
  await page.goto('/');
  await page.getByTestId('history-tab-vocab').click();

  const nativeLangInput = page.getByTestId('vocab-native-lang');
  await expect(nativeLangInput).toBeVisible({ timeout: 10_000 });
  await nativeLangInput.fill(NATIVE_LANG);

  const vocabularyPanel = page.getByTestId('vocabulary-panel');
  await expect(
    vocabularyPanel.getByText(WORD_A, { exact: true }),
  ).toBeVisible({ timeout: 10_000 });

  // ── capture /api/practice/round response and its timing ─────────────────
  let roundBody: {
    exercises: Array<{ vocabularyId: string; exerciseType: string; prompt: string }>;
  } | null = null;
  let roundElapsedMs = 0;
  let roundStart = 0;

  page.on('request', (req) => {
    if (req.url().includes('/api/practice/round') && req.method() === 'POST') {
      roundStart = Date.now();
      mark('llm:request-sent');
    }
  });

  const roundResponsePromise = new Promise<void>((resolve) => {
    page.on('response', async (res) => {
      if (res.url().includes('/api/practice/round') && res.request().method() === 'POST') {
        roundElapsedMs = Date.now() - roundStart;
        mark(`llm:response-received in ${roundElapsedMs}ms`);
        try {
          roundBody = await res.json();
        } catch {
          // body already consumed — ignore
        }
        resolve();
      }
    });
  });

  // ── start practice ───────────────────────────────────────────────────────
  mark('practice:click-button');
  await page.getByTestId('vocab-practice-button').click();
  await expect(page.getByTestId('practice-view')).toBeVisible({ timeout: 30_000 });
  mark('practice:view-visible');

  // ── click Ready to trigger the LLM round generation ─────────────────────
  const readyBtn = page.getByRole('button', { name: 'Ready' });
  await expect(readyBtn).toBeVisible({ timeout: 10_000 });
  await readyBtn.click();
  mark('practice:ready-clicked');

  // ── wait for LLM response (2 words × 4 exercises should be < 60 s) ──────
  await Promise.race([
    roundResponsePromise,
    page.waitForTimeout(60_000).then(() => {
      throw new Error('LLM exercise generation exceeded 60 s for 2 words — possible thinking-token runaway');
    }),
  ]);

  // ── log raw exercise data for inspection ────────────────────────────────
  const exercises = roundBody?.exercises ?? [];
  mark(`exercises: count=${exercises.length}`);
  mark(`exercises: types=${exercises.map((e) => e.exerciseType).join(', ')}`);
  mark(`exercises: order=${exercises.map((e) => `${e.vocabularyId.slice(-4)}:${e.exerciseType}`).join(' | ')}`);
  mark(`exercises: first-prompt="${exercises[0]?.prompt ?? 'N/A'}"`);
  mark(`llm: elapsed=${roundElapsedMs}ms`);

  // ── verify LLM did not run away ──────────────────────────────────────────
  expect(roundElapsedMs, 'LLM round should respond in < 60 000 ms for 2 words').toBeLessThan(60_000);

  // ── verify exercise structure ────────────────────────────────────────────
  expect(exercises.length, 'Expected 8 exercises for 2 words × 4 types').toBe(8);

  // type-first ordering: first 2 must be multiple_choice (one per word),
  // then 2 spelling, then 2 context_sentence, then 2 fill_blank
  const types = exercises.map((e) => e.exerciseType);
  expect(types.slice(0, 2).every((t) => t === 'multiple_choice'), 'exercises 0–1 must be multiple_choice').toBe(true);
  expect(types.slice(2, 4).every((t) => t === 'spelling'), 'exercises 2–3 must be spelling').toBe(true);
  expect(types.slice(4, 6).every((t) => t === 'context_sentence'), 'exercises 4–5 must be context_sentence').toBe(true);
  expect(types.slice(6, 8).every((t) => t === 'fill_blank'), 'exercises 6–7 must be fill_blank').toBe(true);

  // ── verify UI shows the first exercise ──────────────────────────────────
  const practiceView = page.getByTestId('practice-view');
  await expect(practiceView).toBeVisible({ timeout: 10_000 });

  const typeLabel = practiceView.locator('.practice-card__type');
  await expect(typeLabel).toBeVisible({ timeout: 10_000 });
  await expect(typeLabel).toHaveText('multiple choice');

  mark('practice:assertions-passed');
});
