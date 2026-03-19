import { OCRResult } from './ocr-result.entity';

describe('OCRResult', () => {
  it('should store rawText and structuredMarkdown', () => {
    const result = new OCRResult('Hello World', '# Hello World');

    expect(result.rawText).toBe('Hello World');
    expect(result.structuredMarkdown).toBe('# Hello World');
  });

  it('should handle empty strings', () => {
    const result = new OCRResult('', '');

    expect(result.rawText).toBe('');
    expect(result.structuredMarkdown).toBe('');
  });
});
