#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const Database = require('better-sqlite3');
const { z } = require('zod');
const { McpServer, ResourceTemplate } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '..');
const ROOT_PACKAGE_JSON = path.join(ROOT, 'package.json');
const ROOT_PACKAGE = JSON.parse(fs.readFileSync(ROOT_PACKAGE_JSON, 'utf8'));

const GATEWAY_URL = (process.env.OCR_APP_GATEWAY_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const GATEWAY_HEALTH_URL = `${GATEWAY_URL}/api/health`;
const LM_STUDIO_MODELS_URL = process.env.OCR_APP_LM_STUDIO_MODELS_URL || 'http://127.0.0.1:1234/v1/models';

const DOCUMENTS_DB_PATH = resolveProjectPath(
  process.env.DOCUMENTS_SQLITE_DB_PATH || 'data/documents.sqlite',
);
const VOCABULARY_DB_PATH = resolveProjectPath(
  process.env.VOCABULARY_SQLITE_DB_PATH || 'data/vocabulary.sqlite',
);
const LEGACY_DB_PATH = resolveProjectPath(
  process.env.SQLITE_DB_PATH || 'data/ocr-app.db',
);
const LOGS_DIR = path.join(ROOT, 'logs');
const TEST_RESULTS_DIR = path.join(ROOT, 'test-results');
const PERF_LOGS_DIR = path.join(ROOT, 'tmp', 'perf', 'logs');
const E2E_LOGS_DIR = path.join(ROOT, 'tmp', 'e2e-logs');
const OCR_LAUNCHER_PATH = path.join(ROOT, 'scripts', 'linux', 'ocr.sh');

const dbCache = new Map();

const DATABASES = {
  documents: {
    key: 'documents',
    path: DOCUMENTS_DB_PATH,
    description: 'Saved documents and vocabulary extraction candidates.',
  },
  vocabulary: {
    key: 'vocabulary',
    path: VOCABULARY_DB_PATH,
    description: 'Vocabulary, SRS queue, practice sessions, and exercise attempts.',
  },
  legacy: {
    key: 'legacy',
    path: LEGACY_DB_PATH,
    description: 'Legacy combined SQLite runtime database used by older app flows.',
  },
};

const listLimitSchema = z.coerce.number().int().min(1).max(200).default(20);
const tailLinesSchema = z.coerce.number().int().min(1).max(1000).default(200);
const gatewayPathSchema = z.string().trim().min(1).max(300);

function resolveProjectPath(relativePath) {
  return path.resolve(ROOT, String(relativePath));
}

function getDb(databaseKey) {
  const database = DATABASES[databaseKey];
  if (!database) {
    throw new Error(`Unknown database: ${databaseKey}`);
  }

  if (!fs.existsSync(database.path)) {
    throw new Error(`Database file not found: ${path.relative(ROOT, database.path)}`);
  }

  if (!dbCache.has(databaseKey)) {
    dbCache.set(databaseKey, new Database(database.path, { readonly: true, fileMustExist: true }));
  }

  return dbCache.get(databaseKey);
}

function closeAllDbs() {
  for (const db of dbCache.values()) {
    try {
      db.close();
    } catch (_) {
      // Ignore close errors during process shutdown.
    }
  }
  dbCache.clear();
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function toolJson(value) {
  return {
    content: [{ type: 'text', text: jsonText(value) }],
    structuredContent: value,
  };
}

function textResource(uri, text, mimeType = 'text/plain') {
  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType,
        text,
      },
    ],
  };
}

function jsonResource(uri, value) {
  return textResource(uri, jsonText(value), 'application/json');
}

function fileExistsStats(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      relative_path: path.relative(ROOT, filePath).replace(/\\/g, '/'),
    };
  }

  const stat = fs.statSync(filePath);
  return {
    exists: true,
    relative_path: path.relative(ROOT, filePath).replace(/\\/g, '/'),
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
  };
}

function queryOne(db, sql, params = []) {
  return db.prepare(sql).get(...params);
}

function queryAll(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}

function trimMarkdown(markdown, maxChars = 2500) {
  const text = String(markdown || '');
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n...`;
}

function normalizeLike(query) {
  return `%${String(query).trim().toLowerCase()}%`;
}

function relativeProjectPath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function ensurePathInside(baseDir, requestedPath) {
  const relative = String(requestedPath || '').trim();
  if (!relative) {
    throw new Error('Path is required.');
  }

  const resolved = path.resolve(baseDir, relative);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error('Path must stay inside the allowed directory.');
  }

  return resolved;
}

function ensureSafeFilename(filename) {
  const value = String(filename || '').trim();
  if (!value) {
    throw new Error('filename is required');
  }

  if (
    value.includes('/') ||
    value.includes('\\') ||
    value === '.' ||
    value === '..' ||
    value.includes('..')
  ) {
    throw new Error('filename must be a plain file name without path segments');
  }

  if (path.basename(value) !== value) {
    throw new Error('filename must be a plain file name without path segments');
  }

  return value;
}

function tailTextFile(filePath, lineCount) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${relativeProjectPath(filePath)}`);
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  return lines.slice(-lineCount).join('\n');
}

