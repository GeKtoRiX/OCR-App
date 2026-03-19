import { BadRequestException, HttpException } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { ProcessImageUseCase } from '../../application/use-cases/process-image.use-case';

describe('OcrController', () => {
  let controller: OcrController;
  let mockProcessImage: jest.Mocked<ProcessImageUseCase>;

  beforeEach(() => {
    mockProcessImage = { execute: jest.fn() } as any;
    controller = new OcrController(mockProcessImage);
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
});
