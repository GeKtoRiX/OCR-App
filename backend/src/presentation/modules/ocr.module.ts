import { Module } from '@nestjs/common';
import { OcrController } from '../controllers/ocr.controller';
import { ProcessImageUseCase } from '../../application/use-cases/process-image.use-case';
import { IOcrHealthPort } from '../../domain/ports/ocr-health.port';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { OcrConcurrencyService } from '../../infrastructure/concurrency/ocr-concurrency.service';
import { LmStudioModule } from './lm-studio.module';
import { LMStudioOCRService } from '../../infrastructure/lm-studio/lm-studio-ocr.service';
import { LMStudioOcrHealthService } from '../../infrastructure/lm-studio/lm-studio-ocr-health.service';

@Module({
  imports: [LmStudioModule],
  controllers: [OcrController],
  providers: [
    LMStudioOcrHealthService,
    LMStudioOCRService,
    OcrConcurrencyService,

    { provide: IOCRService, useExisting: LMStudioOCRService },
    { provide: IOcrHealthPort, useExisting: LMStudioOcrHealthService },

    ProcessImageUseCase,
  ],
  exports: [
    LMStudioOcrHealthService,
    IOcrHealthPort,
  ],
})
export class OcrModule {}
