#!/usr/bin/env node
'use strict';

/**
 * Project MCP server for OCR-App.
 *
 * Practical tools for day-to-day pairing:
 * - runtime health checks
 * - LM Studio visibility
 * - saved documents lookup
 * - vocabulary lookup and due-review queues
 * - practice error inspection
 * - whitelisted smoke commands
 *
 * Configure in Codex:
 *   codex mcp add ocr-project -- node /mnt/HDD_Store/ocrProject/scripts/mcp-vocab-server.js
 *
 * Configure in LM Studio:
 *   {
 *     "mcpServers": {
 *       "ocr-project": {
 *         "type": "stdio",
 *         "command": "node",
 *         "args": ["/mnt/HDD_Store/ocrProject/scripts/mcp-vocab-server.js"]
 *       }
 *     }
 *   }
 */

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const util = require('util');
const Database = require('better-sqlite3');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const execFileAsync = util.promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const VOCAB_DB_PATH = path.join(ROOT, 'data', 'vocabulary.sqlite');
const DOC_DB_PATH = path.join(ROOT, 'data', 'documents.sqlite');
const DEFAULT_GATEWAY_URL = process.env.OCR_APP_GATEWAY_URL || 'http://127.0.0.1:3000';
const DEFAULT_LM_STUDIO_URL =
  process.env.OCR_APP_LM_STUDIO_URL || 'http://127.0.0.1:1234/v1/models';
const PERF_LOG_DIR = path.join(ROOT, 'tmp', 'perf', 'logs');
const RUNTIME_LOG_DIR = path.join(ROOT, 'logs');
const OCR_LAUNCHER = path.join(ROOT, 'scripts', 'linux', 'ocr.sh');

const vocabDb = new Database(VOCAB_DB_PATH, { readonly: true });
const docDb = new Database(DOC_DB_PATH, { readonly: true });

const ALLOWED_SMOKE_SCRIPTS = new Set([
  'smoke:ocr',
  'smoke:lmstudio',
  'smoke:stanza',
  'smoke:bert',
  'smoke:supertone',
  'smoke:kokoro',
]);

const ALLOWED_RUNTIME_LOGS = new Set([
  'backend.log',
  'svc-ocr.log',
  'svc-tts.log',
  'svc-doc.log',
  'svc-vocab.log',
  'svc-agentic.log',
  'supertone.log',
  'kokoro.log',
  'stanza.log',
  'bert.log',
  'lmstudio.log',
]);

function asPrettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function okText(text) {
  return { content: [{ type: 'text', text }] };
}

function okJson(value) {
  return okText(asPrettyJson(value));
}

function errorText(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function normalizeLimit(value, fallback, max = 100) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizeLike(value) {
  return `%${String(value ?? '').trim().toLowerCase()}%`;
}

function normalizeGatewayPath(value) {
  const pathValue = String(value || '').trim();
  if (!pathValue.startsWith('/api/')) {
    throw new Error('path must start with /api/');
  }
  return pathValue;
}

function isAllowedGatewayPath(pathValue) {
  const allowedPrefixes = [
    '/api/health',
    '/api/documents',
    '/api/vocabulary',
    '/api/practice/sessions',
    '/api/practice/stats/',
  ];
  return allowedPrefixes.some((prefix) => pathValue === prefix || pathValue.startsWith(prefix));
}

function resolvePerfLogFile(filename) {
  const safe = path.basename(String(filename || '').trim());
  if (!safe) {
    throw new Error('filename is required');
  }
  return path.join(PERF_LOG_DIR, safe);
}

function resolveRuntimeLogFile(filename) {
  const safe = path.basename(String(filename || '').trim());
  if (!ALLOWED_RUNTIME_LOGS.has(safe)) {
    throw new Error(
      `filename must be one of: ${Array.from(ALLOWED_RUNTIME_LOGS).join(', ')}`,
    );
  }
  return path.join(RUNTIME_LOG_DIR, safe);
}

function ensureProjectRelativeFile(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('path is required');
  }

  const resolved = path.resolve(ROOT, raw);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error('path must stay inside the project root');
  }
  return resolved;
}

function ensureSupportedTestFile(resolvedPath, patterns) {
  const normalized = resolvedPath.replace(/\\/g, '/');
  if (!patterns.some((pattern) => pattern.test(normalized))) {
    throw new Error('path is not a supported test file for this runner');
  }
}

function walkProject(dir, options, acc = []) {
  const {
    maxDepth = 3,
    skipDirs = new Set(['node_modules', '.git', 'dist', 'coverage']),
    fileFilter = () => true,
  } = options;

  function visit(currentDir, depth) {
    if (depth > maxDepth) {
      return;
    }
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) {
          continue;
        }
        visit(path.join(currentDir, entry.name), depth + 1);
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (fileFilter(fullPath, entry.name)) {
        acc.push(path.relative(ROOT, fullPath).replace(/\\/g, '/'));
      }
    }
  }

  visit(dir, 0);
  return acc;
}

function buildProjectMap() {
  const zones = [
    {
      area: 'frontend',
      path: 'frontend',
      purpose: 'React/Vite UI, view state, stores, browser UX tests',
    },
    {
      area: 'backend/gateway',
      path: 'backend/gateway/src',
      purpose: 'HTTP API entrypoint and route layer for the app',
    },
    {
      area: 'backend/core',
      path: 'backend/src',
      purpose: 'domain, application use-cases, infrastructure, service adapters',
    },
    {
      area: 'backend/services',
      path: 'backend/services',
      purpose: 'TCP microservice processes for OCR, TTS, documents, vocabulary, agentic',
    },
    {
      area: 'services/nlp',
      path: 'services/nlp',
      purpose: 'Python sidecars such as Stanza and BERT',
    },
    {
      area: 'services/tts',
      path: 'services/tts',
      purpose: 'Python TTS sidecars such as Supertone and Kokoro',
    },
    {
      area: 'scripts',
      path: 'scripts',
      purpose: 'launcher, bootstrap, perf, e2e, and MCP entrypoints',
    },
    {
      area: 'data',
      path: 'data',
      purpose: 'live SQLite and editor asset storage',
    },
    {
      area: 'e2e',
      path: 'e2e',
      purpose: 'Playwright browser specs',
    },
  ];

  const keyFiles = [
    'package.json',
    'README.md',
    'frontend/package.json',
    'backend/package.json',
    'backend/jest.config.js',
    'playwright.config.ts',
    'scripts/mcp-vocab-server.js',
    'scripts/linux/ocr.sh',
    'scripts/linux/ocr-common.sh',
  ];

  const packageFiles = walkProject(ROOT, {
    maxDepth: 3,
    fileFilter: (_, name) => name === 'package.json',
  }).sort();

  return {
    root: ROOT,
    zones,
    key_files: keyFiles,
    package_files: packageFiles,
    notes: [
      'Gateway lives under backend/gateway/src, while most core logic and infrastructure live under backend/src.',
      'Live user data is stored in data/*.sqlite.',
      'The project MCP server itself lives in scripts/mcp-vocab-server.js.',
    ],
  };
}

