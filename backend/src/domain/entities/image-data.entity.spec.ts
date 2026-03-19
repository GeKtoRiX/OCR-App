import { ImageData } from './image-data.entity';

describe('ImageData', () => {
  const buffer = Buffer.from('fake-png-data');
  const mimeType = 'image/png';
  const originalName = 'test.png';

  it('should store buffer, mimeType, and originalName', () => {
    const img = new ImageData(buffer, mimeType, originalName);

    expect(img.buffer).toBe(buffer);
    expect(img.mimeType).toBe(mimeType);
    expect(img.originalName).toBe(originalName);
  });

  it('should generate correct base64 data URL', () => {
    const img = new ImageData(buffer, mimeType, originalName);
    const dataUrl = img.toBase64DataUrl();

    expect(dataUrl).toBe(`data:image/png;base64,${buffer.toString('base64')}`);
  });

  it('should handle different MIME types in data URL', () => {
    const img = new ImageData(buffer, 'image/jpeg', 'photo.jpg');
    const dataUrl = img.toBase64DataUrl();

    expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('should handle empty buffer', () => {
    const img = new ImageData(Buffer.alloc(0), mimeType, originalName);

    expect(img.toBase64DataUrl()).toBe('data:image/png;base64,');
  });
});
