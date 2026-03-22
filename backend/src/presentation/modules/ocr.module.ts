import { Module } from '@nestjs/common';
import { OcrController } from '../controllers/ocr.controller';
import { ProcessImageUseCase } from '../../application/use-cases/process-image.use-case';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { ITextStructuringService } from '../../domain/ports/text-structuring-service.port';
import { LMStudioOCRService } from '../../infrastructure/lm-studio/lm-studio-ocr.service';
import { LMStudioStructuringService } from '../../infrastructure/lm-studio/lm-studio-structuring.service';
import { PaddleOCRService } from '../../infrastructure/paddleocr/paddleocr-ocr.service';
import { PaddleOCRConfig } from '../../infrastructure/config/paddleocr.config';
import { PaddleOCRHealthService } from '../../infrastructure/paddleocr/paddleocr-health.service';
import { IPaddleOcrHealthPort } from '../../domain/ports/paddle-ocr-health.port';
import { LmStudioModule } from './lm-studio.module';
import { PassthroughStructuringService } from '../../infrastructure/testing/passthrough-structuring.service';

const LM_STUDIO_SMOKE_ONLY = process.env.LM_STUDIO_SMOKE_ONLY === 'true';

/**
 * OCR Module Configuration
 *
 * OCR extraction is always delegated to the local PaddleOCR sidecar.
 * LM Studio remains responsible only for structuring PaddleOCR raw text
 * into Markdown.
 */
@Module({
  imports: [LmStudioModule],
  controllers: [OcrController],
  providers: [
    PaddleOCRConfig,
    PaddleOCRHealthService,
    LMStudioOCRService,
    LMStudioStructuringService,
    PassthroughStructuringService,
    PaddleOCRService,

    { provide: IOCRService, useExisting: PaddleOCRService },
    {
      provide: ITextStructuringService,
      useClass: LM_STUDIO_SMOKE_ONLY
        ? PassthroughStructuringService
        : LMStudioStructuringService,
    },
    { provide: IPaddleOcrHealthPort, useExisting: PaddleOCRHealthService },

    ProcessImageUseCase,
  ],
  exports: [
    PaddleOCRConfig,
    PaddleOCRHealthService,
    IPaddleOcrHealthPort,
  ],
})
export class OcrModule {}
