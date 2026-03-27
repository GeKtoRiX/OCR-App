import { BadRequestException, HttpException } from '@nestjs/common';
import * as fs from 'fs';
import { OcrController } from './ocr.controller';
import { ProcessImageUseCase } from '../../application/use-cases/process-image.use-case';
import { OcrConcurrencyService } from '../../infrastructure/concurrency/ocr-concurrency.service';

describe('OcrController', () => {
  let controller: OcrController;
  let mockProcessImage: jest.Mocked<ProcessImageUseCase>;
  let concurrency: OcrConcurrencyService;

  beforeEach(() => {
    mockProcessImage = { execute: jest.fn() } as any;
    concurrency = new OcrConcurrencyService();
    controller = new OcrController(mockProcessImage, concurrency);
  });

  const validFile = {
    buffer: Buffer.from('image'),
    mimetype: 'image/png',
    originalname: 'test.png',
    size: 1024,
  } as Express.Multer.File;

  it('should process valid image and return response', async () => {
    mockProcessImage.execute.mockResolvedValue({
      rawText: 'Hello',
      markdown: '# Hello',
    });

    const result = await controller.processOcr(validFile);

    expect(result).toEqual({
      rawText: 'Hello',
      markdown: '# Hello',
      filename: 'test.png',
    });
    expect(mockProcessImage.execute).toHaveBeenCalledWith({
      buffer: validFile.buffer,
      mimeType: 'image/png',
      originalName: 'test.png',
    });
  });

  it('should throw BadRequestException when no file provided', async () => {
    await expect(controller.processOcr(null as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException for unsupported MIME type', async () => {
    const file = { ...validFile, mimetype: 'application/pdf' };

    await expect(controller.processOcr(file as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('cleans up oversized files from disk before rejecting them', async () => {
    const unlinkSpy = jest
      .spyOn(fs.promises, 'unlink')
      .mockResolvedValue(undefined);
    const file = {
      ...validFile,
      size: 11 * 1024 * 1024,
      path: '/tmp/oversized.png',
    };

    await expect(controller.processOcr(file as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/oversized.png');
  });

  it('cleans up unsupported files from disk before rejecting them', async () => {
    const unlinkSpy = jest
      .spyOn(fs.promises, 'unlink')
      .mockResolvedValue(undefined);
    const file = {
      ...validFile,
      mimetype: 'application/pdf',
      path: '/tmp/invalid.pdf',
    };

    await expect(controller.processOcr(file as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/invalid.pdf');
  });

  it('should accept all allowed MIME types', async () => {
    mockProcessImage.execute.mockResolvedValue({ rawText: 't', markdown: 'm' });

    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/bmp',
      'image/tiff',
    ];

    for (const mime of allowedTypes) {
      const file = { ...validFile, mimetype: mime };
      await expect(controller.processOcr(file as any)).resolves.toBeDefined();
    }
  });

  it('should throw BadRequestException for oversized files', async () => {
    const file = { ...validFile, size: 11 * 1024 * 1024 };

    await expect(controller.processOcr(file as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw HttpException with 502 when use case throws', async () => {
    mockProcessImage.execute.mockRejectedValue(new Error('LM Studio down'));

    try {
      await controller.processOcr(validFile);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(502);
    }
  });

  it('should convert non-Error processing failures into an unknown processing error', async () => {
    mockProcessImage.execute.mockRejectedValue('bad response');

    await expect(controller.processOcr(validFile)).rejects.toMatchObject({
      status: 502,
      response: {
        statusCode: 502,
        message: 'OCR processing error: Unknown processing error',
      },
    });
  });

  it('should reject requests when the OCR queue backpressure limit is exceeded', async () => {
    const unlinkSpy = jest
      .spyOn(fs.promises, 'unlink')
      .mockResolvedValue(undefined);
    let releaseBlocked!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseBlocked = resolve;
    });
    mockProcessImage.execute.mockImplementation(() =>
      blocked.then(() => ({
        rawText: 'Hello',
        markdown: '# Hello',
      })),
    );

    const inflight = Array.from({ length: 9 }, (_, index) =>
      controller.processOcr({
        ...validFile,
        originalname: `test-${index}.png`,
      } as any),
    );

    await new Promise((resolve) => setImmediate(resolve));

    await expect(
      controller.processOcr({
        ...validFile,
        originalname: 'overflow.png',
        path: '/tmp/overflow.png',
      } as any),
    ).rejects.toMatchObject({
      status: 429,
      response: {
        statusCode: 429,
        message: 'Too many OCR requests in progress, try again later',
      },
    });

    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/overflow.png');

    releaseBlocked();
    await Promise.allSettled(inflight);
  });
});
