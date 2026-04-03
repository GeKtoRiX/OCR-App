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
const net = require('net');
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
const TEST_RESULTS_DIR = path.join(ROOT, 'test-results');
const OCR_LAUNCHER = path.join(ROOT, 'scripts', 'linux', 'ocr.sh');
const ROOT_PACKAGE_JSON = path.join(ROOT, 'package.json');
const TTS_MODELS_CONFIG = path.join(ROOT, 'scripts', 'linux', 'tts-models.conf');
const PREPARE_BROWSER_ENV_SCRIPT = path.join(ROOT, 'scripts', 'e2e', 'prepare-browser-env.sh');
const STOP_BROWSER_ENV_SCRIPT = path.join(ROOT, 'scripts', 'e2e', 'stop-browser-env.sh');

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

const DATABASES = {
  vocabulary: { path: VOCAB_DB_PATH, db: vocabDb },
  documents: { path: DOC_DB_PATH, db: docDb },
  runtime: { path: path.join(ROOT, 'data', 'ocr-app.db') },
};

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
  if (!safe) {
    throw new Error('filename is required');
  }
  const resolved = path.join(RUNTIME_LOG_DIR, safe);
  if (!fs.existsSync(resolved)) {
    throw new Error(`runtime log not found: ${safe}`);
  }
  return resolved;
}

function resolveTestArtifactPath(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('path is required');
  }

  const resolved = path.resolve(TEST_RESULTS_DIR, raw);
  if (resolved !== TEST_RESULTS_DIR && !resolved.startsWith(`${TEST_RESULTS_DIR}${path.sep}`)) {
    throw new Error('path must stay inside test-results');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`test artifact not found: ${raw}`);
  }
  return resolved;
}

function resolveDatabase(value) {
  const key = String(value || '').trim();
  if (!DATABASES[key]) {
    throw new Error(`database must be one of: ${Object.keys(DATABASES).join(', ')}`);
  }
  return { key, ...DATABASES[key] };
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

function parseJsonArray(value, fallback = []) {
  if (value == null) {
    return fallback;
  }
  if (Array.isArray(value)) {
    return value;
  }
  const parsed = JSON.parse(String(value));
  if (!Array.isArray(parsed)) {
    throw new Error('value must be a JSON array');
  }
  return parsed;
}

function isReadableTextArtifact(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return new Set([
    '.md',
    '.txt',
    '.log',
    '.json',
    '.yml',
    '.yaml',
    '.xml',
    '.html',
    '.csv',
  ]).has(ext);
}

function listTestResultArtifacts(query, limit) {
  if (!fs.existsSync(TEST_RESULTS_DIR)) {
    return [];
  }

  const q = String(query || '').trim().toLowerCase();
  const results = walkProject(TEST_RESULTS_DIR, {
    maxDepth: 3,
    skipDirs: new Set(),
    fileFilter: () => true,
  })
    .map((relative) => relative.replace(/^test-results\//, ''))
    .filter((relative) => (q ? relative.toLowerCase().includes(q) : true))
    .slice(0, normalizeLimit(limit, 80, 400));

  return results.map((relative) => {
    const fullPath = path.join(TEST_RESULTS_DIR, relative);
    const stat = fs.statSync(fullPath);
    return {
      path: relative.replace(/\\/g, '/'),
      type: stat.isDirectory() ? 'directory' : 'file',
      size_bytes: stat.isFile() ? stat.size : null,
      modified_at: stat.mtime.toISOString(),
    };
  });
}

function ensureSafeReadOnlySql(sql) {
  const normalized = String(sql || '').trim();
  if (!normalized) {
    throw new Error('sql is required');
  }

  const compact = normalized.replace(/\s+/g, ' ').trim();
  if (compact.includes(';')) {
    throw new Error('only a single SQL statement is allowed');
  }

  const lower = compact.toLowerCase();
  const startsReadOnly =
    lower.startsWith('select ') ||
    lower.startsWith('with ') ||
    lower.startsWith('explain ') ||
    lower.startsWith('pragma table_info(') ||
    lower.startsWith('pragma index_list(') ||
    lower.startsWith('pragma index_info(') ||
    lower.startsWith('pragma foreign_key_list(');
  if (!startsReadOnly) {
    throw new Error('only read-only SELECT/EXPLAIN and schema PRAGMA statements are allowed');
  }

  const forbidden = [
    'attach ',
    'detach ',
    'alter ',
    'create ',
    'delete ',
    'drop ',
    'insert ',
    'replace ',
    'truncate ',
    'update ',
    'vacuum',
    'reindex',
  ];
  if (forbidden.some((token) => lower.includes(token))) {
    throw new Error('SQL contains a disallowed write/admin keyword');
  }

  return compact;
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

function isSecretLikeKey(key) {
  return /(token|secret|key|password|passwd|auth)/i.test(String(key || ''));
}

function redactEnvValue(key, value) {
  if (value == null || value === '') {
    return '';
  }
  if (isSecretLikeKey(key)) {
    return '<redacted>';
  }
  return String(value);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadRootPackage() {
  return readJsonFile(ROOT_PACKAGE_JSON);
}

function loadWorkspacePackages() {
  const rootPackage = loadRootPackage();
  return (rootPackage.workspaces || []).map((workspacePath) => {
    const packageJsonPath = path.join(ROOT, workspacePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return {
        path: workspacePath,
        package_name: null,
        has_package_json: false,
      };
    }

    const pkg = readJsonFile(packageJsonPath);
    return {
      path: workspacePath,
      package_name: pkg.name || null,
      version: pkg.version || null,
      scripts: Object.keys(pkg.scripts || {}).sort(),
      has_package_json: true,
    };
  });
}

function loadWorkspacePackageDetails() {
  const rootPackage = loadRootPackage();
  return (rootPackage.workspaces || []).map((workspacePath) => {
    const packageJsonPath = path.join(ROOT, workspacePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return {
        path: workspacePath,
        package_name: null,
        package_json_path: path.relative(ROOT, packageJsonPath).replace(/\\/g, '/'),
        has_package_json: false,
        dependencies: {},
        dev_dependencies: {},
      };
    }

    const pkg = readJsonFile(packageJsonPath);
    return {
      path: workspacePath,
      package_name: pkg.name || null,
      package_json_path: path.relative(ROOT, packageJsonPath).replace(/\\/g, '/'),
      version: pkg.version || null,
      has_package_json: true,
      scripts: Object.keys(pkg.scripts || {}).sort(),
      dependencies: pkg.dependencies || {},
      dev_dependencies: pkg.devDependencies || {},
    };
  });
}

function collectWorkspaceSourceFiles(workspacePath) {
  const roots = [workspacePath];
  const nestedSourceRoots = [
    path.join(workspacePath, 'src'),
    path.join(workspacePath, 'gateway', 'src'),
    path.join(workspacePath, 'services'),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);

  for (const candidate of nestedSourceRoots) {
    if (fs.existsSync(path.join(ROOT, candidate))) {
      roots.push(candidate);
    }
  }

  const seen = new Set();
  const files = [];
  for (const rootPath of roots) {
    const absoluteRoot = path.join(ROOT, rootPath);
    if (!fs.existsSync(absoluteRoot)) {
      continue;
    }

    const discovered = walkProject(absoluteRoot, {
      maxDepth: 8,
      skipDirs: new Set(['node_modules', '.git', 'dist', 'coverage', '.venv', '.venv.bak', '__pycache__']),
      fileFilter: (_, name) =>
        /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) &&
        !name.endsWith('.spec.ts') &&
        !name.endsWith('.spec.tsx'),
    });
    for (const relative of discovered) {
      if (!seen.has(relative)) {
        seen.add(relative);
        files.push(relative);
      }
    }
  }
  return files.sort();
}

function buildDependencyMap() {
  const rootPackage = loadRootPackage();
  const workspacePackages = loadWorkspacePackageDetails();
  const workspaceNames = new Set(
    workspacePackages
      .map((item) => item.package_name)
      .filter(Boolean),
  );

  const packages = workspacePackages.map((workspace) => {
    const declaredDeps = workspace.dependencies || {};
    const declaredDevDeps = workspace.dev_dependencies || {};
    const sourceFiles = collectWorkspaceSourceFiles(workspace.path);
    const sourceTextByFile = sourceFiles.map((relativePath) => ({
      path: relativePath,
      text: fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
    }));

    const internalWorkspaceDeps = workspacePackages
      .filter((candidate) => candidate.package_name && candidate.package_name !== workspace.package_name)
      .map((candidate) => {
        const hits = sourceTextByFile
          .filter((file) => file.text.includes(candidate.package_name))
          .map((file) => file.path)
          .slice(0, 10);
        if (hits.length === 0) {
          return null;
        }
        return {
          package_name: candidate.package_name,
          workspace_path: candidate.path,
          declared_in_package_json:
            Object.prototype.hasOwnProperty.call(declaredDeps, candidate.package_name) ||
            Object.prototype.hasOwnProperty.call(declaredDevDeps, candidate.package_name),
          evidence_files: hits,
        };
      })
      .filter(Boolean);

    const externalDependencies = Object.entries(declaredDeps)
      .filter(([depName]) => !workspaceNames.has(depName))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([depName, version]) => ({ name: depName, version }));

    const externalDevDependencies = Object.entries(declaredDevDeps)
      .filter(([depName]) => !workspaceNames.has(depName))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([depName, version]) => ({ name: depName, version }));

    return {
      path: workspace.path,
      package_name: workspace.package_name,
      version: workspace.version || null,
      package_json_path: workspace.package_json_path,
      internal_workspace_dependencies: internalWorkspaceDeps,
      external_dependencies: externalDependencies,
      external_dev_dependencies: externalDevDependencies,
      source_file_count: sourceFiles.length,
    };
  });

  return {
    root_package: {
      name: rootPackage.name || null,
      version: rootPackage.version || null,
      workspaces: rootPackage.workspaces || [],
    },
    packages,
    notes: [
      'internal_workspace_dependencies are inferred from source imports/usages, not only package.json declarations.',
      'declared_in_package_json helps spot workspace links that rely on tsconfig/path mapping or npm workspace linking without explicit dependency entries.',
      'external dependency lists exclude workspace-local packages.',
    ],
  };
}

function parseSimpleEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }
    result[match[1]] = match[2];
  }
  return result;
}