function buildApiMap() {
  return {
    gateway_root: 'backend/gateway/src',
    controllers: [
      { area: 'health', base: '/api', routes: ['GET /health'] },
      { area: 'ocr', base: '/api', routes: ['POST /ocr'] },
      { area: 'tts', base: '/api', routes: ['POST /tts'] },
      {
        area: 'documents',
        base: '/api/documents',
        routes: [
          'POST /',
          'GET /',
          'GET /:id',
          'PUT /:id',
          'DELETE /:id',
          'POST /:id/vocabulary/prepare',
          'POST /:id/vocabulary/confirm',
        ],
      },
      {
        area: 'vocabulary',
        base: '/api/vocabulary',
        routes: [
          'POST /',
          'POST /batch',
          'GET /',
          'GET /review/due',
          'GET /:id',
          'PUT /:id',
          'DELETE /:id',
        ],
      },
      {
        area: 'practice',
        base: '/api/practice',
        routes: [
          'POST /start',
          'POST /plan',
          'POST /round',
          'POST /answer',
          'POST /complete',
          'GET /sessions',
          'GET /stats/:vocabularyId',
        ],
      },
      {
        area: 'editor',
        base: '/api/editor',
        routes: ['POST /uploads/images'],
      },
      {
        area: 'ai',
        base: '/api/ai',
        routes: ['POST /chat'],
      },
      {
        area: 'agentic',
        base: '/api/agents',
        routes: ['POST /architecture', 'POST /deploy'],
      },
    ],
  };
}

function buildRuntimeMap(health, lmStudio, lms) {
  return {
    gateway: {
      url: DEFAULT_GATEWAY_URL,
      port: 3000,
      health_endpoint: `${DEFAULT_GATEWAY_URL}/api/health`,
      reachable: health.reachable,
    },
    model_runtime: {
      provider: 'LM Studio',
      models_endpoint: DEFAULT_LM_STUDIO_URL,
      reachable: lmStudio.reachable,
      models: lmStudio.models,
      lms_ps: lms,
    },
    tcp_services: [
      { name: 'ocr-service', port: 3901 },
      { name: 'tts-service', port: 3902 },
      { name: 'document-service', port: 3903 },
      { name: 'vocabulary-service', port: 3904 },
      { name: 'agentic-service', port: 3905 },
    ],
    sidecars: [
      { name: 'supertone', port: 8100, reachable: health.data?.superToneReachable ?? null },
      { name: 'kokoro', port: 8200, reachable: health.data?.kokoroReachable ?? null },
      { name: 'stanza', port: 8501, reachable: null },
      { name: 'bert', port: 8502, reachable: null },
    ],
    launchers: [
      'scripts/linux/ocr.sh',
      'scripts/linux/ocr-common.sh',
      'scripts/e2e/browser-stack.sh',
      'scripts/perf/run-phase4.sh',
    ],
  };
}

function buildDataMap() {
  return {
    sqlite: [
      { file: 'data/vocabulary.sqlite', tables: ['vocabulary', 'exercise_attempts', 'practice_sessions', 'generated_exercises', 'generated_exercise_sets'] },
      { file: 'data/documents.sqlite', tables: ['saved_documents', 'document_vocab_candidates'] },
      { file: 'data/ocr-app.db', tables: 'legacy_or_other_runtime_db' },
    ],
    other_storage: [
      'data/editor-assets',
      'logs',
      'tmp/perf/logs',
      '.pids',
    ],
    important_links: [
      'vocabulary.source_document_id -> saved_documents.id',
      'exercise_attempts.vocabulary_id -> vocabulary.id',
      'document_vocab_candidates.document_id -> saved_documents.id',
    ],
  };
}

function buildTestMap() {
  const tests = walkProject(ROOT, {
    maxDepth: 6,
    fileFilter: (fullPath, name) => /\.(spec|test)\.(ts|tsx|js|mjs)$/.test(name),
  }).sort();

  return {
    counts: {
      frontend_unit: tests.filter((item) => item.startsWith('frontend/')).length,
      backend_specs: tests.filter((item) => item.startsWith('backend/') && item.endsWith('.spec.ts')).length,
      backend_e2e: tests.filter((item) => item.startsWith('backend/') && item.includes('.e2e.')).length,
      playwright: tests.filter((item) => item.startsWith('e2e/')).length,
    },
    scripts: {
      frontend_unit: 'npm run test --workspace=frontend',
      backend_unit: 'npm run test --workspace=./backend',
      backend_api_e2e: 'npm run test:e2e:api',
      backend_integration_e2e: 'npm run test:e2e:integration',
      browser_e2e: 'npm run test:e2e:browser',
      browser_ai_e2e: 'npm run test:e2e:browser:ai',
      browser_vocab_e2e: 'npm run test:e2e:browser:vocab',
      launcher_e2e: 'npm run test:e2e:launcher',
      smoke: Array.from(ALLOWED_SMOKE_SCRIPTS),
    },
    files: tests,
  };
}

