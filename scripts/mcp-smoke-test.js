#!/usr/bin/env node
'use strict';

const path = require('node:path');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function main() {
  const root = path.resolve(__dirname, '..');
  const client = new Client({
    name: 'ocr-app-mcp-smoke',
    version: '1.0.0',
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(root, 'scripts', 'mcp-server.js')],
    cwd: root,
    stderr: 'pipe',
  });

  let stderr = '';
  if (transport.stderr) {
    transport.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
  }

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    const requiredTools = [
      'db_overview',
      'debug_failed_document',
      'get_document',
      'get_gateway_json',
      'get_project_health',
      'list_documents',
      'list_due_vocabulary',
      'list_practice_sessions',
      'read_runtime_log',
      'search_vocabulary',
      'trace_word_lifecycle',
    ];

    for (const requiredTool of requiredTools) {
      if (!toolNames.includes(requiredTool)) {
        throw new Error(`Missing registered tool: ${requiredTool}`);
      }
    }

    const resources = await client.listResources();
    const resourceUris = resources.resources.map((resource) => resource.uri);
    if (!resourceUris.includes('ocr://project/overview')) {
      throw new Error('Missing resource ocr://project/overview');
    }

    const projectOverview = await client.readResource({
      uri: 'ocr://project/overview',
    });
    if (!projectOverview.contents?.length) {
      throw new Error('Project overview resource returned no contents');
    }

    const documentsResult = await client.callTool({
      name: 'list_documents',
      arguments: { limit: 2 },
    });
    if (!documentsResult.content?.length) {
      throw new Error('list_documents returned no content');
    }

    const dueVocabularyResult = await client.callTool({
      name: 'list_due_vocabulary',
      arguments: { limit: 2 },
    });
    if (!dueVocabularyResult.content?.length) {
      throw new Error('list_due_vocabulary returned no content');
    }

    const dueVocabulary = JSON.parse(dueVocabularyResult.content[0].text);
    if (!Array.isArray(dueVocabulary.results) || dueVocabulary.results.length === 0) {
      throw new Error('list_due_vocabulary returned no due words');
    }

    const tracedWord = dueVocabulary.results[0].word;
    const traceResult = await client.callTool({
      name: 'trace_word_lifecycle',
      arguments: { word: tracedWord, candidate_limit: 5, attempt_limit: 5 },
    });
    if (!traceResult.content?.length) {
      throw new Error('trace_word_lifecycle returned no content');
    }

    const summary = {
      tool_count: toolNames.length,
      resource_count: resourceUris.length,
      sample_tools: toolNames.slice(0, 8),
      sample_resources: resourceUris.slice(0, 5),
      list_documents_preview: documentsResult.content[0]?.text?.slice(0, 240) || '',
      traced_word: tracedWord,
      trace_preview: traceResult.content[0]?.text?.slice(0, 240) || '',
    };

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
