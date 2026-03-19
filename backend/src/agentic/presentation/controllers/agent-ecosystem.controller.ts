import {
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { AgentEcosystemService } from '../../application/agent-ecosystem.service';
import { AgentDeploymentRequestDto } from '../dto/agent-deployment-request.dto';
import { AgentDeploymentResponseDto } from '../dto/agent-deployment-response.dto';
import { AgentEcosystemRequestDto } from '../dto/agent-ecosystem-request.dto';
import { AgentEcosystemResponseDto } from '../dto/agent-ecosystem-response.dto';

@Controller('api/agents')
export class AgentEcosystemController {
  constructor(private readonly service: AgentEcosystemService) {}

  @Post('architecture')
  async createArchitecture(
    @Body() body: AgentEcosystemRequestDto,
  ): Promise<AgentEcosystemResponseDto> {
    if (!body?.request || !body.request.trim()) {
      throw new BadRequestException('Field "request" is required');
    }

    return this.service.execute(body.request.trim());
  }

  @Post('deploy')
  async deployArchitecture(
    @Body() body: AgentDeploymentRequestDto,
  ): Promise<AgentDeploymentResponseDto> {
    if (!body?.request || !body.request.trim()) {
      throw new BadRequestException('Field "request" is required');
    }

    return this.service.deploy({
      request: body.request.trim(),
      workspaceName: body.workspaceName?.trim(),
    });
  }
}
