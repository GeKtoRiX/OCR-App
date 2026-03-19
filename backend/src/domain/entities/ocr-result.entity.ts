export class OCRResult {
  constructor(
    public readonly rawText: string,
    public readonly structuredMarkdown: string,
  ) {}
}
