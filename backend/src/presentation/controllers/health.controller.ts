import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthCheckUseCase } from '../../application/use-cases/health-check.use-case';

@Controller('api')
export class HealthController {
  constructor(private readonly healthCheck: HealthCheckUseCase) {}

  @Get('health')
  async getHealth(@Res() res: Response): Promise<void> {
    const result = await this.healthCheck.execute();

    const statusCode = result.paddleOcrReachable && result.lmStudioReachable
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(statusCode).json(result);
  }
}
