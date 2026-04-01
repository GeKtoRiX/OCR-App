import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OCR_SCRIPT_PATH = `${ROOT_DIR}/scripts/linux/ocr.sh`;
const TTS_SCRIPT_PATH = `${ROOT_DIR}/scripts/linux/tts.sh`;
const ALL_SCRIPT_PATH = `${ROOT_DIR}/scripts/linux/ocr-tts.sh`;
const TTS_CONF_PATH = `${ROOT_DIR}/scripts/linux/tts-models.conf`;

const APP_PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const SUPERTONE_PORT = Number.parseInt(process.env.SUPERTONE_PORT ?? '8100', 10);
const KOKORO_PORT = Number.parseInt(process.env.KOKORO_PORT ?? '8200', 10);
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

// ─── TTS config ────────────────────────────────────────────────────────────────

async function parseTtsConf() {
  try {
    const text = await readFile(TTS_CONF_PATH, 'utf8');
    const conf = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(true|false)\s*$/);
      if (m) conf[m[1]] = m[2] === 'true';
    }
    return conf;
  } catch {
    return {};
  }
}

function ttsActivePorts(conf) {
  const ports = [];
  if (conf.TTS_ENABLE_SUPERTONE) ports.push(SUPERTONE_PORT);
  if (conf.TTS_ENABLE_KOKORO) ports.push(KOKORO_PORT);
  return ports;
}

function ttsInactivePorts(conf) {
  const ports = [];
  if (!conf.TTS_ENABLE_SUPERTONE) ports.push(SUPERTONE_PORT);
  if (!conf.TTS_ENABLE_KOKORO) ports.push(KOKORO_PORT);
  return ports;
}

function ocrStartsSupertone(conf) {
  return conf.TTS_ENABLE_SUPERTONE || conf.TTS_ENABLE_KOKORO;
}

// ─── Readiness checks ──────────────────────────────────────────────────────────

async function checkEnabledTtsEngines(conf) {
  assert.ok(
    conf.TTS_ENABLE_SUPERTONE || conf.TTS_ENABLE_KOKORO,
    'At least one TTS engine must be enabled in tts-models.conf',
  );

  if (conf.TTS_ENABLE_SUPERTONE) {
    const r = await fetchJson(`http://127.0.0.1:${SUPERTONE_PORT}/health`);
    assert.equal(r.ready, true, 'Supertone must report ready');
    assert.equal(r.piper?.ready, true, 'Piper must report ready');
    assert.ok(
      Array.isArray(r.piper?.available_voices) && r.piper.available_voices.length > 0,
      'Piper must expose at least one voice',
    );
  }

  if (conf.TTS_ENABLE_KOKORO) {
    const r = await fetchJson(`http://127.0.0.1:${KOKORO_PORT}/health`);
    assert.equal(r.ready, true, 'Kokoro must report ready');
  }
}

async function waitForTtsReady(launcher) {
  const conf = await parseTtsConf();

  await waitForCondition(async () => {
    await checkEnabledTtsEngines(conf);
    const backend = await fetchJson(`http://127.0.0.1:${APP_PORT}/api/health`);
    assert.equal(typeof backend.superToneReachable, 'boolean');
    return true;
  }, TTS_READY_TIMEOUT_MS, 'TTS launcher readiness', launcher);
}

async function waitForOcrReady(launcher) {
  const conf = await parseTtsConf();

  await waitForCondition(async () => {
    if (ocrStartsSupertone(conf)) {
      const r = await fetchJson(`http://127.0.0.1:${SUPERTONE_PORT}/health`);
      assert.equal(r.ready, true, 'Supertone must report ready');
      assert.equal(r.piper?.ready, true, 'Piper must report ready');
      assert.ok(
        Array.isArray(r.piper?.available_voices) && r.piper.available_voices.length > 0,
        'Piper must expose at least one voice',
      );
    }
    if (conf.TTS_ENABLE_KOKORO) {
      const r = await fetchJson(`http://127.0.0.1:${KOKORO_PORT}/health`);
      assert.equal(r.ready, true, 'Kokoro must report ready');
    }
    const models = await fetchJson(`${LM_URL.replace(/\/$/, '')}/models`);
    assert.ok(Array.isArray(models.data), 'LM Studio /models must return a list');
    assert.ok(
      models.data.some((item) => (item.id ?? item.model ?? '') === LM_MODEL_ID),
      `LM Studio must expose model ${LM_MODEL_ID}`,
    );
    const backend = await fetchJson(`http://127.0.0.1:${APP_PORT}/api/health`);
    assert.equal(backend.ocrReachable, true, 'OCR backend must report ready');
    return true;
  }, OCR_READY_TIMEOUT_MS, 'OCR launcher readiness', launcher);
}