function buildDocCatalog() {
  const docs = [
    { path: 'README.md', purpose: 'user-facing overview, setup, runtime, and MCP registration' },
    { path: 'CLAUDE.md', purpose: 'engineering guide and local operating context' },
    { path: 'agents.md', purpose: 'agent roles, boundaries, and collaboration notes' },
    { path: 'structure.md', purpose: 'repository structure contract and allowed layout' },
    { path: 'docs/agents/architecture.md', purpose: 'architecture, flows, ports, and constraints' },
    { path: 'docs/agents/context.md', purpose: 'recent confirmed facts, risks, and current context' },
    { path: 'docs/agents/runbook.md', purpose: 'operational runbook and workflow notes' },
  ];

  return docs.filter((item) => fs.existsSync(path.join(ROOT, item.path)));
}

function buildRepoTree(relativePath = '.', options = {}) {
  const start = ensureProjectRelativeFile(relativePath);
  const maxDepth = Math.max(0, Math.min(Number.parseInt(String(options.maxDepth ?? 2), 10) || 2, 6));
  const includeFiles = options.includeFiles !== false;
  const limit = Math.max(1, Math.min(Number.parseInt(String(options.limit ?? 500), 10) || 500, 2000));
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'coverage', '.venv', '.venv.bak', '__pycache__']);
  const results = [];

  function visit(currentPath, depth) {
    if (results.length >= limit || depth > maxDepth) {
      return;
    }

    const stat = fs.statSync(currentPath);
    const rel = path.relative(ROOT, currentPath).replace(/\\/g, '/') || '.';
    if (stat.isDirectory()) {
      results.push({ path: rel, type: 'dir', depth });
      const entries = fs.readdirSync(currentPath, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (results.length >= limit) {
          break;
        }
        if (entry.isDirectory()) {
          if (skipDirs.has(entry.name)) {
            continue;
          }
          visit(path.join(currentPath, entry.name), depth + 1);
        } else if (includeFiles) {
          results.push({
            path: path.relative(ROOT, path.join(currentPath, entry.name)).replace(/\\/g, '/'),
            type: 'file',
            depth: depth + 1,
          });
        }
      }
      return;
    }

    if (includeFiles) {
      results.push({ path: rel, type: 'file', depth });
    }
  }

  visit(start, 0);
  return {
    root: path.relative(ROOT, start).replace(/\\/g, '/') || '.',
    max_depth: maxDepth,
    include_files: includeFiles,
    limit,
    truncated: results.length >= limit,
    entries: results.slice(0, limit),
  };
}

