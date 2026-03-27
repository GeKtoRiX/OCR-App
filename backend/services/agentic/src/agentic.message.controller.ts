import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import {
  AGENTIC_PATTERNS,
  AgenticArchitecturePayload,
  AgenticArchitectureResponse,
  AgenticDeployPayload,
  AgenticDeployResponse,
} from '@ocr-app/shared';
import { AgentEcosystemService } from '@backend/agentic/application/agent-ecosystem.service';

@Controller()
export class AgenticMessageController {
  constructor(private readonly service: AgentEcosystemService) {}

  @MessagePattern(AGENTIC_PATTERNS.ARCHITECTURE)
  async createArchitecture(
    payload: AgenticArchitecturePayload,
  ): Promise<AgenticArchitectureResponse> {
    if (!payload?.request?.trim()) {
      throw new RpcException({
        statusCode: 400,
        message: 'Field "request" is required',
      });
    }
    try {
      return (await this.service.execute(
        payload.request.trim(),
      )) as AgenticArchitectureResponse;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate architecture';
      throw new RpcException({ statusCode: 502, message });
    }
  }

  @MessagePattern(AGENTIC_PATTERNS.DEPLOY)
  async deploy(
    payload: AgenticDeployPayload,
  ): Promise<AgenticDeployResponse> {
    if (!payload?.request?.trim()) {
      throw new RpcException({
        statusCode: 400,
        message: 'Field "request" is required',
      });
    }
    try {
      return (await this.service.deploy({
        request: payload.request.trim(),
        workspaceName: payload.workspaceName?.trim(),
      })) as AgenticDeployResponse;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to deploy architecture';
      throw new RpcException({ statusCode: 502, message });
    }
  }
}