async function waitForAllReady(launcher) {
  const conf = await parseTtsConf();

  await waitForCondition(async () => {
    await checkEnabledTtsEngines(conf);
    const models = await fetchJson(`${LM_URL.replace(/\/$/, '')}/models`);
    assert.ok(Array.isArray(models.data), 'LM Studio /models must return a list');
    assert.ok(
      models.data.some((item) => (item.id ?? item.model ?? '') === LM_MODEL_ID),
      `LM Studio must expose model ${LM_MODEL_ID}`,
    );
    const backend = await fetchJson(`http://127.0.0.1:${APP_PORT}/api/health`);
    assert.equal(backend.ocrReachable, true, 'OCR backend must report ready');
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
    await assertPortsState(
      [],
      [SUPERTONE_PORT, KOKORO_PORT, APP_PORT],
      'post-stop',
    );
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

// ─── Tests ─────────────────────────────────────────────────────────────────────

test('tts.sh starts TTS mode and stops cleanly', { timeout: 15 * 60 * 1000 }, async () => {
  const conf = await parseTtsConf();
  const launchers = [];

  try {
    mark('cleanup:initial');
    await cleanupEverything();
    const lmWasListening = await isPortListening(LM_PORT);

    mark('start:tts');
    const tts = spawnLauncher(TTS_SCRIPT_PATH, 'tts');
    launchers.push(tts);

    await waitForTtsReady(tts);

    const closedPorts = [
      ...ttsInactivePorts(conf),
      ...(!lmWasListening ? [LM_PORT] : []),
    ];
    await assertPortsState([APP_PORT, ...ttsActivePorts(conf)], closedPorts, 'tts-mode');

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

  const conf = await parseTtsConf();
  const launchers = [];

  try {
    mark('cleanup:initial');
    await cleanupEverything();

    mark('start:ocr');
    const ocr = spawnLauncher(OCR_SCRIPT_PATH, 'ocr');
    launchers.push(ocr);

    await waitForOcrReady(ocr);

    const activePorts = [LM_PORT, APP_PORT];
    if (ocrStartsSupertone(conf)) activePorts.push(SUPERTONE_PORT);
    if (conf.TTS_ENABLE_KOKORO) activePorts.push(KOKORO_PORT);

    const closedPorts = [];
    if (!ocrStartsSupertone(conf)) closedPorts.push(SUPERTONE_PORT);
    if (!conf.TTS_ENABLE_KOKORO) closedPorts.push(KOKORO_PORT);

    await assertPortsState(activePorts, closedPorts, 'ocr-mode');

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
  t.skip('ALL mode requires full VRAM budget (OCR + all TTS engines simultaneously) — run manually on capable hardware');
  return;

  if (!(await isLmStudioReady())) {
    t.skip('LM Studio server/model is not ready in this environment');
    return;
  }

  const conf = await parseTtsConf();
  const launchers = [];

  try {
    mark('cleanup:initial');
    await cleanupEverything();

    mark('start:all');
    const all = spawnLauncher(ALL_SCRIPT_PATH, 'all');
    launchers.push(all);

    await waitForAllReady(all);

    const activePorts = [LM_PORT, APP_PORT, ...ttsActivePorts(conf)];
    await assertPortsState(activePorts, ttsInactivePorts(conf), 'all-mode');

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
