import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

const ROOT_DIR = '/media/cbandy/HDD_Content/llmAgentTest';
const OCR_SCRIPT_PATH = `${ROOT_DIR}/scripts/linux/ocr.sh`;
const TTS_SCRIPT_PATH = `${ROOT_DIR}/scripts/linux/tts.sh`;
const ALL_SCRIPT_PATH = `${ROOT_DIR}/scripts/linux/ocr-tts.sh`;
const APP_PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const PADDLE_PORT = Number.parseInt(process.env.PADDLEOCR_PORT ?? '8000', 10);
const SUPERTONE_PORT = Number.parseInt(process.env.SUPERTONE_PORT ?? '8100', 10);
const KOKORO_PORT = Number.parseInt(process.env.KOKORO_PORT ?? '8200', 10);
const F5_PORT = Number.parseInt(process.env.F5_TTS_PORT ?? '8300', 10);
const LM_URL = process.env.LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1';
const LM_MODEL_ID = process.env.STRUCTURING_MODEL ?? 'qwen/qwen3.5-9b';
const LM_PORT = resolvePort(LM_URL);
const MAX_LOG_CHARS = 25_000;
const POLL_INTERVAL_MS = 2_000;
const TTS_READY_TIMEOUT_MS = 8 * 60 * 1000;
const OCR_READY_TIMEOUT_MS = 6 * 60 * 1000;
const STOP_TIMEOUT_MS = 2 * 60 * 1000;

function resolvePort(url) {
  const parsed = new URL(url);
  if (parsed.port) {
    return Number.parseInt(parsed.port, 10);
  }

  return parsed.protocol === 'https:' ? 443 : 80;
}

function trimLog(buffer, text) {
  const next = `${buffer}${text}`;
  if (next.length <= MAX_LOG_CHARS) {
    return next;
  }

  return next.slice(next.length - MAX_LOG_CHARS);
}

function mark(step) {
  console.log(`[launcher-e2e] ${step}`);
}

function collectOutput(child, label) {
  let combined = '';
  const append = (source, chunk) => {
    combined = trimLog(combined, `[${label}:${source}] ${chunk.toString()}`);
  };

  child.stdout?.on('data', (chunk) => append('stdout', chunk));
  child.stderr?.on('data', (chunk) => append('stderr', chunk));

  return () => combined;
}

function spawnScript(scriptPath, args) {
  const child = spawn('bash', [scriptPath, ...args], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    child,
    getLog: collectOutput(child, `${scriptPath}:${args.join(':')}`),
  };
}

function spawnLauncher(scriptPath, label) {
  const entry = spawnScript(scriptPath, []);
  mark(`spawn:${label}:pid=${entry.child.pid ?? 'unknown'}`);
  return entry;
}

async function waitForExit(child, timeoutMs, description, getLog) {
  const exitPromise = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  const timeoutPromise = delay(timeoutMs).then(() => {
    throw new Error(`${description} timed out after ${timeoutMs} ms.\n${getLog()}`);
  });

  return Promise.race([exitPromise, timeoutPromise]);
}

async function runScript(scriptPath, args, timeoutMs, expectedExitCodes = [0]) {
  const entry = spawnScript(scriptPath, args);
  const result = await waitForExit(
    entry.child,
    timeoutMs,
    `bash ${scriptPath} ${args.join(' ')}`,
    entry.getLog,
  );

  assert.ok(
    expectedExitCodes.includes(result.code ?? -1),
    `Command ${args.join(' ')} exited with code ${result.code} signal ${result.signal}.\n${entry.getLog()}`,
  );
}

async function execProcess(command, args, expectedExitCodes = [0]) {
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout = trimLog(stdout, chunk.toString());
  });
  child.stderr?.on('data', (chunk) => {
    stderr = trimLog(stderr, chunk.toString());
  });

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  assert.ok(
    expectedExitCodes.includes(result.code ?? -1),
    `${command} ${args.join(' ')} exited with code ${result.code} signal ${result.signal}\n${stdout}\n${stderr}`,
  );

  return { stdout, stderr, code: result.code, signal: result.signal };
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }

  return response.json();
}

async function isPortListening(port) {
  const { stdout } = await execProcess('bash', [
    '-lc',
    `lsof -tiTCP:${port} -sTCP:LISTEN -n -P 2>/dev/null | head -n 1 || true`,
  ]);

  return stdout.trim().length > 0;
}

