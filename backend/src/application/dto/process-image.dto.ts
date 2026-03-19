export interface ProcessImageInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface ProcessImageOutput {
  rawText: string;
  markdown: string;
}