function listFiles(dirPath, { maxDepth = 1, includeDirectories = false } = {}) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const results = [];

  function walk(currentDir, depth) {
    if (depth > maxDepth) {
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relative = relativeProjectPath(fullPath);
      if (entry.isDirectory()) {
        if (includeDirectories) {
          results.push({
            path: relative,
            type: 'directory',
            modified_at: fs.statSync(fullPath).mtime.toISOString(),
          });
        }
        walk(fullPath, depth + 1);
        continue;
      }

      const stat = fs.statSync(fullPath);
      results.push({
        path: relative,
        type: 'file',
        size_bytes: stat.size,
        modified_at: stat.mtime.toISOString(),
      });
    }
  }

  walk(dirPath, 0);
  return results;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(4_000),
  });

  const rawText = await response.text();
  let json = null;

  if (rawText.trim()) {
    try {
      json = JSON.parse(rawText);
    } catch (_) {
      json = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    url,
    json,
    rawText,
  };
}

function normalizeGatewayPath(requestedPath) {
  const value = String(requestedPath || '').trim();
  if (!value.startsWith('/api/')) {
    throw new Error('path must start with /api/');
  }
  return value;
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

function checkTcpPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;

    const finalize = (result) => {
      if (finished) {
        return;
      }
      finished = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize({ reachable: true }));
    socket.once('timeout', () => finalize({ reachable: false, error: 'timeout' }));
    socket.once('error', (error) => finalize({ reachable: false, error: error.message }));
    socket.connect(port, host);
  });
}

function readDocuments(limit, query) {
  const db = getDb('documents');
  const parsedLimit = listLimitSchema.parse(limit);

  const rows = query && String(query).trim()
    ? queryAll(
        db,
        `SELECT id, filename, analysis_status, analysis_error, analysis_updated_at,
                created_at, updated_at, markdown, rich_text_html
         FROM saved_documents
         WHERE lower(filename) LIKE ? OR lower(markdown) LIKE ?
         ORDER BY updated_at DESC
         LIMIT ?`,
        [normalizeLike(query), normalizeLike(query), parsedLimit],
      )
    : queryAll(
        db,
        `SELECT id, filename, analysis_status, analysis_error, analysis_updated_at,
                created_at, updated_at, markdown, rich_text_html
         FROM saved_documents
         ORDER BY updated_at DESC
         LIMIT ?`,
        [parsedLimit],
      );

  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    analysis_status: row.analysis_status,
    analysis_error: row.analysis_error,
    analysis_updated_at: row.analysis_updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    markdown_preview: trimMarkdown(row.markdown, 700),
    rich_text_html_present: Boolean(row.rich_text_html),
  }));
}

function readDocumentById(id, candidateLimit = 50) {
  const db = getDb('documents');
  const document = queryOne(
    db,
    `SELECT id, markdown, rich_text_html, filename, created_at, updated_at,
            analysis_status, analysis_error, analysis_updated_at
     FROM saved_documents
     WHERE id = ?`,
    [id],
  );

  if (!document) {
    throw new Error(`Saved document not found: ${id}`);
  }

  const candidates = queryAll(
    db,
    `SELECT id, document_id, surface, normalized, lemma, vocab_type, pos, translation,
            context_sentence, sentence_index, start_offset, end_offset,
            selected_by_default, is_duplicate, review_source
     FROM document_vocab_candidates
     WHERE document_id = ?
     ORDER BY sentence_index ASC, start_offset ASC, normalized ASC
     LIMIT ?`,
    [id, listLimitSchema.parse(candidateLimit)],
  ).map((row) => ({
    ...row,
    selected_by_default: Boolean(row.selected_by_default),
    is_duplicate: Boolean(row.is_duplicate),
  }));

  return {
    ...document,
    candidate_count: queryOne(
      db,
      'SELECT COUNT(*) AS count FROM document_vocab_candidates WHERE document_id = ?',
      [id],
    ).count,
    candidates,
  };
}

function searchVocabulary({ query, target_lang, native_lang, limit }) {
  const db = getDb('vocabulary');
  const parsedLimit = listLimitSchema.parse(limit);
  const params = [];
  let whereClause = `
    WHERE (
      lower(word) LIKE ?
      OR lower(translation) LIKE ?
      OR lower(context_sentence) LIKE ?
    )
  `;

  const like = normalizeLike(query);
  params.push(like, like, like);

  if (target_lang) {
    whereClause += ' AND target_lang = ?';
    params.push(target_lang);
  }

  if (native_lang) {
    whereClause += ' AND native_lang = ?';
    params.push(native_lang);
  }

  params.push(parsedLimit);

  return queryAll(
    db,
    `SELECT id, word, vocab_type, pos, translation, target_lang, native_lang,
            context_sentence, source_document_id, created_at, updated_at,
            interval_days, easiness_factor, repetitions, next_review_at
     FROM vocabulary
     ${whereClause}
     ORDER BY updated_at DESC
     LIMIT ?`,
    params,
  );
}

