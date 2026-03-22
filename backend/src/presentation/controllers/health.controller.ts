import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheckUseCase } from '../../application/use-cases/health-check.use-case';
import { HealthCheckOutput } from '../../application/dto/health-check.dto';

@Controller('api')
export class HealthController {
  constructor(private readonly healthCheck: HealthCheckUseCase) {}

  @Get('health')
  @SkipThrottle()
  async getHealth(): Promise<HealthCheckOutput> {
    return this.healthCheck.execute();
  }
}
