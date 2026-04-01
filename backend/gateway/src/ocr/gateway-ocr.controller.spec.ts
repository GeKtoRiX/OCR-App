import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { OCR_PATTERNS } from '@ocr-app/shared';
import { GatewayOcrController } from './gateway-ocr.controller';

describe('GatewayOcrController', () => {
  const mockResponse = {
    rawText: 'hello',
    markdown: '# hello',
    filename: 'scan.png',
  };

  let controller: GatewayOcrController;
  let ocrClient: { send: jest.Mock };

  beforeEach(() => {
    ocrClient = {
      send: jest.fn().mockReturnValue(of(mockResponse)),
    };
    controller = new GatewayOcrController(ocrClient as any);
  });

  it('rejects missing files', async () => {
    await expect(controller.processOcr(undefined as any)).rejects.toThrow(
      new BadRequestException('No image file provided'),
    );
  });

  it('rejects oversized files', async () => {
    await expect(
      controller.processOcr({
        size: 11 * 1024 * 1024,
        mimetype: 'image/png',
        buffer: Buffer.from('img'),
        originalname: 'big.png',
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported file types', async () => {
    await expect(
      controller.processOcr({
        size: 128,
        mimetype: 'text/plain',
        buffer: Buffer.from('img'),
        originalname: 'bad.txt',
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('encodes the file and forwards it upstream', async () => {
    const file = {
      size: 128,
      mimetype: 'image/png',
      buffer: Buffer.from('png-bytes'),
      originalname: 'scan.png',
    } as Express.Multer.File;

    await expect(controller.processOcr(file)).resolves.toEqual(mockResponse);

    expect(ocrClient.send).toHaveBeenCalledWith(OCR_PATTERNS.PROCESS_IMAGE, {
      base64: Buffer.from('png-bytes').toString('base64'),
      mimeType: 'image/png',
      filename: 'scan.png',
    });
  });

  it('wraps upstream OCR failures', async () => {
    ocrClient.send.mockReturnValue(
      throwError(() => ({ status: 503, message: 'OCR unavailable' })),
    );

    await expect(
      controller.processOcr({
        size: 128,
        mimetype: 'image/png',
        buffer: Buffer.from('img'),
        originalname: 'scan.png',
      } as Express.Multer.File),
    ).rejects.toMatchObject({
      status: 502,
      message: 'OCR unavailable',
    });
  });
});