function readDueVocabulary({ limit, target_lang, native_lang }) {
  const db = getDb('vocabulary');
  const parsedLimit = listLimitSchema.parse(limit);
  const now = new Date().toISOString();
  const params = [now];
  let whereClause = 'WHERE next_review_at <= ?';

  if (target_lang) {
    whereClause += ' AND target_lang = ?';
    params.push(target_lang);
  }

  if (native_lang) {
    whereClause += ' AND native_lang = ?';
    params.push(native_lang);
  }

  params.push(parsedLimit);

  return queryAll(
    db,
    `SELECT id, word, vocab_type, pos, translation, target_lang, native_lang,
            context_sentence, source_document_id, created_at, updated_at,
            interval_days, easiness_factor, repetitions, next_review_at
     FROM vocabulary
     ${whereClause}
     ORDER BY next_review_at ASC
     LIMIT ?`,
    params,
  );
}

function readPracticeSessions(limit) {
  const db = getDb('vocabulary');
  const parsedLimit = listLimitSchema.parse(limit);
  const sessions = queryAll(
    db,
    `SELECT id, started_at, completed_at, target_lang, native_lang,
            total_exercises, correct_count, llm_analysis
     FROM practice_sessions
     ORDER BY started_at DESC
     LIMIT ?`,
    [parsedLimit],
  );

  const attemptCounts = queryAll(
    db,
    `SELECT session_id, COUNT(*) AS attempts
     FROM exercise_attempts
     GROUP BY session_id`,
  );
  const attemptCountBySessionId = new Map(
    attemptCounts.map((row) => [row.session_id, row.attempts]),
  );

  return sessions.map((session) => ({
    ...session,
    attempts: attemptCountBySessionId.get(session.id) || 0,
    accuracy:
      session.total_exercises > 0
        ? Number((session.correct_count / session.total_exercises).toFixed(4))
        : null,
  }));
}

function readWordStats(vocabularyId) {
  const db = getDb('vocabulary');
  const vocabulary = queryOne(
    db,
    `SELECT id, word, vocab_type, pos, translation, target_lang, native_lang,
            context_sentence, source_document_id, created_at, updated_at,
            interval_days, easiness_factor, repetitions, next_review_at
     FROM vocabulary
     WHERE id = ?`,
    [vocabularyId],
  );

  if (!vocabulary) {
    throw new Error(`Vocabulary item not found: ${vocabularyId}`);
  }

  const attempts = queryAll(
    db,
    `SELECT id, session_id, vocabulary_id, exercise_type, prompt, correct_answer,
            user_answer, is_correct, error_position, quality_rating,
            mnemonic_sentence, created_at
     FROM exercise_attempts
     WHERE vocabulary_id = ?
     ORDER BY created_at DESC`,
    [vocabularyId],
  ).map((row) => ({
    ...row,
    is_correct: Boolean(row.is_correct),
  }));

  const stats = queryOne(
    db,
    `SELECT COUNT(*) AS attempt_count,
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
            SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS incorrect_count,
            MAX(created_at) AS last_attempt_at
     FROM exercise_attempts
     WHERE vocabulary_id = ?`,
    [vocabularyId],
  );

  return {
    vocabulary,
    stats: {
      attempt_count: stats.attempt_count || 0,
      correct_count: stats.correct_count || 0,
      incorrect_count: stats.incorrect_count || 0,
      last_attempt_at: stats.last_attempt_at || null,
      accuracy:
        stats.attempt_count > 0
          ? Number(((stats.correct_count || 0) / stats.attempt_count).toFixed(4))
          : null,
    },
    attempts,
  };
}

function readRecentPracticeMistakes(limit) {
  const db = getDb('vocabulary');
  return queryAll(
    db,
    `SELECT ea.id, ea.session_id, ea.vocabulary_id, ea.exercise_type, ea.prompt,
            ea.correct_answer, ea.user_answer, ea.error_position, ea.quality_rating,
            ea.mnemonic_sentence, ea.created_at,
            v.word, v.translation, v.target_lang, v.native_lang
     FROM exercise_attempts ea
     JOIN vocabulary v ON v.id = ea.vocabulary_id
     WHERE ea.is_correct = 0
     ORDER BY ea.created_at DESC
     LIMIT ?`,
    [listLimitSchema.parse(limit)],
  );
}

function findVocabularyByWord({ word, target_lang, native_lang, limit }) {
  const db = getDb('vocabulary');
  const parsedLimit = listLimitSchema.parse(limit);
  const params = [String(word).trim().toLowerCase()];
  let whereClause = 'WHERE lower(word) = ?';

  if (target_lang) {
    whereClause += ' AND target_lang = ?';
    params.push(target_lang);
  }

  if (native_lang) {
    whereClause += ' AND native_lang = ?';
    params.push(native_lang);
  }

  params.push(parsedLimit);

  return queryAll(
    db,
    `SELECT id, word, vocab_type, pos, translation, target_lang, native_lang,
            context_sentence, source_document_id, created_at, updated_at,
            interval_days, easiness_factor, repetitions, next_review_at
     FROM vocabulary
     ${whereClause}
     ORDER BY updated_at DESC
     LIMIT ?`,
    params,
  );
}

