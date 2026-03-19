import { Module } from '@nestjs/common';
import { OcrController } from '../controllers/ocr.controller';
import { ProcessImageUseCase } from '../../application/use-cases/process-image.use-case';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { ITextStructuringService } from '../../domain/ports/text-structuring-service.port';
import { LMStudioOCRService } from '../../infrastructure/lm-studio/lm-studio-ocr.service';
import { LMStudioStructuringService } from '../../infrastructure/lm-studio/lm-studio-structuring.service';
import { LMStudioClient } from '../../infrastructure/lm-studio/lm-studio.client';
import { LMStudioConfig } from '../../infrastructure/config/lm-studio.config';
import { PaddleOCRService } from '../../infrastructure/paddleocr/paddleocr-ocr.service';
import { PaddleOCRConfig } from '../../infrastructure/config/paddleocr.config';
import { PaddleOCRHealthService } from '../../infrastructure/paddleocr/paddleocr-health.service';

/**
 * OCR Module Configuration
 *
 * OCR extraction is always delegated to the local PaddleOCR sidecar.
 * LM Studio remains responsible only for structuring PaddleOCR raw text
 * into Markdown.
 */
@Module({
  controllers: [OcrController],
  providers: [
    // Configuration services
    LMStudioConfig,
    PaddleOCRConfig,
    PaddleOCRHealthService,
    LMStudioOCRService,
    LMStudioStructuringService,
    PaddleOCRService,

    // Client for LM Studio communication
    LMStudioClient,

    {
      provide: IOCRService,
      useExisting: PaddleOCRService,
    },

    // Text structuring service (LM Studio only)
    {
      provide: ITextStructuringService,
      useExisting: LMStudioStructuringService,
    },

    ProcessImageUseCase,
  ],
  exports: [
    LMStudioConfig,
    PaddleOCRConfig,
    LMStudioClient,
    PaddleOCRHealthService,
  ],
})
export class OcrModule {}
