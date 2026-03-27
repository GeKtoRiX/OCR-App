import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  AGENTIC_PATTERNS,
  AgenticArchitecturePayload,
  AgenticArchitectureResponse,
  AgenticDeployPayload,
  AgenticDeployResponse,
} from '@ocr-app/shared';
import { asUpstreamHttpError } from '../upstream-http-error';

@Controller('api/agents')
export class GatewayAgenticController {
  constructor(
    @Inject('AGENTIC_SERVICE') private readonly agenticClient: ClientProxy,
  ) {}

  @Post('architecture')
  async createArchitecture(
    @Body() body: AgenticArchitecturePayload,
  ): Promise<AgenticArchitectureResponse> {
    if (!body.request?.trim()) {
      throw new BadRequestException('Field "request" is required');
    }
    return this.send<AgenticArchitecturePayload, AgenticArchitectureResponse>(
      AGENTIC_PATTERNS.ARCHITECTURE,
      { request: body.request.trim() },
    );
  }

  @Post('deploy')
  async deployArchitecture(
    @Body() body: AgenticDeployPayload,
  ): Promise<AgenticDeployResponse> {
    if (!body.request?.trim()) {
      throw new BadRequestException('Field "request" is required');
    }
    return this.send<AgenticDeployPayload, AgenticDeployResponse>(
      AGENTIC_PATTERNS.DEPLOY,
      {
        request: body.request.trim(),
        workspaceName: body.workspaceName?.trim(),
      },
    );
  }

  private async send<TPayload, TResult>(
    pattern: string,
    payload: TPayload,
  ): Promise<TResult> {
    try {
      return await lastValueFrom(
        this.agenticClient.send<TResult, TPayload>(pattern, payload),
      );
    } catch (error) {
      throw asUpstreamHttpError(error, 'Agentic service request failed');
    }
  }
}
