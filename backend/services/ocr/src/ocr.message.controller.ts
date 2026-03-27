import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import {
  ILmStudioHealthPort,
  IPaddleOcrHealthPort,
  OCR_PATTERNS,
  OcrHealthResponse,
  ProcessImagePayload,
  ProcessImageResponse,
} from '@ocr-app/shared';
import { ProcessImageUseCase } from '@backend/application/use-cases/process-image.use-case';

const LM_STUDIO_SMOKE_ONLY = process.env.LM_STUDIO_SMOKE_ONLY === 'true';

@Controller()
export class OcrMessageController {
  constructor(
    private readonly processImage: ProcessImageUseCase,
    private readonly paddleOcrHealth: IPaddleOcrHealthPort,
    private readonly lmStudioHealth: ILmStudioHealthPort,
  ) {}

  @MessagePattern(OCR_PATTERNS.PROCESS_IMAGE)
  async processImageMessage(
    payload: ProcessImagePayload,
  ): Promise<ProcessImageResponse> {
    if (!payload?.base64 || !payload.mimeType || !payload.filename) {
      throw new RpcException({
        statusCode: 400,
        message: 'base64, mimeType, and filename are required',
      });
    }

    try {
      const result = await this.processImage.execute({
        buffer: Buffer.from(payload.base64, 'base64'),
        mimeType: payload.mimeType,
        originalName: payload.filename,
      });
      return {
        rawText: result.rawText,
        markdown: result.markdown,
        filename: payload.filename,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      throw new RpcException({
        statusCode: 502,
        message: `OCR processing error: ${message}`,
      });
    }
  }

  @MessagePattern(OCR_PATTERNS.CHECK_HEALTH)
  async healthCheck(): Promise<OcrHealthResponse> {
    const [paddleOcrReachable, lmStudioReachable] = await Promise.all([
      this.safeIsReachable(this.paddleOcrHealth),
      LM_STUDIO_SMOKE_ONLY
        ? Promise.resolve(false)
        : this.safeIsReachable(this.lmStudioHealth),
    ]);

    const [paddleOcrModels, lmStudioModels, paddleOcrDevice] =
      await Promise.all([
        paddleOcrReachable
          ? this.safeListModels(this.paddleOcrHealth)
          : Promise.resolve([]),
        !LM_STUDIO_SMOKE_ONLY && lmStudioReachable
          ? this.safeListModels(this.lmStudioHealth)
          : Promise.resolve([]),
        paddleOcrReachable
          ? this.paddleOcrHealth.getDevice()
          : Promise.resolve(null),
      ]);

    return {
      paddleOcrReachable,
      paddleOcrModels,
      paddleOcrDevice,
      lmStudioReachable,
      lmStudioModels,
    };
  }

  private async safeIsReachable(service: {
    isReachable(): Promise<boolean>;
  }): Promise<boolean> {
    try {
      return await service.isReachable();
    } catch {
      return false;
    }
  }

  private async safeListModels(service: {
    listModels(): Promise<string[]>;
  }): Promise<string[]> {
    try {
      return await service.listModels();
    } catch {
      return [];
    }
  }
}