function assertLauncherStillRunning(entry, context) {
  if (entry.child.exitCode !== null) {
    throw new Error(
      `${context}: launcher exited early with code ${entry.child.exitCode} signal ${entry.child.signalCode}\n${entry.getLog()}`,
    );
  }
}

async function waitForCondition(check, timeoutMs, description, launcher) {
  const startedAt = Date.now();
  let lastError = 'condition never became true';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (launcher) {
        assertLauncherStillRunning(launcher, description);
      }

      if (await check()) {
        return;
      }

      lastError = 'condition returned false';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(`${description} timed out after ${timeoutMs} ms: ${lastError}${launcher ? `\n${launcher.getLog()}` : ''}`);
}

async function assertPortsState(openPorts, closedPorts, context) {
  for (const port of openPorts) {
    assert.equal(await isPortListening(port), true, `${context}: expected port ${port} to listen`);
  }

  for (const port of closedPorts) {
    assert.equal(await isPortListening(port), false, `${context}: expected port ${port} to stay closed`);
  }
}

async function waitForTtsReady(launcher) {
  await waitForCondition(async () => {
    const paddle = await fetchJson(`http://127.0.0.1:${PADDLE_PORT}/health`);
    const supertone = await fetchJson(`http://127.0.0.1:${SUPERTONE_PORT}/health`);
    const kokoro = await fetchJson(`http://127.0.0.1:${KOKORO_PORT}/health`);
    const f5 = await fetchJson(`http://127.0.0.1:${F5_PORT}/health`);
    const backend = await fetchJson(`http://127.0.0.1:${APP_PORT}/api/health`);

    assert.equal(typeof paddle.device, 'string');
    assert.equal(supertone.ready, true, 'Supertone must report ready');
    assert.equal(supertone.piper?.ready, true, 'Piper must report ready');
    assert.ok(
      Array.isArray(supertone.piper?.available_voices) && supertone.piper.available_voices.length > 0,
      'Piper must expose at least one voice',
    );
    assert.equal(kokoro.ready, true, 'Kokoro must report ready');
    assert.equal(f5.ready, true, 'F5 must report ready');
    assert.equal(typeof backend.paddleOcrReachable, 'boolean');
    return true;
  }, TTS_READY_TIMEOUT_MS, 'TTS launcher readiness', launcher);
}

async function waitForOcrReady(launcher) {
  await waitForCondition(async () => {
    const paddle = await fetchJson(`http://127.0.0.1:${PADDLE_PORT}/health`);
    const kokoro = await fetchJson(`http://127.0.0.1:${KOKORO_PORT}/health`);
    const models = await fetchJson(`${LM_URL.replace(/\/$/, '')}/models`);
    const backend = await fetchJson(`http://127.0.0.1:${APP_PORT}/api/health`);

    assert.equal(typeof paddle.device, 'string');
    assert.equal(kokoro.ready, true, 'Kokoro must report ready');
    assert.ok(Array.isArray(models.data), 'LM Studio /models must return a list');
    assert.ok(
      models.data.some((item) => (item.id ?? item.model ?? '') === LM_MODEL_ID),
      `LM Studio must expose model ${LM_MODEL_ID}`,
    );
    assert.equal(typeof backend.paddleOcrReachable, 'boolean');
    return true;
  }, OCR_READY_TIMEOUT_MS, 'OCR launcher readiness', launcher);
}

async function waitForAllReady(launcher) {
  await waitForCondition(async () => {
    const paddle = await fetchJson(`http://127.0.0.1:${PADDLE_PORT}/health`);
    const supertone = await fetchJson(`http://127.0.0.1:${SUPERTONE_PORT}/health`);
    const kokoro = await fetchJson(`http://127.0.0.1:${KOKORO_PORT}/health`);
    const f5 = await fetchJson(`http://127.0.0.1:${F5_PORT}/health`);
    const models = await fetchJson(`${LM_URL.replace(/\/$/, '')}/models`);
    const backend = await fetchJson(`http://127.0.0.1:${APP_PORT}/api/health`);

    assert.equal(typeof paddle.device, 'string');
    assert.equal(supertone.ready, true, 'Supertone must report ready');
    assert.equal(supertone.piper?.ready, true, 'Piper must report ready');
    assert.equal(kokoro.ready, true, 'Kokoro must report ready');
    assert.equal(f5.ready, true, 'F5 must report ready');
    assert.ok(Array.isArray(models.data), 'LM Studio /models must return a list');
    assert.ok(
      models.data.some((item) => (item.id ?? item.model ?? '') === LM_MODEL_ID),
      `LM Studio must expose model ${LM_MODEL_ID}`,
    );
    assert.equal(typeof backend.paddleOcrReachable, 'boolean');
    return true;
  }, TTS_READY_TIMEOUT_MS, 'ALL launcher readiness', launcher);
}