function findDocumentCandidatesByWord({ word, limit }) {
  const db = getDb('documents');
  const like = normalizeLike(word);

  return queryAll(
    db,
    `SELECT dvc.id, dvc.document_id, dvc.surface, dvc.normalized, dvc.lemma,
            dvc.vocab_type, dvc.pos, dvc.translation, dvc.context_sentence,
            dvc.sentence_index, dvc.start_offset, dvc.end_offset,
            dvc.selected_by_default, dvc.is_duplicate, dvc.review_source,
            sd.filename, sd.analysis_status, sd.updated_at AS document_updated_at
     FROM document_vocab_candidates dvc
     JOIN saved_documents sd ON sd.id = dvc.document_id
     WHERE lower(dvc.surface) LIKE ?
        OR lower(dvc.normalized) LIKE ?
        OR lower(dvc.lemma) LIKE ?
     ORDER BY sd.updated_at DESC, dvc.sentence_index ASC, dvc.start_offset ASC
     LIMIT ?`,
    [like, like, like, listLimitSchema.parse(limit)],
  ).map((row) => ({
    ...row,
    selected_by_default: Boolean(row.selected_by_default),
    is_duplicate: Boolean(row.is_duplicate),
  }));
}

async function getGatewayJson(pathValue) {
  const normalizedPath = normalizeGatewayPath(pathValue);
  if (!isAllowedGatewayPath(normalizedPath)) {
    throw new Error('path is outside the allowed gateway read-only allowlist');
  }

  const url = `${GATEWAY_URL}${normalizedPath}`;
  const response = await fetchJson(url).catch((error) => ({
    ok: false,
    status: null,
    url,
    json: null,
    rawText: '',
    error: error.message,
  }));

  return {
    path: normalizedPath,
    url,
    ok: response.ok,
    status: response.status,
    json: response.json,
    raw_text: response.json ? null : response.rawText || null,
    error: response.error || null,
  };
}

