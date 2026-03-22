import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import {
  createWorkspaceTool,
  summarizeBundleTool,
  writeBundleTool,
} from './deployment-tools';
import type { AutonomousArchitecturePlan } from '../core/agent-ecosystem.schemas';

function createPlan(): AutonomousArchitecturePlan {
  return {
    request: 'Generate an OCR agent ecosystem',
    analysis: {
      stage: 'analyze',
      summary: 'analysis summary',
      dependencyTree: [
        {
          id: 'analysis-node',
          description: 'analysis dependency',
          dependsOn: [],
        },
      ],
      scaffold: [
        {
          path: 'backend/src/agentic/core',
          purpose: 'core folder',
        },
      ],
      agentBlueprints: [
        {
          name: 'Analyze Agent',
          role: 'analysis',
          instructionsSummary: 'analyze the system',
          model: 'gpt-5',
          reasoningEffort: 'high',
          handoffTargets: ['Scaffold Agent'],
          guardrails: ['analyze-phase-output'],
        },
      ],
      decisions: ['Keep agentic isolated'],
    },
    scaffold: {
      stage: 'scaffold',
      summary: 'scaffold summary',
      dependencyTree: [],
      scaffold: [
        {
          path: 'backend/src/agentic/core',
          purpose: 'core folder',
        },
        {
          path: 'backend/src/agentic/tools',
          purpose: 'tools folder',
        },
      ],
      agentBlueprints: [
        {
          name: 'Scaffold Agent',
          role: 'scaffold',
          instructionsSummary: 'create folders',
          model: 'gpt-5-mini',
          reasoningEffort: 'medium',
          handoffTargets: ['Initialization Agent'],
          guardrails: ['scaffold-phase-output'],
        },
      ],
      decisions: ['Mirror backend/src/agentic'],
    },
    initialization: {
      stage: 'initialize',
      summary: 'initialization summary',
      dependencyTree: [],
      scaffold: [
        {
          path: 'backend/src/agentic/application',
          purpose: 'application folder',
        },
      ],
      agentBlueprints: [
        {
          name: 'Initialization Agent',
          role: 'bootstrap',
          instructionsSummary: 'wire the runtime',
          model: 'gpt-5',
          reasoningEffort: 'high',
          handoffTargets: [],
          guardrails: ['initialize-phase-output', 'deployment-output'],
        },
      ],
      decisions: ['Keep tracing enabled'],
    },
    tracing: {
      enabled: true,
      workflowName: 'autonomous-agent-ecosystem',
    },
  };
}

describe('deployment-tools', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deployment-tools-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a workspace scaffold inside the deployment root', async () => {
    const result = await createWorkspaceTool.invoke(
      {} as any,
      JSON.stringify({
        rootDir: tempDir,
        workspaceName: 'ocr-runtime',
        scaffoldPaths: [
          'backend/src/agentic/core',
          'backend/src/agentic/tools',
        ],
      }),
    );

    expect(result.workspaceRoot).toBe(resolve(tempDir, 'ocr-runtime'));
    expect(existsSync(resolve(tempDir, 'ocr-runtime/core'))).toBe(true);
    expect(existsSync(resolve(tempDir, 'ocr-runtime/tools'))).toBe(true);
    expect(result.artifacts[0]).toEqual({
      path: resolve(tempDir, 'ocr-runtime'),
      kind: 'directory',
      status: 'created',
    });

    const rerun = await createWorkspaceTool.invoke(
      {} as any,
      JSON.stringify({
        rootDir: tempDir,
        workspaceName: 'ocr-runtime',
        scaffoldPaths: [
          'backend/src/agentic/core',
          'backend/src/agentic/tools',
        ],
      }),
    );

    expect(rerun.artifacts.every((artifact) => artifact.status === 'updated')).toBe(
      true,
    );
  });

  it('rejects workspace paths outside the deployment root', async () => {
    await expect(
      createWorkspaceTool.invoke(
        {} as any,
        JSON.stringify({
          rootDir: tempDir,
          workspaceName: '../escape',
          scaffoldPaths: ['backend/src/agentic/core'],
        }),
      ),
    ).resolves.toContain('Target path is outside the deployment root');
  });

  it('writes the runtime bundle and reports updated files on rerun', async () => {
    const plan = createPlan();

    const firstRun = await writeBundleTool.invoke(
      {} as any,
      JSON.stringify({
        rootDir: tempDir,
        workspaceName: 'ocr-runtime',
        plan,
      }),
    );

    expect(firstRun.generatedFiles).toEqual([
      resolve(tempDir, 'ocr-runtime/architecture-plan.json'),
      resolve(tempDir, 'ocr-runtime/README.md'),
      resolve(tempDir, 'ocr-runtime/agents.ts'),
      resolve(tempDir, 'ocr-runtime/guardrails.ts'),
      resolve(tempDir, 'ocr-runtime/runtime-config.ts'),
    ]);
    expect(readFileSync(resolve(tempDir, 'ocr-runtime/README.md'), 'utf8')).toContain(
      'Request: Generate an OCR agent ecosystem',
    );
    expect(readFileSync(resolve(tempDir, 'ocr-runtime/agents.ts'), 'utf8')).toContain(
      'generatedAgentBlueprints',
    );
    expect(readFileSync(resolve(tempDir, 'ocr-runtime/guardrails.ts'), 'utf8')).toContain(
      'initialize-phase-output',
    );
    expect(
      readFileSync(resolve(tempDir, 'ocr-runtime/runtime-config.ts'), 'utf8'),
    ).toContain("export const tracingWorkflowName = 'autonomous-agent-ecosystem';");

    const secondRun = await writeBundleTool.invoke(
      {} as any,
      JSON.stringify({
        rootDir: tempDir,
        workspaceName: 'ocr-runtime',
        plan,
      }),
    );

    expect(secondRun.artifacts.every((artifact) => artifact.status === 'updated')).toBe(
      true,
    );
  });

  it('summarizes the generated bundle from the workspace README', async () => {
    const plan = createPlan();

    await writeBundleTool.invoke(
      {} as any,
      JSON.stringify({
        rootDir: tempDir,
        workspaceName: 'ocr-runtime',
        plan,
      }),
    );

    const result = await summarizeBundleTool.invoke(
      {} as any,
      JSON.stringify({
        rootDir: tempDir,
        workspaceName: 'ocr-runtime',
      }),
    );

    expect(result.rootDir).toBe(resolve(tempDir, 'ocr-runtime'));
    expect(result.relativePath).toEqual(expect.stringContaining('ocr-runtime'));
    expect(result.summary).toContain('Generated Agent Ecosystem');
    expect(result.summary).toContain('Generate an OCR agent ecosystem');
  });
});
