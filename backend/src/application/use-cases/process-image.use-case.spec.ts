import { NO_TEXT_DETECTED } from '../../domain/constants';
import { ProcessImageUseCase } from './process-image.use-case';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { ImageData } from '../../domain/entities/image-data.entity';

describe('ProcessImageUseCase', () => {
  let useCase: ProcessImageUseCase;
  let mockOcrService: jest.Mocked<IOCRService>;

  beforeEach(() => {
    mockOcrService = {
      extractText: jest.fn(),
    } as jest.Mocked<IOCRService>;
    useCase = new ProcessImageUseCase(mockOcrService);
  });

  const input = {
    buffer: Buffer.from('image-data'),
    mimeType: 'image/png',
    originalName: 'test.png',
  };

  it('should return rawText as markdown (PP-Structure already structures output)', async () => {
    mockOcrService.extractText.mockResolvedValue({
      rawText: '# Hello\n\nWorld',
      markdown: '# Hello\n\nWorld',
      blocks: [],
    });

    const result = await useCase.execute(input);

    expect(result.rawText).toBe('# Hello\n\nWorld');
    expect(result.markdown).toBe('# Hello\n\nWorld');
    expect(mockOcrService.extractText).toHaveBeenCalledTimes(1);
  });

  it('should pass correct ImageData to OCR service', async () => {
    mockOcrService.extractText.mockResolvedValue({
      rawText: 'text',
      markdown: 'text',
      blocks: [],
    });

    await useCase.execute(input);

    const calledWith = mockOcrService.extractText.mock.calls[0][0];
    expect(calledWith).toBeInstanceOf(ImageData);
    expect(calledWith.buffer).toBe(input.buffer);
    expect(calledWith.mimeType).toBe(input.mimeType);
    expect(calledWith.originalName).toBe(input.originalName);
  });

  it('should return fallback when OCR returns empty string', async () => {
    mockOcrService.extractText.mockResolvedValue({
      rawText: '',
      markdown: '',
      blocks: [],
    });

    const result = await useCase.execute(input);

    expect(result.rawText).toBe(NO_TEXT_DETECTED);
    expect(result.markdown).toBe(NO_TEXT_DETECTED);
  });

  it('should return fallback when OCR returns whitespace only', async () => {
    mockOcrService.extractText.mockResolvedValue({
      rawText: '   \n\t  ',
      markdown: '',
      blocks: [],
    });

    const result = await useCase.execute(input);

    expect(result.rawText).toBe(NO_TEXT_DETECTED);
    expect(result.markdown).toBe(NO_TEXT_DETECTED);
  });

  it('should propagate OCR service errors', async () => {
    mockOcrService.extractText.mockRejectedValue(new Error('OCR failed'));

    await expect(useCase.execute(input)).rejects.toThrow('OCR failed');
  });

  it('should prefer markdown when the OCR service returns a structured markdown value', async () => {
    mockOcrService.extractText.mockResolvedValue({
      rawText: 'Raw OCR text',
      markdown: '# Structured markdown',
      blocks: [],
    });

    const result = await useCase.execute(input);

    expect(result.rawText).toBe('Raw OCR text');
    expect(result.markdown).toBe('# Structured markdown');
  });
});
