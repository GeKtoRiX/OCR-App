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
        'bash scripts/linux/run-js-command.sh npm run dev:paddleocr',
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: false,
      timeout: 5 * 60 * 1000,
    },
    {
      command:
        'SUPERTONE_USE_GPU=false LD_LIBRARY_PATH=/home/cbandy/.local/lib/python3.12/site-packages/torch/lib:$LD_LIBRARY_PATH services/tts/supertone-service/.venv/bin/python -m uvicorn --app-dir services/tts/supertone-service main:app --host 0.0.0.0 --port 8100',
      url: 'http://127.0.0.1:8100/health',
      reuseExistingServer: false,
      timeout: 5 * 60 * 1000,
    },
    {
      command:
        'bash scripts/linux/run-js-command.sh npm run dev:kokoro',
      url: 'http://127.0.0.1:8200/health',
      reuseExistingServer: false,
      timeout: 5 * 60 * 1000,
    },
    {
      command:
        'bash scripts/linux/run-js-command.sh npm run dev:f5',
      url: 'http://127.0.0.1:8300/health',
      reuseExistingServer: false,
      timeout: 5 * 60 * 1000,
    },
    {
      command:
        "bash -lc 'export PORT=3000 SQLITE_DB_PATH=tmp/test-db/browser-e2e.sqlite LM_STUDIO_SMOKE_ONLY=true; bash scripts/linux/run-js-command.sh node backend/dist/main.js'",
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
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
