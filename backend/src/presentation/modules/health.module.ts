import { Module } from '@nestjs/common';
import { HealthController } from '../controllers/health.controller';
import { HealthCheckUseCase } from '../../application/use-cases/health-check.use-case';
import { OcrModule } from './ocr.module';

@Module({
  imports: [OcrModule],
  controllers: [HealthController],
  providers: [HealthCheckUseCase],
})
export class HealthModule {}