async function debugFailedDocument(documentId, candidateLimit = 20, linkedVocabularyLimit = 20) {
  const documentsDb = getDb('documents');
  const vocabularyDb = getDb('vocabulary');
  const document = queryOne(
    documentsDb,
    `SELECT id, markdown, rich_text_html, filename, created_at, updated_at,
            analysis_status, analysis_error, analysis_updated_at
     FROM saved_documents
     WHERE id = ?`,
    [documentId],
  );

  if (!document) {
    throw new Error(`Saved document not found: ${documentId}`);
  }

  const candidateCount = queryOne(
    documentsDb,
    'SELECT COUNT(*) AS count FROM document_vocab_candidates WHERE document_id = ?',
    [documentId],
  ).count;

  const candidates = queryAll(
    documentsDb,
    `SELECT id, surface, normalized, lemma, vocab_type, pos, translation,
            context_sentence, sentence_index, start_offset, end_offset,
            selected_by_default, is_duplicate, review_source
     FROM document_vocab_candidates
     WHERE document_id = ?
     ORDER BY sentence_index ASC, start_offset ASC, normalized ASC
     LIMIT ?`,
    [documentId, listLimitSchema.parse(candidateLimit)],
  ).map((row) => ({
    ...row,
    selected_by_default: Boolean(row.selected_by_default),
    is_duplicate: Boolean(row.is_duplicate),
  }));

  const candidateBreakdown = {
    by_vocab_type: queryAll(
      documentsDb,
      `SELECT vocab_type, COUNT(*) AS count
       FROM document_vocab_candidates
       WHERE document_id = ?
       GROUP BY vocab_type
       ORDER BY count DESC, vocab_type ASC`,
      [documentId],
    ),
    by_review_source: queryAll(
      documentsDb,
      `SELECT review_source, COUNT(*) AS count
       FROM document_vocab_candidates
       WHERE document_id = ?
       GROUP BY review_source
       ORDER BY count DESC, review_source ASC`,
      [documentId],
    ),
  };

  const linkedVocabularyCount = queryOne(
    vocabularyDb,
    'SELECT COUNT(*) AS count FROM vocabulary WHERE source_document_id = ?',
    [documentId],
  ).count;

  const linkedVocabulary = queryAll(
    vocabularyDb,
    `SELECT id, word, vocab_type, pos, translation, target_lang, native_lang,
            context_sentence, created_at, updated_at, repetitions, next_review_at
     FROM vocabulary
     WHERE source_document_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
    [documentId, listLimitSchema.parse(linkedVocabularyLimit)],
  );

  const health = await readProjectHealth();
  const issues = [];

  if (document.analysis_error) {
    issues.push(`Document analysis_error is set: ${document.analysis_error}`);
  }
  if (document.analysis_status !== 'idle') {
    issues.push(`Document analysis_status is ${document.analysis_status}.`);
  }
  if (candidateCount === 0) {
    issues.push('No document_vocab_candidates found for this document.');
  }
  if (candidateCount === 0 && linkedVocabularyCount === 0) {
    issues.push('No extracted candidates and no linked vocabulary found. Prepare/confirm flow may not have run yet.');
  }
  if (candidateCount === 0 && linkedVocabularyCount > 0) {
    issues.push('Vocabulary items reference this document, but document_vocab_candidates are absent in documents.sqlite.');
  }
  if (!health.gateway.reachable) {
    issues.push('Gateway /api/health is currently unreachable.');
  }

  return {
    document: {
      id: document.id,
      filename: document.filename,
      created_at: document.created_at,
      updated_at: document.updated_at,
      analysis_status: document.analysis_status,
      analysis_error: document.analysis_error,
      analysis_updated_at: document.analysis_updated_at,
      rich_text_html_present: Boolean(document.rich_text_html),
      markdown_preview: trimMarkdown(document.markdown, 1200),
    },
    candidate_summary: {
      count: candidateCount,
      breakdown: candidateBreakdown,
      samples: candidates,
    },
    linked_vocabulary: {
      count: linkedVocabularyCount,
      samples: linkedVocabulary,
    },
    health_snapshot: health,
    likely_issues: issues,
  };
}

function traceWordLifecycle({
  word,
  target_lang,
  native_lang,
  attempt_limit = 20,
  candidate_limit = 20,
}) {
  const documentsDb = getDb('documents');
  const vocabularyDb = getDb('vocabulary');

  const vocabularyMatches = findVocabularyByWord({
    word,
    target_lang,
    native_lang,
    limit: 50,
  });

  const attemptsByVocabulary = new Map();
  const sourceDocumentsById = new Map();

  for (const vocab of vocabularyMatches) {
    const attempts = queryAll(
      vocabularyDb,
      `SELECT id, session_id, vocabulary_id, exercise_type, prompt, correct_answer,
              user_answer, is_correct, error_position, quality_rating,
              mnemonic_sentence, created_at
       FROM exercise_attempts
       WHERE vocabulary_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [vocab.id, listLimitSchema.parse(attempt_limit)],
    ).map((row) => ({
      ...row,
      is_correct: Boolean(row.is_correct),
    }));
    attemptsByVocabulary.set(vocab.id, attempts);

    if (vocab.source_document_id && !sourceDocumentsById.has(vocab.source_document_id)) {
      sourceDocumentsById.set(
        vocab.source_document_id,
        queryOne(
          documentsDb,
          `SELECT id, filename, analysis_status, analysis_error, analysis_updated_at, updated_at
           FROM saved_documents
           WHERE id = ?`,
          [vocab.source_document_id],
        ) || null,
      );
    }
  }

  const candidateMatches = findDocumentCandidatesByWord({
    word,
    limit: candidate_limit,
  });

  const lifecycle = vocabularyMatches.map((vocab) => {
    const attempts = attemptsByVocabulary.get(vocab.id) || [];
    const stats = queryOne(
      vocabularyDb,
      `SELECT COUNT(*) AS attempt_count,
              SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS incorrect_count,
              MAX(created_at) AS last_attempt_at
       FROM exercise_attempts
       WHERE vocabulary_id = ?`,
      [vocab.id],
    );

    return {
      vocabulary: vocab,
      source_document: vocab.source_document_id
        ? sourceDocumentsById.get(vocab.source_document_id) || null
        : null,
      practice: {
        attempt_count: stats.attempt_count || 0,
        incorrect_count: stats.incorrect_count || 0,
        last_attempt_at: stats.last_attempt_at || null,
        latest_attempts: attempts,
      },
    };
  });

  const issues = [];
  if (vocabularyMatches.length === 0) {
    issues.push('No vocabulary entries matched this word.');
  }
  if (candidateMatches.length === 0) {
    issues.push('No document_vocab_candidates matched this word in documents.sqlite.');
  }
  for (const item of lifecycle) {
    if (item.vocabulary.source_document_id && !item.source_document) {
      issues.push(
        `Vocabulary ${item.vocabulary.id} references missing saved document ${item.vocabulary.source_document_id}.`,
      );
    }
  }

  return {
    query: {
      word,
      target_lang: target_lang || null,
      native_lang: native_lang || null,
    },
    vocabulary_matches: lifecycle,
    candidate_matches: candidateMatches,
    issues,
  };
}

