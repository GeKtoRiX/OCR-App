export class ImageData {
  constructor(
    public readonly buffer: Buffer,
    public readonly mimeType: string,
    public readonly originalName: string,
  ) {}

  toBase64DataUrl(): string {
    return `data:${this.mimeType};base64,${this.buffer.toString('base64')}`;
  }
}
