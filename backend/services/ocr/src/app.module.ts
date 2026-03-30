import { Module } from '@nestjs/common';
import {
  ILmStudioHealthPort as SharedLmStudioHealthPort,
  IOcrHealthPort as SharedOcrHealthPort,
  IOCRService as SharedOcrService,
} from '@ocr-app/shared';
import { ProcessImageUseCase } from '@backend/application/use-cases/process-image.use-case';
import { ILmStudioHealthPort } from '@backend/domain/ports/lm-studio-health.port';
import { IOcrHealthPort } from '@backend/domain/ports/ocr-health.port';
import { IOCRService } from '@backend/domain/ports/ocr-service.port';
import { LMStudioOcrHealthService } from '@backend/infrastructure/lm-studio/lm-studio-ocr-health.service';
import { LMStudioOCRService } from '@backend/infrastructure/lm-studio/lm-studio-ocr.service';
import { LmStudioModule } from '@backend/presentation/modules/lm-studio.module';
import { OcrMessageController } from './ocr.message.controller';

@Module({
  imports: [LmStudioModule],
  controllers: [OcrMessageController],
  providers: [
    LMStudioOcrHealthService,
    LMStudioOCRService,
    { provide: IOCRService, useExisting: LMStudioOCRService },
    { provide: SharedOcrService, useExisting: IOCRService },
    { provide: IOcrHealthPort, useExisting: LMStudioOcrHealthService },
    { provide: SharedOcrHealthPort, useExisting: IOcrHealthPort },
    {
      provide: SharedLmStudioHealthPort,
      useExisting: ILmStudioHealthPort,
    },
    ProcessImageUseCase,
  ],
})
export class AppModule {}
