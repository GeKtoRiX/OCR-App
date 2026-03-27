import { Module } from '@nestjs/common';
import {
  ILmStudioHealthPort as SharedLmStudioHealthPort,
  IOCRService as SharedOcrService,
  IPaddleOcrHealthPort as SharedPaddleOcrHealthPort,
  ITextStructuringService as SharedTextStructuringService,
} from '@ocr-app/shared';
import { ProcessImageUseCase } from '@backend/application/use-cases/process-image.use-case';
import { ILmStudioHealthPort } from '@backend/domain/ports/lm-studio-health.port';
import { IOCRService } from '@backend/domain/ports/ocr-service.port';
import { IPaddleOcrHealthPort } from '@backend/domain/ports/paddle-ocr-health.port';
import { ITextStructuringService } from '@backend/domain/ports/text-structuring-service.port';
import { PaddleOCRConfig } from '@backend/infrastructure/config/paddleocr.config';
import { LMStudioStructuringService } from '@backend/infrastructure/lm-studio/lm-studio-structuring.service';
import { PaddleOCRHealthService } from '@backend/infrastructure/paddleocr/paddleocr-health.service';
import { PaddleOCRService } from '@backend/infrastructure/paddleocr/paddleocr-ocr.service';
import { PassthroughStructuringService } from '@backend/infrastructure/testing/passthrough-structuring.service';
import { LmStudioModule } from '@backend/presentation/modules/lm-studio.module';
import { OcrMessageController } from './ocr.message.controller';

const LM_STUDIO_SMOKE_ONLY = process.env.LM_STUDIO_SMOKE_ONLY === 'true';

@Module({
  imports: [LmStudioModule],
  controllers: [OcrMessageController],
  providers: [
    PaddleOCRConfig,
    PaddleOCRHealthService,
    LMStudioStructuringService,
    PassthroughStructuringService,
    PaddleOCRService,
    { provide: IOCRService, useExisting: PaddleOCRService },
    { provide: SharedOcrService, useExisting: IOCRService },
    {
      provide: ITextStructuringService,
      useClass: LM_STUDIO_SMOKE_ONLY
        ? PassthroughStructuringService
        : LMStudioStructuringService,
    },
    {
      provide: SharedTextStructuringService,
      useExisting: ITextStructuringService,
    },
    { provide: IPaddleOcrHealthPort, useExisting: PaddleOCRHealthService },
    {
      provide: SharedPaddleOcrHealthPort,
      useExisting: IPaddleOcrHealthPort,
    },
    {
      provide: SharedLmStudioHealthPort,
      useExisting: ILmStudioHealthPort,
    },
    ProcessImageUseCase,
  ],
})
export class AppModule {}