function buildEntryPointMap() {
  return {
    launch: [
      'scripts/linux/ocr.sh',
      'scripts/linux/ocr-common.sh',
    ],
    mcp: [
      'scripts/mcp-vocab-server.js',
      '/home/cbandy/.codex/config.toml',
      '/home/cbandy/.lmstudio/mcp.json',
    ],
    root_scripts: [
      'npm run dev:frontend',
      'npm run dev:backend',
      'npm run mcp:project',
      'npm run smoke:ocr',
      'npm run smoke:lmstudio',
      'npm run test:e2e:browser',
    ],
    backend_entrypoints: [
      'backend/gateway/src/main.ts',
      'backend/services/ocr/src/main.ts',
      'backend/services/tts/src/main.ts',
      'backend/services/document/src/main.ts',
      'backend/services/vocabulary/src/main.ts',
      'backend/services/agentic/src/main.ts',
    ],
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function maybeFetchJson(url, options = {}) {
  try {
    return await fetchJson(url, options);
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: { error: error.message },
    };
  }
}

async function getLmStudioSnapshot() {
  const response = await maybeFetchJson(DEFAULT_LM_STUDIO_URL);
  const models = Array.isArray(response.body?.data)
    ? response.body.data.map((item) => item.id)
    : [];
  return {
    reachable: response.ok,
    status: response.status,
    models,
    endpoint: DEFAULT_LM_STUDIO_URL,
    error: response.ok ? null : response.body?.error || response.body || 'Request failed',
  };
}

async function getGatewayHealthSnapshot() {
  const response = await maybeFetchJson(`${DEFAULT_GATEWAY_URL}/api/health`);
  return {
    reachable: response.ok,
    status: response.status,
    endpoint: `${DEFAULT_GATEWAY_URL}/api/health`,
    data: response.ok ? response.body : null,
    error: response.ok ? null : response.body?.error || response.body || 'Request failed',
  };
}

function buildProjectDoctor(gateway, lmStudio, lms) {
  const checks = [
    {
      name: 'gateway_health',
      ok: gateway.reachable,
      detail: gateway.reachable
        ? gateway.data
        : gateway.error || `HTTP ${gateway.status ?? 'unreachable'}`,
    },
    {
      name: 'lmstudio_models_endpoint',
      ok: lmStudio.reachable,
      detail: lmStudio.reachable
        ? { models: lmStudio.models, endpoint: lmStudio.endpoint }
        : lmStudio.error || `HTTP ${lmStudio.status ?? 'unreachable'}`,
    },
    {
      name: 'lms_cli',
      ok: lms.available,
      detail: lms.available ? lms.raw : lms.error,
    },
  ];

  const warnings = [];
  const recommendations = [];

  if (!gateway.reachable) {
    warnings.push('Gateway /api/health is unreachable.');
    recommendations.push('Start the local stack or at least the gateway before debugging product flows.');
  }

  if (!lmStudio.reachable) {
    warnings.push('LM Studio /v1/models is unreachable.');
    recommendations.push('Start LM Studio server on localhost:1234 and load a model.');
  }

  if (lmStudio.reachable && lmStudio.models.length === 0) {
    warnings.push('LM Studio is reachable but reports no models.');
    recommendations.push('Load a text model in LM Studio before OCR or vocabulary flows.');
  }

  if (gateway.reachable && gateway.data?.lmStudioReachable === false) {
    warnings.push('Gateway can talk, but backend reports LM Studio is not reachable.');
    recommendations.push('Check backend LM Studio config and ensure the model server is still alive.');
  }

  if (gateway.reachable && gateway.data?.superToneReachable === false) {
    warnings.push('Supertone sidecar is down.');
  }

  if (gateway.reachable && gateway.data?.kokoroReachable === false) {
    warnings.push('Kokoro sidecar is down.');
  }

  if (lms.available && /PROCESSINGPROMPT|LOADING|GENERATING/i.test(lms.raw)) {
    warnings.push('LM Studio is busy processing a prompt right now.');
    recommendations.push('Wait for the queue to clear before starting smoke tests or parallel debugging.');
  }

  return {
    ok: warnings.length === 0,
    warnings,
    recommendations,
    checks,
  };
}

async function getLmsProcessSnapshot() {
  try {
    const { stdout } = await execFileAsync('lms', ['ps'], { cwd: ROOT, timeout: 15000 });
    return {
      available: true,
      raw: stdout.trim(),
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
}

async function runCommandCapture(command, args, options = {}) {
  const { cwd = ROOT, timeout = 15_000, maxBuffer = 10 * 1024 * 1024 } = options;
  try {
    const result = await execFileAsync(command, args, { cwd, timeout, maxBuffer });
    return {
      ok: true,
      command,
      args,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      command,
      args,
      stdout: error.stdout?.trim?.() || '',
      stderr: error.stderr?.trim?.() || error.message,
      exitCode: error.code ?? null,
    };
  }
}

const stmts = {
  listDocuments: docDb.prepare(`
    SELECT
      id,
      filename,
      created_at,
      updated_at,
      analysis_status,
      analysis_error
    FROM saved_documents
    WHERE (? = '' OR lower(filename) LIKE ?)
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `),

  getDocument: docDb.prepare(`
    SELECT
      id,
      filename,
      markdown,
      rich_text_html,
      created_at,
      updated_at,
      analysis_status,
      analysis_error,
      analysis_updated_at
    FROM saved_documents
    WHERE id = ?
  `),

  getDocumentCandidates: docDb.prepare(`
    SELECT
      id,
      surface,
      normalized,
      lemma,
      vocab_type,
      pos,
      translation,
      context_sentence,
      sentence_index,
      selected_by_default,
      is_duplicate,
      review_source
    FROM document_vocab_candidates
    WHERE document_id = ?
    ORDER BY sentence_index ASC, surface ASC
    LIMIT ?
  `),

  searchDocumentCandidates: docDb.prepare(`
    SELECT
      dvc.id,
      dvc.document_id,
      sd.filename,
      dvc.surface,
      dvc.normalized,
      dvc.lemma,
      dvc.vocab_type,
      dvc.pos,
      dvc.translation,
      dvc.context_sentence,
      dvc.selected_by_default,
      dvc.is_duplicate,
      dvc.review_source
    FROM document_vocab_candidates dvc
    JOIN saved_documents sd ON sd.id = dvc.document_id
    WHERE lower(dvc.surface) LIKE ?
       OR lower(dvc.normalized) LIKE ?
       OR lower(dvc.translation) LIKE ?
       OR lower(dvc.context_sentence) LIKE ?
    ORDER BY datetime(sd.created_at) DESC, dvc.surface ASC
    LIMIT ?
  `),

  getCandidateByWord: docDb.prepare(`
    SELECT
      dvc.id,
      dvc.document_id,
      sd.filename,
      sd.created_at AS document_created_at,
      dvc.surface,
      dvc.normalized,
      dvc.lemma,
      dvc.vocab_type,
      dvc.pos,
      dvc.translation,
      dvc.context_sentence,
      dvc.sentence_index,
      dvc.selected_by_default,
      dvc.is_duplicate,
      dvc.review_source
    FROM document_vocab_candidates dvc
    JOIN saved_documents sd ON sd.id = dvc.document_id
    WHERE lower(dvc.surface) = lower(?)
       OR lower(dvc.normalized) = lower(?)
       OR lower(dvc.lemma) = lower(?)
    ORDER BY datetime(sd.created_at) DESC, dvc.sentence_index ASC
    LIMIT ?
  `),

  listVocabulary: vocabDb.prepare(`
    SELECT
      id,
      word,
      vocab_type,
      pos,
      translation,
      target_lang,
      native_lang,
      context_sentence,
      source_document_id,
      interval_days,
      easiness_factor,
      repetitions,
      next_review_at,
      created_at,
      updated_at
    FROM vocabulary
    WHERE (? IS NULL OR target_lang = ?)
      AND (? IS NULL OR native_lang = ?)
      AND (
        ? = '' OR
        lower(word) LIKE ? OR
        lower(translation) LIKE ? OR
        lower(context_sentence) LIKE ?
      )
    ORDER BY datetime(created_at) DESC, word ASC
    LIMIT ?
  `),

  getVocabularyWordById: vocabDb.prepare(`
    SELECT
      id,
      word,
      vocab_type,
      pos,
      translation,
      target_lang,
      native_lang,
      context_sentence,
      source_document_id,
      interval_days,
      easiness_factor,
      repetitions,
      next_review_at,
      created_at,
      updated_at
    FROM vocabulary
    WHERE id = ?
  `),

  getVocabularyWordByText: vocabDb.prepare(`
    SELECT
      id,
      word,
      vocab_type,
      pos,
      translation,
      target_lang,
      native_lang,
      context_sentence,
      source_document_id,
      interval_days,
      easiness_factor,
      repetitions,
      next_review_at,
      created_at,
      updated_at
    FROM vocabulary
    WHERE lower(word) = lower(?)
      AND (? IS NULL OR target_lang = ?)
      AND (? IS NULL OR native_lang = ?)
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `),

  getVocabularyWordsByText: vocabDb.prepare(`
    SELECT
      id,
      word,
      vocab_type,
      pos,
      translation,
      target_lang,
      native_lang,
      context_sentence,
      source_document_id,
      interval_days,
      easiness_factor,
      repetitions,
      next_review_at,
      created_at,
      updated_at
    FROM vocabulary
    WHERE lower(word) = lower(?)
      AND (? IS NULL OR target_lang = ?)
      AND (? IS NULL OR native_lang = ?)
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `),

  getVocabularyWordsBySourceDocument: vocabDb.prepare(`
    SELECT
      id,
      word,
      translation,
      vocab_type,
      pos,
      target_lang,
      native_lang,
      next_review_at,
      repetitions,
      easiness_factor,
      created_at
    FROM vocabulary
    WHERE source_document_id = ?
    ORDER BY datetime(created_at) DESC, word ASC
    LIMIT ?
  `),

  listDueVocabulary: vocabDb.prepare(`
    SELECT
      id,
      word,
      translation,
      vocab_type,
      pos,
      target_lang,
      native_lang,
      next_review_at,
      interval_days,
      easiness_factor,
      repetitions
    FROM vocabulary
    WHERE (? IS NULL OR target_lang = ?)
      AND (? IS NULL OR native_lang = ?)
      AND (next_review_at IS NULL OR datetime(next_review_at) <= datetime('now'))
    ORDER BY datetime(next_review_at) ASC, word ASC
    LIMIT ?
  `),

  wordStats: vocabDb.prepare(`
    SELECT
      v.id,
      v.word,
      v.translation,
      v.vocab_type,
      v.pos,
      v.target_lang,
      v.native_lang,
      v.interval_days,
      v.easiness_factor,
      v.repetitions,
      v.next_review_at,
      COUNT(ea.id) AS attempt_count,
      COALESCE(SUM(CASE WHEN ea.is_correct = 0 THEN 1 ELSE 0 END), 0) AS incorrect_count,
      MAX(ea.created_at) AS last_attempt_at,
      GROUP_CONCAT(DISTINCT ea.exercise_type) AS exercise_types_tried
    FROM vocabulary v
    LEFT JOIN exercise_attempts ea ON ea.vocabulary_id = v.id
    WHERE v.id = ?
    GROUP BY v.id
  `),

  recentPracticeMistakes: vocabDb.prepare(`
    SELECT
      ea.id,
      ea.created_at,
      ea.exercise_type,
      ea.prompt,
      ea.correct_answer,
      ea.user_answer,
      ea.error_position,
      ea.quality_rating,
      v.id AS vocabulary_id,
      v.word,
      v.translation,
      v.target_lang,
      v.native_lang
    FROM exercise_attempts ea
    JOIN vocabulary v ON v.id = ea.vocabulary_id
    WHERE ea.is_correct = 0
    ORDER BY datetime(ea.created_at) DESC
    LIMIT ?
  `),

  getPracticeAttemptsForWord: vocabDb.prepare(`
    SELECT
      ea.id,
      ea.created_at,
      ea.exercise_type,
      ea.prompt,
      ea.correct_answer,
      ea.user_answer,
      ea.is_correct,
      ea.error_position,
      ea.quality_rating,
      ea.mnemonic_sentence
    FROM exercise_attempts ea
    WHERE ea.vocabulary_id = ?
    ORDER BY datetime(ea.created_at) DESC
    LIMIT ?
  `),

  listPracticeSessions: vocabDb.prepare(`
    SELECT
      id,
      started_at,
      completed_at,
      target_lang,
      native_lang,
      total_exercises,
      correct_count,
      llm_analysis
    FROM practice_sessions
    ORDER BY datetime(started_at) DESC
    LIMIT ?
  `),

  listVocabLegacy: vocabDb.prepare(`
    SELECT
      id,
      word,
      vocab_type,
      translation,
      target_lang,
      native_lang,
      context_sentence,
      interval_days,
      easiness_factor,
      repetitions
    FROM vocabulary
    WHERE target_lang = ? AND native_lang = ?
    ORDER BY word ASC
  `),

  documentContextLegacy: docDb.prepare(`
    SELECT
      sd.filename,
      dvc.context_sentence,
      dvc.surface,
      dvc.translation
    FROM document_vocab_candidates dvc
    JOIN saved_documents sd ON sd.id = dvc.document_id
    WHERE lower(dvc.normalized) = lower(?)
       OR lower(dvc.surface) = lower(?)
    LIMIT 10
  `),
};

const TOOLS = [
  {
    name: 'get_project_health',
    description:
      'Checks OCR-App runtime status. Returns gateway /api/health, LM Studio model visibility, and lms ps output when available.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'project_map',
    description:
      'High-level structural map of the whole repo: zones, key files, packages, and where major responsibilities live.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'api_map',
    description:
      'Compact map of the gateway HTTP API grouped by controller area and route family.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'runtime_map',
    description:
      'Map of runtime topology: gateway, LM Studio, TCP services, sidecars, launchers, and live reachability.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'data_map',
    description:
      'Map of persistent project data: SQLite files, key tables, and important relationships between entities.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'test_map',
    description:
      'Map of the project test surface: unit, integration, browser e2e, launcher tests, and the concrete spec files.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'entrypoint_map',
    description:
      'Map of the main launch, MCP, backend, and root script entrypoints used to operate the project.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'project_doctor',
    description:
      'High-signal runtime diagnosis for OCR-App. Summarizes what is healthy, what is broken, and what to fix first.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_gateway_json',
    description:
      'Read-only fetch against a small allowlist of OCR-App JSON gateway endpoints. Useful for fast inspection without manual curl calls.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'launcher_status',
    description:
      'Runs scripts/linux/ocr.sh status and returns the launcher-oriented runtime status report.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'run_project_smoke',
    description:
      'Runs one whitelisted npm smoke script from the project root. Use this for focused verification instead of guessing service state.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          enum: Array.from(ALLOWED_SMOKE_SCRIPTS),
        },
      },
      required: ['script'],
    },
  },
  {
    name: 'list_documents',
    description:
      'Lists saved documents from SQLite. Optional query filters by filename substring.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: 'repo_list_files',
    description:
      'Lists project files by glob-like substring filter. Fast inventory tool for navigating the repo.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 400 },
      },
    },
  },
  {
    name: 'repo_search',
    description:
      'Searches text in the repo with ripgrep and returns file/line matches. Best first step before reading code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        glob: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['query'],
    },
  },
  {
    name: 'repo_read_file',
    description:
      'Reads a project file with optional line window. Good for fast code inspection without scanning entire files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        start_line: { type: 'integer', minimum: 1 },
        end_line: { type: 'integer', minimum: 1 },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_document',
    description:
      'Returns one saved document by id, with optional document vocabulary candidates.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        include_candidates: { type: 'boolean' },
        candidate_limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['id'],
    },
  },
  {
    name: 'debug_failed_document',
    description:
      'Collects a compact incident report for one document: document record, candidate summary, linked vocabulary items, health snapshot, and likely issues.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        candidate_limit: { type: 'integer', minimum: 1, maximum: 200 },
        linked_vocabulary_limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_document_candidates',
    description:
      'Searches extracted vocabulary candidates across saved documents by word, normalized form, translation, or context sentence.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_vocabulary',
    description:
      'Lists vocabulary entries. Supports language filters and a free-text query against word, translation, and context.',
    inputSchema: {
      type: 'object',
      properties: {
        target_lang: { type: 'string' },
        native_lang: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: 'get_vocabulary_word',
    description:
      'Looks up a vocabulary item either by id or by exact word text. Supports optional language filters for text lookup.',
    inputSchema: {
      type: 'object',
      properties: {
        vocabulary_id: { type: 'string' },
        word: { type: 'string' },
        target_lang: { type: 'string' },
        native_lang: { type: 'string' },
      },
    },
  },
  {
    name: 'trace_word_lifecycle',
    description:
      'Builds an end-to-end trace for a word across candidate extraction, vocabulary persistence, and practice attempts.',
    inputSchema: {
      type: 'object',
      properties: {
        word: { type: 'string' },
        target_lang: { type: 'string' },
        native_lang: { type: 'string' },
        candidate_limit: { type: 'integer', minimum: 1, maximum: 100 },
        attempt_limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['word'],
    },
  },
  {
    name: 'list_due_vocabulary',
    description:
      'Returns vocabulary items that are due for review now, optionally filtered by language pair.',
    inputSchema: {
      type: 'object',
      properties: {
        target_lang: { type: 'string' },
        native_lang: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: 'get_word_stats',
    description:
      'Returns SRS stats and practice history summary for one vocabulary item. Great for tuning practice difficulty or debugging learning behavior.',
    inputSchema: {
      type: 'object',
      properties: {
        vocabulary_id: { type: 'string' },
      },
      required: ['vocabulary_id'],
    },
  },
  {
    name: 'recent_practice_mistakes',
    description:
      'Returns the latest incorrect practice attempts with prompt, correct answer, and user answer.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: 'list_practice_sessions',
    description:
      'Returns recent practice sessions directly from SQLite, including completion stats and any stored llm_analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: 'tail_perf_log',
    description:
      'Reads the tail of a file from tmp/perf/logs for quick local runtime inspection.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        lines: { type: 'integer', minimum: 1, maximum: 400 },
      },
      required: ['filename'],
    },
  },
  {
    name: 'tail_runtime_log',
    description:
      'Reads the tail of a file from the project logs directory for startup/debugging failures.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        lines: { type: 'integer', minimum: 1, maximum: 400 },
      },
      required: ['filename'],
    },
  },
  {
    name: 'run_frontend_unit_test',
    description:
      'Runs one frontend Vitest spec file. Use for focused UI/unit verification.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_backend_unit_test',
    description:
      'Runs one backend Jest spec file. Use for focused service/controller/domain verification.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_playwright_test',
    description:
      'Runs one Playwright e2e spec file. Use for browser-level integration checks.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'recommend_test_strategy',
    description:
      'Given a project file path, returns the most relevant unit, smoke, and e2e test commands to run next.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_document_context',
    description:
      'Legacy compatibility tool. Returns real saved-document sentences where the given word appears.',
    inputSchema: {
      type: 'object',
      properties: {
        word: { type: 'string' },
      },
      required: ['word'],
    },
  },
];

