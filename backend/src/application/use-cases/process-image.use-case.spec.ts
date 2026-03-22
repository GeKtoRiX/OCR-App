import { NO_TEXT_DETECTED } from '../../domain/constants';
import { ProcessImageUseCase } from './process-image.use-case';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { ITextStructuringService } from '../../domain/ports/text-structuring-service.port';
import { ImageData } from '../../domain/entities/image-data.entity';

describe('ProcessImageUseCase', () => {
  let useCase: ProcessImageUseCase;
  let mockOcrService: jest.Mocked<IOCRService>;
  let mockStructuringService: jest.Mocked<ITextStructuringService>;

  beforeEach(() => {
    mockOcrService = {
      extractText: jest.fn(),
    } as jest.Mocked<IOCRService>;
    mockStructuringService = {
      structureAsMarkdown: jest.fn(),
    } as jest.Mocked<ITextStructuringService>;
    useCase = new ProcessImageUseCase(mockOcrService, mockStructuringService);
  });

  const input = {
    buffer: Buffer.from('image-data'),
    mimeType: 'image/png',
    originalName: 'test.png',
  };

  it('should extract text and structure it as markdown', async () => {
    mockOcrService.extractText.mockResolvedValue('Hello World');
    mockStructuringService.structureAsMarkdown.mockResolvedValue('# Hello World');

    const result = await useCase.execute(input);

    expect(result.rawText).toBe('Hello World');
    expect(result.markdown).toBe('# Hello World');
    expect(mockOcrService.extractText).toHaveBeenCalledTimes(1);
    expect(mockStructuringService.structureAsMarkdown).toHaveBeenCalledWith('Hello World');
  });

  it('should pass correct ImageData to OCR service', async () => {
    mockOcrService.extractText.mockResolvedValue('text');
    mockStructuringService.structureAsMarkdown.mockResolvedValue('md');

    await useCase.execute(input);

    const calledWith = mockOcrService.extractText.mock.calls[0][0];
    expect(calledWith).toBeInstanceOf(ImageData);
    expect(calledWith.buffer).toBe(input.buffer);
    expect(calledWith.mimeType).toBe(input.mimeType);
    expect(calledWith.originalName).toBe(input.originalName);
  });

  it('should return fallback when OCR returns empty string', async () => {
    mockOcrService.extractText.mockResolvedValue('');

    const result = await useCase.execute(input);

    expect(result.rawText).toBe(NO_TEXT_DETECTED);
    expect(result.markdown).toBe(NO_TEXT_DETECTED);
    expect(mockStructuringService.structureAsMarkdown).not.toHaveBeenCalled();
  });

  it('should return fallback when OCR returns whitespace only', async () => {
    mockOcrService.extractText.mockResolvedValue('   \n\t  ');

    const result = await useCase.execute(input);

    expect(result.rawText).toBe(NO_TEXT_DETECTED);
    expect(result.markdown).toBe(NO_TEXT_DETECTED);
  });

  it('should propagate OCR service errors', async () => {
    mockOcrService.extractText.mockRejectedValue(new Error('OCR failed'));

    await expect(useCase.execute(input)).rejects.toThrow('OCR failed');
  });

  it('should fall back to rawText when structuring service fails', async () => {
    mockOcrService.extractText.mockResolvedValue('text');
    mockStructuringService.structureAsMarkdown.mockRejectedValue(
      new Error('Structuring failed'),
    );

    const result = await useCase.execute(input);

    expect(result.rawText).toBe('text');
    expect(result.markdown).toBe('text');
  });
});
