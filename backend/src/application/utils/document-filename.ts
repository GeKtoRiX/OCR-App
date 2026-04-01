import path from 'path';

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tiff',
  '.gif',
]);

export function normalizeSavedDocumentFilename(filename: string): string {
  const parsed = path.parse(filename);
  const extension = parsed.ext.toLowerCase();

  if (!IMAGE_EXTENSIONS.has(extension)) {
    return filename;
  }

  return path.join(parsed.dir, `${parsed.name}.html`);
}