async function cleanupEverything() {
  try {
    await runScript(ALL_SCRIPT_PATH, ['stop'], STOP_TIMEOUT_MS, [0]);
  } catch (error) {
    console.error('[launcher-e2e] cleanup failed', error);
  }
}

async function assertEverythingStopped() {
  await waitForCondition(async () => {
    await assertPortsState([], [PADDLE_PORT, SUPERTONE_PORT, KOKORO_PORT, F5_PORT, APP_PORT], 'post-stop');
    return true;
  }, STOP_TIMEOUT_MS, 'launcher full shutdown');
}

async function isLmStudioReady() {
  try {
    const models = await fetchJson(`${LM_URL.replace(/\/$/, '')}/models`);
    return Array.isArray(models.data)
      && models.data.some((item) => (item.id ?? item.model ?? '') === LM_MODEL_ID);
  } catch {
    return false;
  }
}

test('tts.sh starts TTS mode and stops cleanly', { timeout: 15 * 60 * 1000 }, async () => {
  const launchers = [];

  try {
    mark('cleanup:initial');
    await cleanupEverything();
    const lmWasListening = await isPortListening(LM_PORT);

    mark('start:tts');
    const tts = spawnLauncher(TTS_SCRIPT_PATH, 'tts');
    launchers.push(tts);

    await waitForTtsReady(tts);
    const closedPorts = [];
    if (!lmWasListening) {
      closedPorts.unshift(LM_PORT);
    }
    await assertPortsState([PADDLE_PORT, SUPERTONE_PORT, KOKORO_PORT, F5_PORT, APP_PORT], closedPorts, 'tts-mode');

    mark('stop:tts');
    await runScript(TTS_SCRIPT_PATH, ['stop'], STOP_TIMEOUT_MS, [0]);
    await assertEverythingStopped();
  } finally {
    for (const entry of launchers) {
      if (entry.child.exitCode === null) {
        entry.child.kill('SIGKILL');
      }
    }
    await cleanupEverything();
  }
});

test('ocr.sh starts OCR mode when LM Studio is ready', { timeout: 12 * 60 * 1000 }, async (t) => {
  if (!(await isLmStudioReady())) {
    t.skip('LM Studio server/model is not ready in this environment');
    return;
  }

  const launchers = [];

  try {
    mark('cleanup:initial');
    await cleanupEverything();

    mark('start:ocr');
    const ocr = spawnLauncher(OCR_SCRIPT_PATH, 'ocr');
    launchers.push(ocr);

    await waitForOcrReady(ocr);
    await assertPortsState([PADDLE_PORT, KOKORO_PORT, LM_PORT, APP_PORT], [SUPERTONE_PORT, F5_PORT], 'ocr-mode');

    mark('stop:ocr');
    await runScript(OCR_SCRIPT_PATH, ['stop'], STOP_TIMEOUT_MS, [0]);
    await assertEverythingStopped();
  } finally {
    for (const entry of launchers) {
      if (entry.child.exitCode === null) {
        entry.child.kill('SIGKILL');
      }
    }
    await cleanupEverything();
  }
});

test('ocr-tts.sh starts ALL mode when LM Studio is ready', { timeout: 18 * 60 * 1000 }, async (t) => {
  if (!(await isLmStudioReady())) {
    t.skip('LM Studio server/model is not ready in this environment');
    return;
  }

  const launchers = [];

  try {
    mark('cleanup:initial');
    await cleanupEverything();

    mark('start:all');
    const all = spawnLauncher(ALL_SCRIPT_PATH, 'all');
    launchers.push(all);

    await waitForAllReady(all);
    await assertPortsState(
      [PADDLE_PORT, SUPERTONE_PORT, KOKORO_PORT, F5_PORT, LM_PORT, APP_PORT],
      [],
      'all-mode',
    );

    mark('stop:all');
    await runScript(ALL_SCRIPT_PATH, ['stop'], STOP_TIMEOUT_MS, [0]);
    await assertEverythingStopped();
  } finally {
    for (const entry of launchers) {
      if (entry.child.exitCode === null) {
        entry.child.kill('SIGKILL');
      }
    }
    await cleanupEverything();
  }
});