const server = new Server(
  { name: 'ocr-project', version: '2.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    if (name === 'get_project_health') {
      const gateway = await getGatewayHealthSnapshot();
      const lmStudio = await getLmStudioSnapshot();
      const lms = await getLmsProcessSnapshot();
      return okJson({ gateway, lmStudio, lms });
    }

    if (name === 'project_map') {
      return okJson(buildProjectMap());
    }

    if (name === 'api_map') {
      return okJson(buildApiMap());
    }

    if (name === 'runtime_map') {
      const gateway = await getGatewayHealthSnapshot();
      const lmStudio = await getLmStudioSnapshot();
      const lms = await getLmsProcessSnapshot();
      return okJson(buildRuntimeMap(gateway, lmStudio, lms));
    }

    if (name === 'data_map') {
      return okJson(buildDataMap());
    }

    if (name === 'test_map') {
      return okJson(buildTestMap());
    }

    if (name === 'entrypoint_map') {
      return okJson(buildEntryPointMap());
    }

    if (name === 'project_doctor') {
      const gateway = await getGatewayHealthSnapshot();
      const lmStudio = await getLmStudioSnapshot();
      const lms = await getLmsProcessSnapshot();
      return okJson(buildProjectDoctor(gateway, lmStudio, lms));
    }

    if (name === 'get_gateway_json') {
      const gatewayPath = normalizeGatewayPath(args.path);
      if (!isAllowedGatewayPath(gatewayPath)) {
        return errorText(`Path not allowed for get_gateway_json: ${gatewayPath}`);
      }

      const response = await maybeFetchJson(`${DEFAULT_GATEWAY_URL}${gatewayPath}`);
      return okJson({
        path: gatewayPath,
        ok: response.ok,
        status: response.status,
        body: response.body,
      });
    }

    if (name === 'launcher_status') {
      const result = await runCommandCapture('bash', [OCR_LAUNCHER, 'status'], {
        cwd: ROOT,
        timeout: 60_000,
      });
      return okJson(result);
    }

    if (name === 'run_project_smoke') {
      const script = String(args.script || '');
      if (!ALLOWED_SMOKE_SCRIPTS.has(script)) {
        return errorText(
          `Unsupported smoke script "${script}". Allowed: ${Array.from(ALLOWED_SMOKE_SCRIPTS).join(', ')}`,
        );
      }

      const { stdout, stderr } = await execFileAsync(
        'npm',
        ['run', script],
        { cwd: ROOT, timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
      );

      return okJson({
        script,
        ok: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    }

    if (name === 'repo_list_files') {
      const query = String(args.query || '').trim();
      const limit = normalizeLimit(args.limit, 120, 400);
      const rgArgs = ['--files', ROOT];
      const listed = await runCommandCapture('rg', rgArgs, { cwd: ROOT, timeout: 30_000 });
      if (!listed.ok) {
        return okJson(listed);
      }
      const files = listed.stdout
        .split('\n')
        .filter(Boolean)
        .map((item) => path.relative(ROOT, item))
        .filter((item) => !query || item.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit);
      return okJson(files);
    }

    if (name === 'repo_search') {
      const query = String(args.query || '').trim();
      if (!query) {
        return errorText('query is required');
      }
      const limit = normalizeLimit(args.limit, 80, 200);
      const rgArgs = [
        '-n',
        '-i',
        '--no-heading',
        '--color',
        'never',
        '--max-count',
        String(limit),
      ];
      if (args.glob) {
        rgArgs.push('-g', String(args.glob));
      }
      rgArgs.push(query, ROOT);
      const result = await runCommandCapture('rg', rgArgs, { cwd: ROOT, timeout: 30_000 });
      return okJson(result);
    }

    if (name === 'repo_read_file') {
      const filePath = ensureProjectRelativeFile(args.path);
      const startLine = Math.max(1, Number.parseInt(String(args.start_line || 1), 10) || 1);
      const requestedEnd = Number.parseInt(String(args.end_line || startLine + 199), 10);
      const endLine = Math.max(startLine, Math.min(requestedEnd, startLine + 399));
      const result = await runCommandCapture(
        'sed',
        ['-n', `${startLine},${endLine}p`, filePath],
        { cwd: ROOT, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 },
      );
      return okJson({
        path: path.relative(ROOT, filePath),
        start_line: startLine,
        end_line: endLine,
        ...result,
      });
    }

    if (name === 'list_documents') {
      const query = String(args.query || '').trim().toLowerCase();
      const like = query ? normalizeLike(query) : '';
      const rows = stmts.listDocuments.all(query, like, normalizeLimit(args.limit, 20));
      return okJson(rows);
    }

    if (name === 'get_document') {
      const id = String(args.id || '').trim();
      const document = stmts.getDocument.get(id);
      if (!document) {
        return errorText(`Document not found: ${id}`);
      }

      const includeCandidates = Boolean(args.include_candidates);
      if (!includeCandidates) {
        return okJson(document);
      }

      const candidates = stmts.getDocumentCandidates.all(
        id,
        normalizeLimit(args.candidate_limit, 50, 200),
      );
      return okJson({ ...document, candidates });
    }

    if (name === 'debug_failed_document') {
      const id = String(args.id || '').trim();
      const document = stmts.getDocument.get(id);
      if (!document) {
        return errorText(`Document not found: ${id}`);
      }

      const candidates = stmts.getDocumentCandidates.all(
        id,
        normalizeLimit(args.candidate_limit, 50, 200),
      );
      const linkedVocabulary = stmts.getVocabularyWordsBySourceDocument.all(
        id,
        normalizeLimit(args.linked_vocabulary_limit, 50, 200),
      );
      const gateway = await getGatewayHealthSnapshot();
      const lmStudio = await getLmStudioSnapshot();

      const issues = [];
      const notes = [];

      if (document.analysis_status && document.analysis_status !== 'idle') {
        notes.push(`Document analysis_status is ${document.analysis_status}.`);
      }

      if (document.analysis_error) {
        issues.push(`Document has analysis_error: ${document.analysis_error}`);
      }

      if (!document.markdown && !document.rich_text_html) {
        issues.push('Document has no markdown or rich_text_html content.');
      }

      if (candidates.length === 0) {
        issues.push('No document_vocab_candidates found for this document.');
      }

      if (linkedVocabulary.length === 0) {
        notes.push('No vocabulary items currently linked to this document via source_document_id.');
      }

      if (!gateway.reachable) {
        issues.push('Gateway /api/health is unreachable during document debugging.');
      } else if (gateway.data?.lmStudioReachable === false) {
        issues.push('Gateway reports LM Studio is unreachable.');
      }

      if (!lmStudio.reachable) {
        issues.push('LM Studio /v1/models is unreachable.');
      }

      return okJson({
        summary: {
          id: document.id,
          filename: document.filename,
          analysis_status: document.analysis_status,
          candidate_count: candidates.length,
          linked_vocabulary_count: linkedVocabulary.length,
        },
        issues,
        notes,
        document,
        candidate_preview: candidates,
        linked_vocabulary_preview: linkedVocabulary,
      });
    }

    if (name === 'search_document_candidates') {
      const query = String(args.query || '').trim().toLowerCase();
      if (!query) {
        return errorText('query is required');
      }
      const like = normalizeLike(query);
      const rows = stmts.searchDocumentCandidates.all(
        like,
        like,
        like,
        like,
        normalizeLimit(args.limit, 20),
      );
      return okJson(rows);
    }

    if (name === 'list_vocabulary') {
      const targetLang = args.target_lang ? String(args.target_lang).trim() : null;
      const nativeLang = args.native_lang ? String(args.native_lang).trim() : null;
      const query = String(args.query || '').trim().toLowerCase();
      const like = query ? normalizeLike(query) : '';
      const rows = stmts.listVocabulary.all(
        targetLang,
        targetLang,
        nativeLang,
        nativeLang,
        query,
        like,
        like,
        like,
        normalizeLimit(args.limit, 30),
      );
      return okJson(rows);
    }

    if (name === 'get_vocabulary_word') {
      const vocabularyId = String(args.vocabulary_id || '').trim();
      if (vocabularyId) {
        const row = stmts.getVocabularyWordById.get(vocabularyId);
        return row ? okJson(row) : errorText(`Vocabulary item not found: ${vocabularyId}`);
      }

      const word = String(args.word || '').trim();
      if (!word) {
        return errorText('vocabulary_id or word is required');
      }

      const targetLang = args.target_lang ? String(args.target_lang).trim() : null;
      const nativeLang = args.native_lang ? String(args.native_lang).trim() : null;
      const row = stmts.getVocabularyWordByText.get(
        word,
        targetLang,
        targetLang,
        nativeLang,
        nativeLang,
      );
      return row ? okJson(row) : errorText(`Vocabulary word not found: ${word}`);
    }

    if (name === 'trace_word_lifecycle') {
      const word = String(args.word || '').trim();
      if (!word) {
        return errorText('word is required');
      }

      const targetLang = args.target_lang ? String(args.target_lang).trim() : null;
      const nativeLang = args.native_lang ? String(args.native_lang).trim() : null;
      const candidates = stmts.getCandidateByWord.all(
        word,
        word,
        word,
        normalizeLimit(args.candidate_limit, 20),
      );
      const vocabularyItems = stmts.getVocabularyWordsByText.all(
        word,
        targetLang,
        targetLang,
        nativeLang,
        nativeLang,
        normalizeLimit(args.candidate_limit, 20),
      );

      const attempts = vocabularyItems.map((item) => ({
        vocabulary_id: item.id,
        word: item.word,
        attempts: stmts.getPracticeAttemptsForWord.all(
          item.id,
          normalizeLimit(args.attempt_limit, 20),
        ),
      }));

      const linkedDocuments = [];
      const seenDocumentIds = new Set();
      for (const candidate of candidates) {
        if (!seenDocumentIds.has(candidate.document_id)) {
          linkedDocuments.push({
            document_id: candidate.document_id,
            filename: candidate.filename,
            created_at: candidate.document_created_at,
          });
          seenDocumentIds.add(candidate.document_id);
        }
      }
      for (const item of vocabularyItems) {
        if (item.source_document_id && !seenDocumentIds.has(item.source_document_id)) {
          const document = stmts.getDocument.get(item.source_document_id);
          linkedDocuments.push({
            document_id: item.source_document_id,
            filename: document?.filename || null,
            created_at: document?.created_at || null,
          });
          seenDocumentIds.add(item.source_document_id);
        }
      }

      const stageSummary = {
        candidate_hits: candidates.length,
        vocabulary_hits: vocabularyItems.length,
        practiced_vocabulary_items: attempts.filter((item) => item.attempts.length > 0).length,
      };

      return okJson({
        word,
        target_lang: targetLang,
        native_lang: nativeLang,
        summary: stageSummary,
        candidates,
        vocabulary_items: vocabularyItems,
        linked_documents: linkedDocuments,
        practice_attempts: attempts,
      });
    }

    if (name === 'list_due_vocabulary') {
      const targetLang = args.target_lang ? String(args.target_lang).trim() : null;
      const nativeLang = args.native_lang ? String(args.native_lang).trim() : null;
      const rows = stmts.listDueVocabulary.all(
        targetLang,
        targetLang,
        nativeLang,
        nativeLang,
        normalizeLimit(args.limit, 20),
      );
      return okJson(rows);
    }

    if (name === 'get_word_stats') {
      const vocabularyId = String(args.vocabulary_id || '').trim();
      const row = stmts.wordStats.get(vocabularyId);
      if (!row) {
        return errorText(`Word not found: ${vocabularyId}`);
      }
      return okJson(row);
    }

    if (name === 'recent_practice_mistakes') {
      const rows = stmts.recentPracticeMistakes.all(normalizeLimit(args.limit, 20));
      return okJson(rows);
    }

    if (name === 'list_practice_sessions') {
      const rows = stmts.listPracticeSessions.all(normalizeLimit(args.limit, 20));
      return okJson(rows);
    }

    if (name === 'tail_perf_log') {
      const filePath = resolvePerfLogFile(args.filename);
      const lineCount = normalizeLimit(args.lines, 80, 400);
      const { stdout } = await execFileAsync(
        'tail',
        ['-n', String(lineCount), filePath],
        { cwd: ROOT, timeout: 15000, maxBuffer: 1024 * 1024 },
      );
      return okJson({
        filename: path.basename(filePath),
        lines: lineCount,
        output: stdout,
      });
    }

    if (name === 'tail_runtime_log') {
      const filePath = resolveRuntimeLogFile(args.filename);
      const lineCount = normalizeLimit(args.lines, 80, 400);
      const { stdout } = await execFileAsync(
        'tail',
        ['-n', String(lineCount), filePath],
        { cwd: ROOT, timeout: 15_000, maxBuffer: 1024 * 1024 },
      );
      return okJson({
        filename: path.basename(filePath),
        lines: lineCount,
        output: stdout,
      });
    }

    if (name === 'run_frontend_unit_test') {
      const filePath = ensureProjectRelativeFile(args.path);
      ensureSupportedTestFile(filePath, [
        /^.*\/frontend\/.*\.(spec|test)\.(ts|tsx)$/,
      ]);
      const relative = path.relative(ROOT, filePath);
      const result = await runCommandCapture(
        'npm',
        ['run', 'test', '--workspace=frontend', '--', relative],
        { cwd: ROOT, timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
      );
      return okJson({ path: relative, ...result });
    }

    if (name === 'run_backend_unit_test') {
      const filePath = ensureProjectRelativeFile(args.path);
      ensureSupportedTestFile(filePath, [
        /^.*\/backend\/.*\.(spec|test)\.ts$/,
      ]);
      const relative = path.relative(ROOT, filePath);
      const result = await runCommandCapture(
        'npm',
        ['run', 'test', '--workspace=./backend', '--', '--runInBand', relative],
        { cwd: ROOT, timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
      );
      return okJson({ path: relative, ...result });
    }

    if (name === 'run_playwright_test') {
      const filePath = ensureProjectRelativeFile(args.path);
      ensureSupportedTestFile(filePath, [
        /^.*\/e2e\/.*\.(spec|test)\.(ts|tsx|js|mjs)$/,
      ]);
      const relative = path.relative(ROOT, filePath);
      const result = await runCommandCapture(
        'npx',
        ['playwright', 'test', relative, '--workers=1'],
        { cwd: ROOT, timeout: 20 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
      );
      return okJson({ path: relative, ...result });
    }

    if (name === 'recommend_test_strategy') {
      const filePath = ensureProjectRelativeFile(args.path);
      const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');
      const recommendations = [];

      if (relative.startsWith('frontend/')) {
        recommendations.push('Primary: run_frontend_unit_test on the nearest *.spec.tsx/*.spec.ts file.');
        recommendations.push('Fallback: npm run test:frontend');
        recommendations.push('If UI flow changed: npm run test:e2e:browser or run_playwright_test on the relevant e2e spec.');
      } else if (relative.startsWith('backend/gateway/')) {
        recommendations.push('Primary: run_backend_unit_test on the matching gateway *.spec.ts file.');
        recommendations.push('API confidence: npm run test:e2e:api');
        recommendations.push('Runtime smoke: run_project_smoke with smoke:ocr or smoke:lmstudio depending on the path.');
      } else if (relative.startsWith('backend/src/infrastructure/lm-studio/')) {
        recommendations.push('Primary: run_backend_unit_test on the matching lm-studio *.spec.ts file.');
        recommendations.push('Integration confidence: npm run test:e2e:integration');
        recommendations.push('Runtime smoke: run_project_smoke with smoke:lmstudio.');
      } else if (relative.startsWith('services/tts/')) {
        recommendations.push('Primary: run_project_smoke with smoke:supertone or smoke:kokoro depending on the service.');
        recommendations.push('API confidence: inspect /api/health and, if needed, run browser e2e for TTS flows.');
      } else if (relative.startsWith('services/nlp/')) {
        recommendations.push('Primary: run_project_smoke with smoke:stanza or smoke:bert.');
        recommendations.push('Then verify affected document/vocabulary flows via get_gateway_json or debug_failed_document.');
      } else if (relative.startsWith('e2e/')) {
        recommendations.push('Primary: run_playwright_test on this spec.');
        recommendations.push('If stack orchestration changed: npm run test:e2e:launcher.');
      } else {
        recommendations.push('Primary: choose the nearest unit spec and run a focused unit test first.');
        recommendations.push('Then add one smoke or e2e check that matches the user-facing behavior you touched.');
      }

      return okJson({
        path: relative,
        recommendations,
      });
    }

    if (name === 'get_document_context') {
      const word = String(args.word || '').trim();
      if (!word) {
        return errorText('word is required');
      }
      const rows = stmts.documentContextLegacy.all(word, word);
      return okJson(rows);
    }

    return errorText(`Unknown tool: ${name}`);
  } catch (error) {
    return errorText(`Error in ${name}: ${error.message}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`MCP server error: ${error.message}\n`);
  process.exit(1);
});
