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
      'get_document',
      'get_project_health',
      'list_documents',
      'list_due_vocabulary',
      'list_practice_sessions',
      'read_runtime_log',
      'search_vocabulary',
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

    const summary = {
      tool_count: toolNames.length,
      resource_count: resourceUris.length,
      sample_tools: toolNames.slice(0, 8),
      sample_resources: resourceUris.slice(0, 5),
      list_documents_preview: documentsResult.content[0]?.text?.slice(0, 240) || '',
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