function readDatabaseOverview(databaseKey) {
  const database = databaseKey ? DATABASES[databaseKey] : null;
  if (databaseKey && !database) {
    throw new Error(`database must be one of: ${Object.keys(DATABASES).join(', ')}`);
  }

  const selected = database ? [database] : Object.values(DATABASES);

  return selected.map((item) => {
    const db = getDb(item.key);
    const tables = queryAll(
      db,
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
       ORDER BY name`,
    ).map((row) => row.name);

    return {
      key: item.key,
      path: relativeProjectPath(item.path),
      description: item.description,
      tables: tables.map((tableName) => ({
        name: tableName,
        columns: queryAll(db, `PRAGMA table_info(${tableName})`).map((column) => ({
          name: column.name,
          type: column.type,
          notnull: Boolean(column.notnull),
          pk: Boolean(column.pk),
        })),
      })),
    };
  });
}

function readProjectOverview() {
  const documentsDb = getDb('documents');
  const vocabularyDb = getDb('vocabulary');

  return {
    project: {
      name: ROOT_PACKAGE.name,
      version: ROOT_PACKAGE.version,
      root: ROOT,
    },
    databases: Object.values(DATABASES).map((database) => ({
      key: database.key,
      description: database.description,
      ...fileExistsStats(database.path),
    })),
    counts: {
      saved_documents: queryOne(documentsDb, 'SELECT COUNT(*) AS count FROM saved_documents').count,
      document_vocab_candidates: queryOne(
        documentsDb,
        'SELECT COUNT(*) AS count FROM document_vocab_candidates',
      ).count,
      vocabulary: queryOne(vocabularyDb, 'SELECT COUNT(*) AS count FROM vocabulary').count,
      practice_sessions: queryOne(
        vocabularyDb,
        'SELECT COUNT(*) AS count FROM practice_sessions',
      ).count,
      exercise_attempts: queryOne(
        vocabularyDb,
        'SELECT COUNT(*) AS count FROM exercise_attempts',
      ).count,
    },
    runtime_artifacts: {
      logs: listFiles(LOGS_DIR, { maxDepth: 0 }),
      perf_logs: listFiles(PERF_LOGS_DIR, { maxDepth: 0 }),
      e2e_logs: listFiles(E2E_LOGS_DIR, { maxDepth: 0 }),
      test_results: listFiles(TEST_RESULTS_DIR, { maxDepth: 2, includeDirectories: true }),
    },
    endpoints: {
      gateway_health: GATEWAY_HEALTH_URL,
      lm_studio_models: LM_STUDIO_MODELS_URL,
      launcher_script: relativeProjectPath(OCR_LAUNCHER_PATH),
    },
  };
}

async function readProjectHealth() {
  const [gatewayResult, lmStudioResult, gatewayPort, lmStudioPort] = await Promise.all([
    fetchJson(GATEWAY_HEALTH_URL).catch((error) => ({
      ok: false,
      status: null,
      url: GATEWAY_HEALTH_URL,
      json: null,
      rawText: '',
      error: error.message,
    })),
    fetchJson(LM_STUDIO_MODELS_URL).catch((error) => ({
      ok: false,
      status: null,
      url: LM_STUDIO_MODELS_URL,
      json: null,
      rawText: '',
      error: error.message,
    })),
    checkTcpPort('127.0.0.1', 3000),
    checkTcpPort('127.0.0.1', 1234),
  ]);

  return {
    checked_at: new Date().toISOString(),
    gateway: {
      url: GATEWAY_HEALTH_URL,
      reachable: Boolean(gatewayResult.ok),
      port_reachable: gatewayPort.reachable,
      status: gatewayResult.status,
      health: gatewayResult.json,
      error: gatewayResult.error || (!gatewayResult.ok ? gatewayResult.rawText || null : null),
    },
    lm_studio: {
      url: LM_STUDIO_MODELS_URL,
      reachable: Boolean(lmStudioResult.ok),
      port_reachable: lmStudioPort.reachable,
      status: lmStudioResult.status,
      models:
        Array.isArray(lmStudioResult.json?.data)
          ? lmStudioResult.json.data.map((item) => item.id).filter(Boolean)
          : [],
      error: lmStudioResult.error || (!lmStudioResult.ok ? lmStudioResult.rawText || null : null),
    },
    databases: {
      documents: fileExistsStats(DOCUMENTS_DB_PATH),
      vocabulary: fileExistsStats(VOCABULARY_DB_PATH),
      legacy: fileExistsStats(LEGACY_DB_PATH),
    },
    runtime_artifacts: {
      logs_dir: fileExistsStats(LOGS_DIR),
      perf_logs_dir: fileExistsStats(PERF_LOGS_DIR),
      e2e_logs_dir: fileExistsStats(E2E_LOGS_DIR),
      test_results_dir: fileExistsStats(TEST_RESULTS_DIR),
    },
  };
}

async function readLauncherStatus() {
  const { stdout, stderr } = await execFileAsync('bash', [OCR_LAUNCHER_PATH, 'status'], {
    cwd: ROOT,
    maxBuffer: 1024 * 1024,
  });

  return {
    command: `bash ${relativeProjectPath(OCR_LAUNCHER_PATH)} status`,
    stdout,
    stderr,
  };
}

function createServer() {
  const server = new McpServer({
    name: 'ocr-app-mcp',
    version: ROOT_PACKAGE.version || '0.0.0',
  });

  server.registerTool(
    'get_gateway_json',
    {
      title: 'Gateway JSON',
      description:
        'Fetches one allowlisted read-only gateway JSON endpoint such as /api/health, /api/documents, /api/vocabulary, or /api/practice/sessions.',
      inputSchema: {
        path: gatewayPathSchema,
      },
    },
    async ({ path }) => toolJson(await getGatewayJson(path)),
  );

  server.registerTool(
    'get_project_health',
    {
      title: 'Project Health',
      description:
        'Checks the real OCR-App runtime: gateway /api/health, LM Studio /v1/models, database files, and runtime artifact directories.',
      inputSchema: {},
    },
    async () => toolJson(await readProjectHealth()),
  );

  server.registerTool(
    'launcher_status',
    {
      title: 'Launcher Status',
      description:
        'Runs scripts/linux/ocr.sh status and returns the actual launcher status output from this repository.',
      inputSchema: {},
    },
    async () => toolJson(await readLauncherStatus()),
  );

  server.registerTool(
    'list_documents',
    {
      title: 'List Saved Documents',
      description:
        'Reads saved documents from data/documents.sqlite, optionally filtering by filename or markdown content.',
      inputSchema: {
        limit: listLimitSchema.optional(),
        query: z.string().trim().min(1).max(200).optional(),
      },
    },
    async ({ limit, query }) => toolJson({ documents: readDocuments(limit, query) }),
  );

  server.registerTool(
    'debug_failed_document',
    {
      title: 'Debug Failed Document',
      description:
        'Builds a compact incident report for one saved document: document state, extracted candidates, linked vocabulary, and a health snapshot.',
      inputSchema: {
        id: z.string().uuid(),
        candidate_limit: listLimitSchema.optional(),
        linked_vocabulary_limit: listLimitSchema.optional(),
      },
    },
    async ({ id, candidate_limit, linked_vocabulary_limit }) =>
      toolJson(await debugFailedDocument(id, candidate_limit, linked_vocabulary_limit)),
  );

  server.registerTool(
    'get_document',
    {
      title: 'Get Saved Document',
      description:
        'Reads one saved document by id from data/documents.sqlite and can include vocabulary extraction candidates.',
      inputSchema: {
        id: z.string().uuid(),
        include_candidates: z.boolean().default(true),
        candidate_limit: listLimitSchema.optional(),
      },
    },
    async ({ id, include_candidates, candidate_limit }) => {
      const document = readDocumentById(id, candidate_limit);
      if (!include_candidates) {
        delete document.candidates;
      }
      return toolJson(document);
    },
  );

  server.registerTool(
    'trace_word_lifecycle',
    {
      title: 'Trace Word Lifecycle',
      description:
        'Traces a word across document candidates, persisted vocabulary, source-document links, and practice attempts.',
      inputSchema: {
        word: z.string().trim().min(1).max(120),
        target_lang: z.string().trim().min(1).max(20).optional(),
        native_lang: z.string().trim().min(1).max(20).optional(),
        attempt_limit: listLimitSchema.optional(),
        candidate_limit: listLimitSchema.optional(),
      },
    },
    async (args) => toolJson(traceWordLifecycle(args)),
  );

  server.registerTool(
    'search_vocabulary',
    {
      title: 'Search Vocabulary',
      description:
        'Searches the real vocabulary table in data/vocabulary.sqlite by word, translation, or context sentence.',
      inputSchema: {
        query: z.string().trim().min(1).max(200),
        target_lang: z.string().trim().min(1).max(20).optional(),
        native_lang: z.string().trim().min(1).max(20).optional(),
        limit: listLimitSchema.optional(),
      },
    },
    async (args) => toolJson({ results: searchVocabulary(args) }),
  );

  server.registerTool(
    'list_due_vocabulary',
    {
      title: 'List Due Vocabulary',
      description:
        'Returns the current spaced-repetition review queue from the vocabulary.next_review_at field.',
      inputSchema: {
        limit: listLimitSchema.optional(),
        target_lang: z.string().trim().min(1).max(20).optional(),
        native_lang: z.string().trim().min(1).max(20).optional(),
      },
    },
    async (args) => toolJson({ results: readDueVocabulary(args) }),
  );

  server.registerTool(
    'list_practice_sessions',
    {
      title: 'List Practice Sessions',
      description:
        'Reads recent practice_sessions from data/vocabulary.sqlite and augments them with attempt counts and accuracy.',
      inputSchema: {
        limit: listLimitSchema.optional(),
      },
    },
    async ({ limit }) => toolJson({ sessions: readPracticeSessions(limit) }),
  );

  server.registerTool(
    'get_word_stats',
    {
      title: 'Vocabulary Practice Stats',
      description:
        'Reads one vocabulary item and its real exercise_attempts history from data/vocabulary.sqlite.',
      inputSchema: {
        vocabulary_id: z.string().uuid(),
      },
    },
    async ({ vocabulary_id }) => toolJson(readWordStats(vocabulary_id)),
  );

  server.registerTool(
    'recent_practice_mistakes',
    {
      title: 'Recent Practice Mistakes',
      description:
        'Returns the latest incorrect exercise_attempts joined with vocabulary words and translations.',
      inputSchema: {
        limit: listLimitSchema.optional(),
      },
    },
    async ({ limit }) => toolJson({ mistakes: readRecentPracticeMistakes(limit) }),
  );

  server.registerTool(
    'db_overview',
    {
      title: 'Database Overview',
      description:
        'Inspects the real SQLite schemas used by OCR-App and returns tables plus columns for documents, vocabulary, or legacy runtime DB.',
      inputSchema: {
        database: z.enum(['documents', 'vocabulary', 'legacy']).optional(),
      },
    },
    async ({ database }) => toolJson({ databases: readDatabaseOverview(database) }),
  );

  server.registerTool(
    'list_runtime_logs',
    {
      title: 'List Runtime Logs',
      description:
        'Lists files under logs/ and tmp/perf/logs/ that exist in the current workspace.',
      inputSchema: {},
    },
    async () =>
      toolJson({
        runtime_logs: listFiles(LOGS_DIR, { maxDepth: 0 }),
        perf_logs: listFiles(PERF_LOGS_DIR, { maxDepth: 0 }),
        e2e_logs: listFiles(E2E_LOGS_DIR, { maxDepth: 0 }),
      }),
  );

  server.registerTool(
    'read_runtime_log',
    {
      title: 'Read Runtime Log',
      description:
        'Reads the tail of a real runtime log from logs/ or tmp/perf/logs/.',
      inputSchema: {
        filename: z.string().trim().min(1).max(200),
        scope: z.enum(['runtime', 'perf', 'e2e']).default('runtime'),
        lines: tailLinesSchema.optional(),
      },
    },
    async ({ filename, scope, lines }) => {
      const dir = scope === 'perf'
        ? PERF_LOGS_DIR
        : scope === 'e2e'
          ? E2E_LOGS_DIR
          : LOGS_DIR;
      const filePath = path.join(dir, ensureSafeFilename(filename));
      return toolJson({
        scope,
        file: relativeProjectPath(filePath),
        tail: tailTextFile(filePath, tailLinesSchema.parse(lines)),
      });
    },
  );

  server.registerTool(
    'list_test_results',
    {
      title: 'List Test Results',
      description:
        'Lists test artifacts under test-results/ from the real repository workspace.',
      inputSchema: {
        query: z.string().trim().min(1).max(200).optional(),
        limit: listLimitSchema.optional(),
      },
    },
    async ({ query, limit }) => {
      const entries = listFiles(TEST_RESULTS_DIR, {
        maxDepth: 3,
        includeDirectories: true,
      }).filter((entry) => (query ? entry.path.toLowerCase().includes(query.toLowerCase()) : true));

      return toolJson({ artifacts: entries.slice(0, listLimitSchema.parse(limit)) });
    },
  );

  server.registerTool(
    'read_test_artifact',
    {
      title: 'Read Test Artifact',
      description:
        'Reads a text artifact from test-results/ while preventing path traversal outside that directory.',
      inputSchema: {
        path: z.string().trim().min(1).max(400),
        lines: tailLinesSchema.optional(),
      },
    },
    async ({ path: artifactPath, lines }) => {
      const resolved = ensurePathInside(TEST_RESULTS_DIR, artifactPath);
      return toolJson({
        path: relativeProjectPath(resolved),
        tail: tailTextFile(resolved, tailLinesSchema.parse(lines)),
      });
    },
  );

  server.registerResource(
    'project_overview',
    'ocr://project/overview',
    {
      title: 'Project Overview',
      description:
        'High-level overview of the OCR-App MCP server data sources, counts, and runtime artifact locations.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResource(uri, readProjectOverview()),
  );

  server.registerResource(
    'database_summary',
    'ocr://databases/summary',
    {
      title: 'Database Summary',
      description:
        'Schema summary for the real SQLite databases used by OCR-App.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResource(uri, { databases: readDatabaseOverview() }),
  );

  server.registerResource(
    'runtime_logs_index',
    'ocr://logs/runtime-index',
    {
      title: 'Runtime Logs Index',
      description:
        'Current runtime and perf log file inventory from this repository workspace.',
      mimeType: 'application/json',
    },
    async (uri) =>
      jsonResource(uri, {
        runtime_logs: listFiles(LOGS_DIR, { maxDepth: 0 }),
        perf_logs: listFiles(PERF_LOGS_DIR, { maxDepth: 0 }),
        e2e_logs: listFiles(E2E_LOGS_DIR, { maxDepth: 0 }),
      }),
  );

  server.registerResource(
    'saved_document',
    new ResourceTemplate('ocr://documents/{id}', {
      list: async () => ({
        resources: readDocuments(100).map((document) => ({
          uri: `ocr://documents/${encodeURIComponent(document.id)}`,
          name: document.filename,
          description: `Saved document ${document.filename}`,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      title: 'Saved Document Resource',
      description:
        'Read a saved document and its extracted candidates directly from documents.sqlite.',
      mimeType: 'application/json',
    },
    async (uri, variables) => jsonResource(uri, readDocumentById(decodeURIComponent(variables.id))),
  );

  server.registerResource(
    'runtime_log',
    new ResourceTemplate('ocr://logs/runtime/{filename}', {
      list: async () => ({
        resources: listFiles(LOGS_DIR, { maxDepth: 0 }).map((entry) => ({
          uri: `ocr://logs/runtime/${encodeURIComponent(path.basename(entry.path))}`,
          name: path.basename(entry.path),
          description: `Runtime log ${entry.path}`,
          mimeType: 'text/plain',
        })),
      }),
    }),
    {
      title: 'Runtime Log Resource',
      description:
        'Read the tail of a runtime log from logs/.',
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const filePath = path.join(LOGS_DIR, ensureSafeFilename(decodeURIComponent(variables.filename)));
      return textResource(uri, tailTextFile(filePath, 200));
    },
  );

  return server;
}

async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  startServer().catch((error) => {
    const message = error instanceof Error ? `${error.stack || error.message}\n` : `${String(error)}\n`;
    process.stderr.write(message);
    closeAllDbs();
    process.exitCode = 1;
  });
}

process.on('exit', closeAllDbs);
process.on('SIGINT', () => {
  closeAllDbs();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeAllDbs();
  process.exit(0);
});

module.exports = {
  createServer,
  startServer,
};