function discoverGatewayRoutes() {
  const controllerFiles = walkProject(path.join(ROOT, 'backend', 'gateway', 'src'), {
    maxDepth: 3,
    fileFilter: (fullPath, name) => name.endsWith('.controller.ts'),
  }).sort();

  const routes = [];
  for (const relative of controllerFiles) {
    const filePath = path.join(ROOT, relative);
    const source = fs.readFileSync(filePath, 'utf8');
    const controllerMatch = source.match(/@Controller\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    const base = controllerMatch ? controllerMatch[1] : '';
    const regex = /@(Get|Post|Put|Delete|Patch)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    let match = null;
    while ((match = regex.exec(source)) !== null) {
      const method = match[1].toUpperCase();
      const suffix = match[2] || '';
      const fullPath = `/${[base, suffix].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
      routes.push({
        file: relative,
        method,
        path: fullPath,
        controller_base: base,
      });
    }
  }

  return {
    controllers: controllerFiles,
    routes,
  };
}

function buildServiceInventory() {
  const gatewayControllers = walkProject(path.join(ROOT, 'backend', 'gateway', 'src'), {
    maxDepth: 3,
    fileFilter: (fullPath, name) => name.endsWith('.controller.ts') || name.endsWith('.module.ts'),
  }).sort();
  const serviceEntrypoints = walkProject(path.join(ROOT, 'backend', 'services'), {
    maxDepth: 4,
    fileFilter: (fullPath, name) => ['main.ts', 'app.module.ts'].includes(name) || name.endsWith('.message.controller.ts'),
  }).sort();
  const sidecars = walkProject(path.join(ROOT, 'services'), {
    maxDepth: 4,
    fileFilter: (_, name) => ['main.py', 'requirements.txt', 'smoke_test.py'].includes(name),
  }).sort();

  return {
    gateway: gatewayControllers,
    services: serviceEntrypoints,
    sidecars,
    launcher: [
      'scripts/linux/ocr.sh',
      'scripts/linux/ocr-common.sh',
      'scripts/linux/tts-models.conf',
    ],
  };
}

function buildConfigMap() {
  const rootPackage = loadRootPackage();
  const launcherDefaults = parseSimpleEnvFile(TTS_MODELS_CONFIG);
  const envFile = parseSimpleEnvFile(path.join(ROOT, '.env'));

  return {
    root_package: {
      name: rootPackage.name || null,
      version: rootPackage.version || null,
      workspaces: rootPackage.workspaces || [],
      scripts: Object.keys(rootPackage.scripts || {}).sort(),
    },
    workspace_packages: loadWorkspacePackages(),
    launcher_tts_defaults: launcherDefaults,
    env_file_keys: Object.keys(envFile).sort().map((key) => ({
      key,
      value: redactEnvValue(key, envFile[key]),
    })),
  };
}

function buildEnvMap() {
  const envFile = parseSimpleEnvFile(path.join(ROOT, '.env'));
  const interestingKeys = [
    'PORT',
    'OCR_SERVICE_PORT',
    'TTS_SERVICE_PORT',
    'DOCUMENT_SERVICE_PORT',
    'VOCABULARY_SERVICE_PORT',
    'AGENTIC_SERVICE_PORT',
    'LM_STUDIO_BASE_URL',
    'STRUCTURING_MODEL',
    'DOCUMENTS_SQLITE_DB_PATH',
    'VOCABULARY_SQLITE_DB_PATH',
    'SQLITE_DB_PATH',
    'SUPERTONE_HOST',
    'SUPERTONE_PORT',
    'KOKORO_HOST',
    'KOKORO_PORT',
    'STANZA_HOST',
    'STANZA_PORT',
    'BERT_HOST',
    'BERT_PORT',
    'BERT_MODEL_NAME',
    'OPENAI_API_KEY',
    'LM_STUDIO_SMOKE_ONLY',
  ];

  return interestingKeys.map((key) => ({
    key,
    in_dotenv: Object.prototype.hasOwnProperty.call(envFile, key),
    dotenv_value: Object.prototype.hasOwnProperty.call(envFile, key)
      ? redactEnvValue(key, envFile[key])
      : null,
    in_process_env: Object.prototype.hasOwnProperty.call(process.env, key),
    process_value: Object.prototype.hasOwnProperty.call(process.env, key)
      ? redactEnvValue(key, process.env[key])
      : null,
  }));
}

function buildDatabaseSchema(databaseKey, tableName = null) {
  const database = resolveDatabase(databaseKey);
  if (!fs.existsSync(database.path)) {
    return {
      database: database.key,
      path: path.relative(ROOT, database.path),
      exists: false,
      tables: [],
    };
  }

  const activeDb = database.db || new Database(database.path, { readonly: true });
  try {
    const tables = activeDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `).all().map((row) => row.name);

    const selectedTables = tableName ? [tableName] : tables;
    const schema = [];
    for (const table of selectedTables) {
      if (!tables.includes(table)) {
        throw new Error(`table not found in ${database.key}: ${table}`);
      }
      const columns = activeDb.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
      const indexes = activeDb.prepare(`PRAGMA index_list(${JSON.stringify(table)})`).all();
      const foreignKeys = activeDb.prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`).all();
      schema.push({
        table,
        columns,
        indexes,
        foreign_keys: foreignKeys,
      });
    }

    return {
      database: database.key,
      path: path.relative(ROOT, database.path),
      tables: schema,
    };
  } finally {
    if (!database.db) {
      activeDb.close();
    }
  }
}

async function getProcessSnapshot() {
  const result = await runCommandCapture(
    'bash',
    ['-lc', `ps -eo pid=,ppid=,comm=,args= | rg -i "(${ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|ocrProject|lmstudio|uvicorn|playwright|nest start|backend/dist|frontend|stanza-service|bert-service|kokoro-service|supertone-service)"`],
    { cwd: ROOT, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const lines = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  return {
    ok: result.ok,
    processes: lines,
    stderr: result.stderr,
  };
}

function probeTcpPort(port, host = '127.0.0.1', timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (status, error = null) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve({ port, host, open: status, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (error) => finish(false, error.message));
    socket.connect(port, host);
  });
}

async function buildPortStatus(extraPorts = []) {
  const known = [
    { name: 'gateway', port: 3000 },
    { name: 'vite', port: 5173 },
    { name: 'ocr-service', port: 3901 },
    { name: 'tts-service', port: 3902 },
    { name: 'document-service', port: 3903 },
    { name: 'vocabulary-service', port: 3904 },
    { name: 'agentic-service', port: 3905 },
    { name: 'lm-studio', port: 1234 },
    { name: 'supertone', port: 8100 },
    { name: 'kokoro', port: 8200 },
    { name: 'stanza', port: 8501 },
    { name: 'bert', port: 8502 },
  ];
  for (const port of extraPorts) {
    const parsed = Number.parseInt(String(port), 10);
    if (Number.isFinite(parsed) && !known.some((item) => item.port === parsed)) {
      known.push({ name: `custom-${parsed}`, port: parsed });
    }
  }

  const statuses = await Promise.all(known.map(async (item) => ({
    ...item,
    ...(await probeTcpPort(item.port)),
  })));
  return statuses;
}

function buildProjectMap() {
  const workspacePackages = loadWorkspacePackages();
  const docs = buildDocCatalog();
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
      purpose: 'live SQLite stores, editor assets, and legacy runtime DB',
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
    workspace_packages: workspacePackages,
    zones,
    key_files: keyFiles,
    package_files: packageFiles,
    docs,
    notes: [
      'Gateway lives under backend/gateway/src, while most core logic and infrastructure live under backend/src.',
      'Live user data is primarily stored in data/documents.sqlite and data/vocabulary.sqlite, with data/ocr-app.db still present as a legacy/runtime database.',
      'The project MCP server itself lives in scripts/mcp-vocab-server.js.',
    ],
  };
}

function buildArchitectureMap() {
  const launcherDefaults = parseSimpleEnvFile(TTS_MODELS_CONFIG);

  return {
    runtime_topology: {
      frontend: { type: 'React/Vite SPA', path: 'frontend', port: 5173 },
      gateway: { type: 'NestJS HTTP gateway', path: 'backend/gateway', port: 3000 },
      services: [
        { name: 'ocr', transport: 'TCP', path: 'backend/services/ocr', port: 3901 },
        { name: 'tts', transport: 'TCP', path: 'backend/services/tts', port: 3902 },
        { name: 'document', transport: 'TCP', path: 'backend/services/document', port: 3903 },
        { name: 'vocabulary', transport: 'TCP', path: 'backend/services/vocabulary', port: 3904 },
        { name: 'agentic', transport: 'TCP', path: 'backend/services/agentic', port: 3905, optional_cloud_dependency: true },
      ],
      python_sidecars: [
        { name: 'stanza', path: 'services/nlp/stanza-service', port: 8501, optional: true },
        { name: 'bert', path: 'services/nlp/bert-service', port: 8502, optional: true, language_scope: 'en' },
        { name: 'supertone', path: 'services/tts/supertone-service', port: 8100, optional: true },
        { name: 'kokoro', path: 'services/tts/kokoro-service', port: 8200, optional: true },
      ],
      llm_runtime: {
        provider: 'LM Studio',
        base_url: 'http://127.0.0.1:1234/v1',
        used_by: ['ocr', 'vocabulary', 'document candidate enrichment', 'practice/session analysis'],
      },
    },
    codebase_shape: {
      monorepo_workspaces: loadWorkspacePackages(),
      backend_layers: [
        'backend/shared for contracts and shared abstractions',
        'backend/gateway for HTTP controllers and static hosting',
        'backend/services/* for TCP-hosted bounded contexts',
        'backend/src for reusable clean-architecture implementation',
      ],
      frontend_shape: [
        'feature-oriented folders under frontend/src/features',
        'shared API/types utilities under frontend/src/shared',
        'screen composition under frontend/src/view',
        'reusable UI atoms under frontend/src/ui',
      ],
    },
    storage: {
      primary_databases: buildDatabaseOverview().map((item) => ({
        database: item.database,
        path: item.path,
        tables: item.tables,
        exists: item.exists,
      })),
      assets: ['data/editor-assets'],
    },
    constraints: [
      'Base OCR/TTS/document/vocabulary flows are local-first.',
      'Agentic HTTP routes still depend on OPENAI_API_KEY.',
      'Browser/perf automation may use LM_STUDIO_SMOKE_ONLY=true.',
      `Launcher TTS defaults currently read as SUPERTONE=${launcherDefaults.TTS_ENABLE_SUPERTONE || 'unset'}, KOKORO=${launcherDefaults.TTS_ENABLE_KOKORO || 'unset'}.`,
    ],
    key_docs: buildDocCatalog(),
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
    static_assets: [
      'GET /editor-assets/*',
    ],
  };
}

function normalizeRouteMethod(value) {
  const method = String(value || '').trim().toUpperCase();
  if (!method) {
    return null;
  }
  const allowed = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
  if (!allowed.has(method)) {
    throw new Error(`method must be one of: ${Array.from(allowed).join(', ')}`);
  }
  return method;
}

function normalizeApiLikePath(value) {
  const routePath = String(value || '').trim();
  if (!routePath.startsWith('/')) {
    throw new Error('path must start with /');
  }
  return routePath;
}

function routePatternMatches(pattern, actualPath) {
  const patternParts = String(pattern).split('/').filter(Boolean);
  const actualParts = String(actualPath).split('/').filter(Boolean);
  if (patternParts.length !== actualParts.length) {
    return false;
  }
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const actualPart = actualParts[index];
    if (patternPart.startsWith(':')) {
      continue;
    }
    if (patternPart !== actualPart) {
      return false;
    }
  }
  return true;
}

function buildRouteTrace(method, routePath) {
  const normalizedMethod = normalizeRouteMethod(method);
  const normalizedPath = normalizeApiLikePath(routePath);
  const discovered = discoverGatewayRoutes();

  const matches = discovered.routes.filter((route) => {
    if (normalizedMethod && route.method !== normalizedMethod) {
      return false;
    }
    return route.path === normalizedPath || routePatternMatches(route.path, normalizedPath);
  }).map((route) => {
    const controllerAbsolute = path.join(ROOT, route.file);
    const modulePath = route.file.replace('.controller.ts', '.module.ts');
    const specPath = route.file.replace('.controller.ts', '.controller.spec.ts');
    return {
      method: route.method,
      path: route.path,
      requested_path: normalizedPath,
      controller_file: route.file,
      controller_exists: fs.existsSync(controllerAbsolute),
      module_file: fs.existsSync(path.join(ROOT, modulePath)) ? modulePath : null,
      spec_file: fs.existsSync(path.join(ROOT, specPath)) ? specPath : null,
      controller_base: route.controller_base,
    };
  });

  return {
    method: normalizedMethod,
    requested_path: normalizedPath,
    match_count: matches.length,
    matches,
  };
}

async function buildFeatureMap(query, limit = 40) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    throw new Error('query is required');
  }
  const normalizedLimit = normalizeLimit(limit, 40, 200);
  const sharedArgs = [
    '-n',
    '-i',
    '--no-heading',
    '--color',
    'never',
    '--max-count',
    String(normalizedLimit),
  ];

  const content = await runCommandCapture(
    'rg',
    [
      ...sharedArgs,
      '-g', '!package-lock.json',
      '-g', '!**/node_modules/**',
      '-g', '!**/dist/**',
      '-g', '!**/coverage/**',
      normalizedQuery,
      ROOT,
    ],
    { cwd: ROOT, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
  );

  const filenames = await runCommandCapture(
    'rg',
    [
      '--files',
      ROOT,
      '-g', `*${normalizedQuery}*`,
    ],
    { cwd: ROOT, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
  );

  const fileMatches = filenames.ok
    ? filenames.stdout
      .split('\n')
      .filter(Boolean)
      .map((item) => path.relative(ROOT, item))
      .slice(0, normalizedLimit)
    : [];

  const contentMatches = content.ok
    ? content.stdout
      .split('\n')
      .filter(Boolean)
      .slice(0, normalizedLimit)
      .map((line) => {
        const parts = line.split(':');
        const filePath = parts.shift() || '';
        const lineNumber = Number.parseInt(parts.shift() || '0', 10) || null;
        return {
          path: path.relative(ROOT, filePath),
          line: lineNumber,
          snippet: parts.join(':').trim(),
        };
      })
    : [];

  const grouped = {
    docs: [],
    frontend: [],
    backend: [],
    tests: [],
    scripts: [],
    other: [],
  };

  const classifyPath = (relativePath) => {
    if (relativePath.startsWith('docs/') || ['README.md', 'CLAUDE.md', 'agents.md', 'structure.md'].includes(relativePath)) {
      return 'docs';
    }
    if (relativePath.startsWith('frontend/')) {
      return 'frontend';
    }
    if (relativePath.startsWith('backend/')) {
      return relativePath.includes('.spec.') || relativePath.includes('.e2e.') ? 'tests' : 'backend';
    }
    if (relativePath.startsWith('e2e/')) {
      return 'tests';
    }
    if (relativePath.startsWith('scripts/')) {
      return 'scripts';
    }
    return 'other';
  };

  for (const item of contentMatches) {
    grouped[classifyPath(item.path)].push(item);
  }

  return {
    query: normalizedQuery,
    limit: normalizedLimit,
    filename_matches: fileMatches,
    content_matches: grouped,
    notes: [
      'filename_matches are broad path hits and are useful as a first navigation pass.',
      'content_matches are grouped by project area to reduce manual ripgrep usage.',
    ],
  };
}

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function buildImportGraph(relativePath, maxCallers = 50) {
  const filePath = ensureProjectRelativeFile(relativePath);
  const normalizedPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const source = fs.readFileSync(filePath, 'utf8');
  const importRegex = /(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+|require\()\s*['"`]([^'"`]+)['"`]/g;
  const imports = [];
  let match = null;
  while ((match = importRegex.exec(source)) !== null) {
    imports.push(match[1]);
  }

  const internalImports = [];
  const externalImports = [];
  for (const specifier of imports) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      internalImports.push(specifier);
    } else {
      externalImports.push(specifier);
    }
  }

  const callers = walkProject(ROOT, {
    maxDepth: 8,
    skipDirs: new Set(['node_modules', '.git', 'dist', 'coverage', '.venv', '.venv.bak', '__pycache__']),
    fileFilter: (_, name) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name),
  })
    .filter((candidate) => candidate !== normalizedPath)
    .filter((candidate) => {
      const candidateSource = fs.readFileSync(path.join(ROOT, candidate), 'utf8');
      return candidateSource.includes(normalizedPath) || candidateSource.includes(path.basename(normalizedPath));
    })
    .slice(0, Math.max(1, Math.min(Number.parseInt(String(maxCallers), 10) || 50, 200)));

  return {
    path: normalizedPath,
    internal_imports: Array.from(new Set(internalImports)).sort(),
    external_imports: Array.from(new Set(externalImports)).sort(),
    imported_by_candidates: callers,
    notes: [
      'imported_by_candidates are heuristic text matches and are meant for navigation, not exact compiler resolution.',
      'internal_imports preserve relative specifiers exactly as written in the file.',
    ],
  };
}

function buildTestCoverageMap(targetPath) {
  const resolved = ensureProjectRelativeFile(targetPath);
  const normalizedPath = path.relative(ROOT, resolved).replace(/\\/g, '/');
  const baseName = path.basename(normalizedPath).replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
  const parentDir = path.dirname(normalizedPath);

  const allTests = walkProject(ROOT, {
    maxDepth: 8,
    skipDirs: new Set(['node_modules', '.git', 'dist', 'coverage', '.venv', '.venv.bak', '__pycache__']),
    fileFilter: (_, name) => /(\.spec\.|\.test\.|\.e2e\.)\w+$/.test(name),
  }).sort();

  const directMatches = allTests.filter((testPath) => {
    const testSource = fs.readFileSync(path.join(ROOT, testPath), 'utf8');
    return testSource.includes(normalizedPath) || testSource.includes(baseName) || testPath.includes(baseName);
  });

  const nearbyTests = allTests.filter((testPath) => {
    if (directMatches.includes(testPath)) {
      return false;
    }
    return path.dirname(testPath).startsWith(parentDir);
  }).slice(0, 40);

  const recommendedScripts = [];
  if (normalizedPath.startsWith('frontend/')) {
    recommendedScripts.push('npm run test --workspace=frontend');
  }
  if (normalizedPath.startsWith('backend/gateway/')) {
    recommendedScripts.push('npm run test --workspace=./backend');
    recommendedScripts.push('npm run test:e2e:api');
  } else if (normalizedPath.startsWith('backend/')) {
    recommendedScripts.push('npm run test --workspace=./backend');
  }
  if (normalizedPath.startsWith('e2e/')) {
    recommendedScripts.push('npm run test:e2e:browser');
  }

  return {
    target_path: normalizedPath,
    direct_test_matches: directMatches,
    nearby_tests: nearbyTests,
    recommended_scripts: Array.from(new Set(recommendedScripts)),
    notes: [
      'direct_test_matches are based on filename affinity and explicit text references to the target file or symbol stem.',
      'nearby_tests help when coverage exists at the feature-folder level rather than the exact file level.',
    ],
  };
}

async function runLauncherCommand(subcommand) {
  const args = [OCR_LAUNCHER];
  if (subcommand) {
    args.push(subcommand);
  }
  return runCommandCapture('bash', args, {
    cwd: ROOT,
    timeout: 20 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function buildLogDiagnose(filename, lines = 120) {
  const logPath = resolveRuntimeLogFile(filename);
  const lineCount = Math.max(20, Math.min(Number.parseInt(String(lines), 10) || 120, 400));
  const result = await runCommandCapture(
    'tail',
    ['-n', String(lineCount), logPath],
    { cwd: ROOT, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
  );

  const text = stripAnsi(result.stdout || '');
  const rawLines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const lowered = text.toLowerCase();
  const issuePatterns = [
    { key: 'address_in_use', test: /eaddrinuse|address already in use|listen eaddrinuse/i, recommendation: 'Free the occupied port or stop the previous process before restarting the service.' },
    { key: 'module_not_found', test: /cannot find module|module not found/i, recommendation: 'Check build output paths, workspace installs, and package resolution.' },
    { key: 'sqlite', test: /sqlite|database is locked|no such table/i, recommendation: 'Inspect SQLite paths, schema state, and concurrent writers.' },
    { key: 'lm_studio', test: /lm studio|127\.0\.0\.1:1234|v1\/models|fetch failed/i, recommendation: 'Verify LM Studio is running, reachable, and has a loaded model.' },
    { key: 'openai_key', test: /openai_api_key|api key|unauthorized/i, recommendation: 'Set the required API key or disable the optional cloud-dependent path.' },
    { key: 'python_sidecar', test: /uvicorn|traceback|fastapi|pydantic/i, recommendation: 'Inspect the sidecar virtualenv, python dependencies, and service-specific startup args.' },
  ];

  const findings = issuePatterns.filter((pattern) => pattern.test.test(text)).map((pattern) => ({
    key: pattern.key,
    recommendation: pattern.recommendation,
  }));

  const errorLines = rawLines.filter((line) => /\b(error|exception|traceback|failed|fail|refused)\b/i.test(line)).slice(-20);
  const warningLines = rawLines.filter((line) => /\b(warn|warning)\b/i.test(line)).slice(-20);

  return {
    filename: path.basename(logPath),
    line_count: rawLines.length,
    findings,
    error_lines: errorLines,
    warning_lines: warningLines,
    last_lines: rawLines.slice(-30),
    summary: lowered.includes('successfully started')
      ? 'Service appears to have started successfully in the captured log tail.'
      : findings.length > 0
        ? 'Potential failure signatures detected in the log tail.'
        : 'No strong failure signature detected in the captured log tail.',
  };
}

function buildRuntimeMap(health, lmStudio, lms) {
  const launcherDefaults = parseSimpleEnvFile(TTS_MODELS_CONFIG);
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
      { name: 'ocr-service', port: 3901, entrypoint: 'backend/services/ocr/src/main.ts' },
      { name: 'tts-service', port: 3902, entrypoint: 'backend/services/tts/src/main.ts' },
      { name: 'document-service', port: 3903, entrypoint: 'backend/services/document/src/main.ts' },
      { name: 'vocabulary-service', port: 3904, entrypoint: 'backend/services/vocabulary/src/main.ts' },
      { name: 'agentic-service', port: 3905, entrypoint: 'backend/services/agentic/src/main.ts', optional_cloud_dependency: true },
    ],
    sidecars: [
      { name: 'supertone', port: 8100, reachable: health.data?.superToneReachable ?? null },
      { name: 'kokoro', port: 8200, reachable: health.data?.kokoroReachable ?? null },
      { name: 'stanza', port: 8501, reachable: null },
      { name: 'bert', port: 8502, reachable: null },
    ],
    launcher_defaults: {
      tts_enable_supertone: launcherDefaults.TTS_ENABLE_SUPERTONE || null,
      tts_enable_kokoro: launcherDefaults.TTS_ENABLE_KOKORO || null,
      config_path: path.relative(ROOT, TTS_MODELS_CONFIG),
    },
    environment_switches: [
      'OPENAI_API_KEY gates the optional agentic runtime.',
      'LM_STUDIO_SMOKE_ONLY swaps LM Studio-dependent logic for smoke-friendly stubs in automation paths.',
      'DOCUMENTS_SQLITE_DB_PATH and VOCABULARY_SQLITE_DB_PATH are used by e2e/perf harnesses for isolated test databases.',
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
  const databases = buildDatabaseOverview();
  return {
    sqlite: databases,
    other_storage: [
      'data/editor-assets',
      'logs',
      'tmp/perf/logs',
      '.pids',
      'tmp/test-db',
    ],
    important_links: [
      'vocabulary.source_document_id -> saved_documents.id',
      'exercise_attempts.vocabulary_id -> vocabulary.id',
      'document_vocab_candidates.document_id -> saved_documents.id',
    ],
    notes: [
      'Document and vocabulary data are split into dedicated SQLite files for the active runtime.',
      'tmp/test-db is used by browser/perf harnesses to isolate automation data.',
      'data/ocr-app.db still exists and may reflect an older combined-schema runtime.',
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
    groups: {
      browser_specs: tests.filter((item) => item.startsWith('e2e/')),
      gateway_specs: tests.filter((item) => item.startsWith('backend/gateway/')),
      agentic_specs: tests.filter((item) => item.includes('/agentic/')),
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
      perf_api: 'npm run perf:api',
      perf_browser: 'npm run perf:browser',
      perf_phase4: 'npm run perf:phase4',
      smoke: Array.from(ALLOWED_SMOKE_SCRIPTS),
    },
    files: tests,
  };
}

function buildEntryPointMap() {
  const rootScripts = Object.keys(getNpmScripts()).sort();
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
    root_scripts: rootScripts.map((name) => `npm run ${name}`),
    backend_entrypoints: [
      'backend/gateway/src/main.ts',
      'backend/services/ocr/src/main.ts',
      'backend/services/tts/src/main.ts',
      'backend/services/document/src/main.ts',
      'backend/services/vocabulary/src/main.ts',
      'backend/services/agentic/src/main.ts',
    ],
    browser_harnesses: [
      'scripts/e2e/prepare-browser-env.sh',
      'scripts/e2e/prepare-save-vocabulary-env.sh',
      'scripts/e2e/browser-stack.sh',
      'scripts/e2e/stop-browser-env.sh',
    ],
    perf_harnesses: [
      'scripts/perf/api-benchmark.mjs',
      'scripts/perf/browser-benchmark.mjs',
      'scripts/perf/run-phase4.sh',
    ],
  };
}

function buildDocsMap() {
  return {
    docs: buildDocCatalog(),
    notes: [
      'README.md is the user/operator entrypoint.',
      'structure.md is the closest thing to a repository contract.',
      'docs/agents/* is intentionally compact and captures architecture, runbook, and live context only.',
    ],
  };
}

function buildDatabaseOverview(databaseKey) {
  const requested = databaseKey ? [resolveDatabase(databaseKey)] : Object.entries(DATABASES).map(
    ([key, value]) => ({ key, ...value }),
  );

  return requested.map(({ key, path: dbPath, db }) => {
    if (!fs.existsSync(dbPath)) {
      return {
        database: key,
        path: path.relative(ROOT, dbPath),
        exists: false,
        tables: [],
      };
    }

    const activeDb = db || new Database(dbPath, { readonly: true });
    try {
      const tables = activeDb.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `).all().map((row) => row.name);

      const views = activeDb.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'view'
        ORDER BY name ASC
      `).all().map((row) => row.name);

      return {
        database: key,
        path: path.relative(ROOT, dbPath),
        exists: true,
        tables,
        views,
      };
    } finally {
      if (!db) {
        activeDb.close();
      }
    }
  });
}

function listProjectLogs(scope = 'all') {
  const includeRuntime = scope === 'all' || scope === 'runtime';
  const includePerf = scope === 'all' || scope === 'perf';
  const result = {};

  if (includeRuntime) {
    result.runtime = fs.existsSync(RUNTIME_LOG_DIR)
      ? fs.readdirSync(RUNTIME_LOG_DIR).filter(Boolean).sort()
      : [];
  }

  if (includePerf) {
    result.perf = fs.existsSync(PERF_LOG_DIR)
      ? fs.readdirSync(PERF_LOG_DIR).filter(Boolean).sort()
      : [];
  }

  return result;
}

function getNpmScripts() {
  const pkg = JSON.parse(fs.readFileSync(ROOT_PACKAGE_JSON, 'utf8'));
  return pkg.scripts || {};
}

function getAllowedRootScripts() {
  const scripts = getNpmScripts();
  return Object.keys(scripts)
    .filter((name) =>
      /^(bootstrap:js|build(?::|$)|test(?::|$)|smoke(?::|$)|perf(?::|$))/.test(name),
    )
    .sort();
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
    name: 'architecture_map',
    description:
      'Detailed architecture map of runtime topology, codebase layering, storage, constraints, and key docs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'api_map',
    description:
      'Compact map of the gateway HTTP API grouped by controller area and route family.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'route_trace',
    description:
      'Finds the gateway controller, module, and likely spec file for a given HTTP method and route path.',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['path'],
    },
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
    name: 'docs_map',
    description:
      'Map of project documentation files and the role each one plays during maintenance and development.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'service_inventory',
    description:
      'Inventory of gateway controllers/modules, TCP service entrypoints, sidecars, and launcher files.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'config_map',
    description:
      'Summarizes root/workspace package scripts, launcher defaults, and .env keys with secret values redacted.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dependency_map',
    description:
      'Maps workspace package relationships plus declared external dependencies. Useful for understanding architectural coupling quickly.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'env_map',
    description:
      'Shows important environment variables, whether they are present in .env or process env, and redacted values when safe.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'repo_tree',
    description:
      'Returns a bounded directory tree for any project path. Useful for understanding an area before reading files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        max_depth: { type: 'integer', minimum: 0, maximum: 6 },
        include_files: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 2000 },
      },
    },
  },
  {
    name: 'feature_map',
    description:
      'Searches the repo for a concept or feature term and groups matching files/snippets by docs, frontend, backend, tests, and scripts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['query'],
    },
  },
  {
    name: 'import_graph',
    description:
      'Shows direct imports from one file plus heuristic reverse references from other project files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        max_callers: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['path'],
    },
  },
  {
    name: 'test_coverage_map',
    description:
      'Maps likely direct and nearby tests for a project file and suggests the most relevant test commands.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'discover_api_routes',
    description:
      'Discovers gateway HTTP routes directly from controller decorators instead of relying on static docs.',
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
    name: 'run_root_script',
    description:
      'Runs one safe root npm script for build/test/smoke/perf flows so common verification does not require manual shell use.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          enum: getAllowedRootScripts(),
        },
      },
      required: ['script'],
    },
  },
  {
    name: 'git_status',
    description:
      'Returns concise git working tree status and branch/head information for the project.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'git_diff_summary',
    description:
      'Returns a compact git diff summary, optionally narrowed to one project path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        staged: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_npm_scripts',
    description:
      'Lists root package.json scripts so development, build, smoke, test, and perf entrypoints are visible through MCP.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_project_logs',
    description:
      'Lists available runtime and perf log filenames so the right log can be tailed without guessing.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'runtime', 'perf'] },
      },
    },
  },
  {
    name: 'list_test_results',
    description:
      'Lists Playwright/Jest test-result artifacts under test-results so failures can be inspected without guessing paths.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 400 },
      },
    },
  },
  {
    name: 'read_test_artifact',
    description:
      'Reads a text test artifact from test-results such as error-context.md, logs, or JSON output. Binary files return metadata only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        lines: { type: 'integer', minimum: 1, maximum: 400 },
      },
      required: ['path'],
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
    name: 'log_diagnose',
    description:
      'Analyzes the tail of a runtime log and highlights likely failure signatures with concise recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        lines: { type: 'integer', minimum: 20, maximum: 400 },
      },
      required: ['filename'],
    },
  },
  {
    name: 'db_overview',
    description:
      'Lists project SQLite databases with table and view names. Useful before running targeted read-only queries.',
    inputSchema: {
      type: 'object',
      properties: {
        database: {
          type: 'string',
          enum: Object.keys(DATABASES),
        },
      },
    },
  },
  {
    name: 'db_query',
    description:
      'Executes a read-only SQLite query against one project database. Only SELECT/EXPLAIN and schema PRAGMA statements are allowed.',
    inputSchema: {
      type: 'object',
      properties: {
        database: {
          type: 'string',
          enum: Object.keys(DATABASES),
        },
        sql: { type: 'string' },
        params: {
          description: 'Optional JSON array of positional bind parameters.',
          oneOf: [
            { type: 'array' },
            { type: 'string' },
          ],
        },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
      },
      required: ['database', 'sql'],
    },
  },
  {
    name: 'db_schema',
    description:
      'Returns columns, indexes, and foreign keys for tables in one project SQLite database.',
    inputSchema: {
      type: 'object',
      properties: {
        database: {
          type: 'string',
          enum: Object.keys(DATABASES),
        },
        table: { type: 'string' },
      },
      required: ['database'],
    },
  },
  {
    name: 'process_snapshot',
    description:
      'Lists currently running project-related processes such as gateway, services, sidecars, Playwright, and LM Studio.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'port_status',
    description:
      'Checks whether known project ports are currently reachable on localhost. Extra custom ports may be supplied.',
    inputSchema: {
      type: 'object',
      properties: {
        extra_ports: {
          description: 'Optional list of extra TCP ports to probe.',
          oneOf: [
            { type: 'array' },
            { type: 'string' },
          ],
        },
      },
    },
  },
  {
    name: 'git_recent_commits',
    description:
      'Returns recent git commits for the repo, optionally narrowed to a project path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'stack_start',
    description:
      'Starts the local OCR app stack through the project launcher and returns the launcher output.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'stack_stop',
    description:
      'Stops the local OCR app stack through the project launcher and returns the launcher output.',
    inputSchema: { type: 'object', properties: {} },
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
    name: 'prepare_browser_e2e',
    description:
      'Runs scripts/e2e/prepare-browser-env.sh to clean tmp test DBs and rebuild frontend/backend before browser e2e.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'stop_browser_e2e',
    description:
      'Runs scripts/e2e/stop-browser-env.sh to stop browser-e2e ports and background services.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'run_browser_e2e',
    description:
      'Runs browser Playwright e2e via the project workflow. Optionally prepare the env first, target one spec, set a config, and control workers.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        config: { type: 'string' },
        workers: { type: 'integer', minimum: 1, maximum: 8 },
        prepare: { type: 'boolean' },
      },
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
  { name: 'ocr-project', version: '2.7.0' },
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

    if (name === 'architecture_map') {
      return okJson(buildArchitectureMap());
    }

    if (name === 'api_map') {
      return okJson(buildApiMap());
    }

    if (name === 'route_trace') {
      return okJson(buildRouteTrace(args.method, args.path));
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

    if (name === 'docs_map') {
      return okJson(buildDocsMap());
    }

    if (name === 'service_inventory') {
      return okJson(buildServiceInventory());
    }

    if (name === 'config_map') {
      return okJson(buildConfigMap());
    }

    if (name === 'dependency_map') {
      return okJson(buildDependencyMap());
    }

    if (name === 'env_map') {
      return okJson(buildEnvMap());
    }

    if (name === 'repo_tree') {
      return okJson(buildRepoTree(String(args.path || '.'), {
        maxDepth: args.max_depth,
        includeFiles: args.include_files,
        limit: args.limit,
      }));
    }

    if (name === 'feature_map') {
      return okJson(await buildFeatureMap(args.query, args.limit));
    }

    if (name === 'import_graph') {
      return okJson(buildImportGraph(args.path, args.max_callers));
    }

    if (name === 'test_coverage_map') {
      return okJson(buildTestCoverageMap(args.path));
    }

    if (name === 'discover_api_routes') {
      return okJson(discoverGatewayRoutes());
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

    if (name === 'run_root_script') {
      const script = String(args.script || '');
      const allowedScripts = getAllowedRootScripts();
      if (!allowedScripts.includes(script)) {
        return errorText(
          `Unsupported root script "${script}". Allowed: ${allowedScripts.join(', ')}`,
        );
      }

      const { stdout, stderr } = await execFileAsync(
        'npm',
        ['run', script],
        { cwd: ROOT, timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
      );

      return okJson({
        script,
        ok: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    }

    if (name === 'stack_start') {
      return okJson(await runLauncherCommand(null));
    }

    if (name === 'stack_stop') {
      return okJson(await runLauncherCommand('stop'));
    }

    if (name === 'git_status') {
      const branch = await runCommandCapture(
        'git',
        ['branch', '--show-current'],
        { cwd: ROOT, timeout: 15_000 },
      );
      const head = await runCommandCapture(
        'git',
        ['rev-parse', '--short', 'HEAD'],
        { cwd: ROOT, timeout: 15_000 },
      );
      const status = await runCommandCapture(
        'git',
        ['status', '--short', '--branch'],
        { cwd: ROOT, timeout: 15_000 },
      );
      return okJson({
        branch: branch.stdout,
        head: head.stdout,
        status,
      });
    }

    if (name === 'git_diff_summary') {
      const diffArgs = ['diff', '--stat=120'];
      if (Boolean(args.staged)) {
        diffArgs.push('--cached');
      }
      if (args.path) {
        const filePath = ensureProjectRelativeFile(args.path);
        diffArgs.push('--', path.relative(ROOT, filePath));
      }
      const result = await runCommandCapture('git', diffArgs, { cwd: ROOT, timeout: 30_000 });
      return okJson({
        path: args.path ? path.relative(ROOT, ensureProjectRelativeFile(args.path)) : null,
        staged: Boolean(args.staged),
        ...result,
      });
    }

    if (name === 'list_npm_scripts') {
      return okJson(getNpmScripts());
    }

    if (name === 'list_project_logs') {
      const scope = String(args.scope || 'all');
      if (!['all', 'runtime', 'perf'].includes(scope)) {
        return errorText('scope must be one of: all, runtime, perf');
      }
      return okJson(listProjectLogs(scope));
    }

    if (name === 'list_test_results') {
      return okJson(listTestResultArtifacts(args.query, args.limit));
    }

    if (name === 'read_test_artifact') {
      const filePath = resolveTestArtifactPath(args.path);
      const relative = path.relative(TEST_RESULTS_DIR, filePath).replace(/\\/g, '/');
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        return okJson({
          path: relative,
          type: 'directory',
          entries: fs.readdirSync(filePath).sort(),
        });
      }

      if (!isReadableTextArtifact(filePath)) {
        return okJson({
          path: relative,
          type: 'binary',
          size_bytes: stat.size,
        });
      }

      const lineCount = normalizeLimit(args.lines, 120, 400);
      const { stdout } = await execFileAsync(
        'tail',
        ['-n', String(lineCount), filePath],
        { cwd: ROOT, timeout: 15_000, maxBuffer: 1024 * 1024 },
      );
      return okJson({
        path: relative,
        type: 'text',
        lines: lineCount,
        output: stdout,
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

    if (name === 'log_diagnose') {
      return okJson(await buildLogDiagnose(args.filename, args.lines));
    }

    if (name === 'db_overview') {
      return okJson(buildDatabaseOverview(args.database ? String(args.database) : null));
    }

    if (name === 'db_query') {
      const database = resolveDatabase(args.database);
      const sql = ensureSafeReadOnlySql(args.sql);
      const params = parseJsonArray(args.params, []);
      const limit = normalizeLimit(args.limit, 100, 500);

      if (!fs.existsSync(database.path)) {
        return errorText(`Database file does not exist: ${path.relative(ROOT, database.path)}`);
      }

      const activeDb = database.db || new Database(database.path, { readonly: true });
      try {
        const stmt = activeDb.prepare(sql);
        if (!stmt.reader) {
          return errorText('Query must be read-only');
        }

        let rows = stmt.all(...params);
        if (Array.isArray(rows)) {
          rows = rows.slice(0, limit);
        }

        return okJson({
          database: database.key,
          path: path.relative(ROOT, database.path),
          sql,
          params,
          row_count: Array.isArray(rows) ? rows.length : 0,
          rows,
        });
      } finally {
        if (!database.db) {
          activeDb.close();
        }
      }
    }

    if (name === 'db_schema') {
      return okJson(buildDatabaseSchema(
        String(args.database || ''),
        args.table ? String(args.table) : null,
      ));
    }

    if (name === 'process_snapshot') {
      return okJson(await getProcessSnapshot());
    }

    if (name === 'port_status') {
      return okJson(await buildPortStatus(parseJsonArray(args.extra_ports, [])));
    }

    if (name === 'git_recent_commits') {
      const limit = normalizeLimit(args.limit, 10, 50);
      const gitArgs = ['log', `--max-count=${limit}`, '--date=iso', '--pretty=format:%h%x09%ad%x09%an%x09%s'];
      if (args.path) {
        const filePath = ensureProjectRelativeFile(args.path);
        gitArgs.push('--', path.relative(ROOT, filePath));
      }
      const result = await runCommandCapture('git', gitArgs, { cwd: ROOT, timeout: 30_000 });
      return okJson({
        path: args.path ? path.relative(ROOT, ensureProjectRelativeFile(args.path)) : null,
        limit,
        ...result,
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

    if (name === 'prepare_browser_e2e') {
      const result = await runCommandCapture(
        'bash',
        [PREPARE_BROWSER_ENV_SCRIPT],
        { cwd: ROOT, timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
      );
      return okJson(result);
    }

    if (name === 'stop_browser_e2e') {
      const result = await runCommandCapture(
        'bash',
        [STOP_BROWSER_ENV_SCRIPT],
        { cwd: ROOT, timeout: 2 * 60 * 1000, maxBuffer: 5 * 1024 * 1024 },
      );
      return okJson(result);
    }

    if (name === 'run_browser_e2e') {
      const workers = normalizeLimit(args.workers, 4, 8);
      const shouldPrepare = Boolean(args.prepare);
      const config = args.config ? String(args.config).trim() : '';
      const relative = args.path
        ? path.relative(ROOT, ensureProjectRelativeFile(args.path)).replace(/\\/g, '/')
        : null;

      if (relative) {
        ensureSupportedTestFile(ensureProjectRelativeFile(args.path), [
          /^.*\/e2e\/.*\.(spec|test)\.(ts|tsx|js|mjs)$/,
        ]);
      }

      if (config) {
        const configPath = ensureProjectRelativeFile(config);
        if (!/\.(c|m)?ts$|\.js$|\.mjs$/i.test(configPath)) {
          return errorText('config must point to a Playwright config file');
        }
      }

      if (shouldPrepare) {
        const prep = await runCommandCapture(
          'bash',
          [PREPARE_BROWSER_ENV_SCRIPT],
          { cwd: ROOT, timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
        );
        if (!prep.ok) {
          return okJson({ prepare: prep, test: null });
        }
      }

      const testArgs = ['playwright', 'test'];
      if (relative) {
        testArgs.push(relative);
      }
      if (config) {
        testArgs.push('--config', path.relative(ROOT, ensureProjectRelativeFile(config)));
      }
      testArgs.push('--workers', String(workers));

      const test = await runCommandCapture(
        'npx',
        testArgs,
        { cwd: ROOT, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
      );

      return okJson({
        prepared: shouldPrepare,
        path: relative,
        config: config || null,
        workers,
        test,
      });
    }

    if (name === 'recommend_test_strategy') {
      const filePath = ensureProjectRelativeFile(args.path);
      const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');
      const recommendations = [];

      if (relative.startsWith('frontend/')) {
        recommendations.push('Primary: run_frontend_unit_test on the nearest *.spec.tsx/*.spec.ts file.');
        recommendations.push('Fallback: npm run test:frontend');
        recommendations.push('If UI flow changed: run_browser_e2e with prepare=true or run_playwright_test on the relevant e2e spec.');
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
        recommendations.push('If browser stack is stale: prepare_browser_e2e, then rerun.');
        recommendations.push('If a failure leaves artifacts: list_test_results and read_test_artifact on error-context.md.');
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
