import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 10 * 60 * 1000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: [
    {
      command:
        "bash -lc 'export LM_STUDIO_SMOKE_ONLY=true; bash scripts/linux/run-js-command.sh node backend/dist/services/ocr/src/main.js'",
      port: 3901,
      reuseExistingServer: true,
      timeout: 2 * 60 * 1000,
    },
    {
      command:
        "bash -lc 'bash scripts/linux/run-js-command.sh node backend/dist/services/tts/src/main.js'",
      port: 3902,
      reuseExistingServer: true,
      timeout: 2 * 60 * 1000,
    },
    {
      command:
        "bash -lc 'export LM_STUDIO_SMOKE_ONLY=true DOCUMENTS_SQLITE_DB_PATH=tmp/test-db/documents.sqlite; bash scripts/linux/run-js-command.sh node backend/dist/services/document/src/main.js'",
      port: 3903,
      reuseExistingServer: true,
      timeout: 2 * 60 * 1000,
    },
    {
      command:
        "bash -lc 'export LM_STUDIO_SMOKE_ONLY=true VOCABULARY_SQLITE_DB_PATH=tmp/test-db/vocabulary.sqlite; bash scripts/linux/run-js-command.sh node backend/dist/services/vocabulary/src/main.js'",
      port: 3904,
      reuseExistingServer: true,
      timeout: 2 * 60 * 1000,
    },
    {
      command:
        "bash -lc 'export PORT=3000; bash scripts/linux/run-js-command.sh node backend/dist/gateway/main.js'",
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 2 * 60 * 1000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
