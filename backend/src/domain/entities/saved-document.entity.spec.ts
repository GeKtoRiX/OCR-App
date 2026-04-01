import { SavedDocument } from './saved-document.entity';

describe('SavedDocument', () => {
  it('stores all properties', () => {
    const doc = new SavedDocument(
      'id-1',
      '# Hello',
      null,
      'test.png',
      '2024-01-01T00:00:00.000Z',
      '2024-01-01T00:00:00.000Z',
      'idle',
      null,
      null,
    );

    expect(doc.id).toBe('id-1');
    expect(doc.markdown).toBe('# Hello');
    expect(doc.richTextHtml).toBeNull();
    expect(doc.filename).toBe('test.png');
    expect(doc.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(doc.updatedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(doc.analysisStatus).toBe('idle');
    expect(doc.analysisError).toBeNull();
    expect(doc.analysisUpdatedAt).toBeNull();
  });
});
