import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { deploymentOutputGuardrail } from './deployment-output.guardrails';

describe('deployment-output.guardrails', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deployment-guardrail-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('triggers when the output does not match the deployment schema', async () => {
    const result = await deploymentOutputGuardrail.execute({
      agentOutput: { rootDir: tempDir },
    } as any);

    expect(result.tripwireTriggered).toBe(true);
    expect(result.outputInfo).toBeTruthy();
  });

  it('passes when all artifacts exist on disk', async () => {
    const artifactPath = join(tempDir, 'README.md');
    writeFileSync(artifactPath, '# Runtime', 'utf8');

    await expect(
      deploymentOutputGuardrail.execute({
        agentOutput: {
          workspaceName: 'runtime',
          rootDir: tempDir,
          summary: 'Deployment summary',
          generatedFiles: [artifactPath],
          artifacts: [
            {
              path: artifactPath,
              kind: 'file',
              status: 'created',
            },
          ],
        },
      } as any),
    ).resolves.toEqual({
      tripwireTriggered: false,
      outputInfo: {
        artifactsExist: true,
        generatedFiles: 1,
        artifacts: 1,
      },
    });
  });

  it('triggers when reported artifacts are missing from disk', async () => {
    const artifactPath = join(tempDir, 'missing.md');

    await expect(
      deploymentOutputGuardrail.execute({
        agentOutput: {
          workspaceName: 'runtime',
          rootDir: tempDir,
          summary: 'Deployment summary',
          generatedFiles: [artifactPath],
          artifacts: [
            {
              path: artifactPath,
              kind: 'file',
              status: 'created',
            },
          ],
        },
      } as any),
    ).resolves.toEqual({
      tripwireTriggered: true,
      outputInfo: {
        artifactsExist: false,
        generatedFiles: 1,
        artifacts: 1,
      },
    });
  });
});
