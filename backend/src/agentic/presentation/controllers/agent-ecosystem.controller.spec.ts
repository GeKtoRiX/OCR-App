import { BadRequestException } from '@nestjs/common';
import { AgentEcosystemController } from './agent-ecosystem.controller';
import { AgentEcosystemService } from '../../application/agent-ecosystem.service';

describe('AgentEcosystemController', () => {
  let controller: AgentEcosystemController;
  let service: jest.Mocked<AgentEcosystemService>;

  beforeEach(() => {
    service = {
      execute: jest.fn().mockResolvedValue({ plan: 'architecture' } as any),
      deploy: jest.fn().mockResolvedValue({ deployment: 'done' } as any),
    } as unknown as jest.Mocked<AgentEcosystemService>;

    controller = new AgentEcosystemController(service);
  });

  it('trims the request before creating architecture', async () => {
    await expect(
      controller.createArchitecture({ request: '  design a system  ' } as any),
    ).resolves.toEqual({ plan: 'architecture' });
    expect(service.execute).toHaveBeenCalledWith('design a system');
  });

  it('rejects empty or missing architecture requests', async () => {
    await expect(controller.createArchitecture({ request: '   ' } as any)).rejects.toThrow(
      BadRequestException,
    );
    await expect(controller.createArchitecture(undefined as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('trims deploy request and workspace name before delegating', async () => {
    await expect(
      controller.deployArchitecture({
        request: '  deploy a system  ',
        workspaceName: '  team-workspace  ',
      } as any),
    ).resolves.toEqual({ deployment: 'done' });
    expect(service.deploy).toHaveBeenCalledWith({
      request: 'deploy a system',
      workspaceName: 'team-workspace',
    });
  });

  it('passes undefined workspace names through and rejects missing deploy requests', async () => {
    await controller.deployArchitecture({ request: 'deploy a system' } as any);
    expect(service.deploy).toHaveBeenCalledWith({
      request: 'deploy a system',
      workspaceName: undefined,
    });

    await expect(controller.deployArchitecture(undefined as any)).rejects.toThrow(
      BadRequestException,
    );
  });
});
