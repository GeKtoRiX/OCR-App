import { SavedDocumentUseCase } from './saved-document.use-case';
import { ISavedDocumentRepository } from '../../domain/ports/saved-document-repository.port';
import { SavedDocument } from '../../domain/entities/saved-document.entity';

describe('SavedDocumentUseCase', () => {
  let useCase: SavedDocumentUseCase;
  let mockRepo: jest.Mocked<ISavedDocumentRepository>;

  const now = '2024-01-01T00:00:00.000Z';

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceVocabularyCandidates: jest.fn(),
      findVocabularyCandidates: jest.fn(),
      updateAnalysisStatus: jest.fn(),
    } as jest.Mocked<ISavedDocumentRepository>;
    mockRepo.create.mockImplementation(async (input) => new SavedDocument(
      'id-1',
      input.markdown,
      input.richTextHtml,
      input.filename,
      now,
      now,
      'idle',
      null,
      null,
    ));

    useCase = new SavedDocumentUseCase(mockRepo);
  });

  describe('create', () => {
    it('normalizes image filenames to .html before saving', async () => {
      const result = await useCase.create({
        markdown: '# Hello',
        filename: 'test.png',
      });

      expect(mockRepo.create).toHaveBeenCalledWith({
        markdown: '# Hello',
        richTextHtml: null,
        filename: 'test.html',
      });
      expect(result).toEqual({
        id: 'id-1',
        markdown: '# Hello',
        richTextHtml: null,
        filename: 'test.html',
        createdAt: now,
        updatedAt: now,
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      });
    });

    it.each([
      ['photo.jpeg', 'photo.html'],
      ['scan.tiff', 'scan.html'],
      ['SCREENSHOT.WEBP', 'SCREENSHOT.html'],
    ])('normalizes %s to %s', async (filename, expectedFilename) => {
      await useCase.create({
        markdown: '# Hello',
        filename,
      });

      expect(mockRepo.create).toHaveBeenLastCalledWith({
        markdown: '# Hello',
        richTextHtml: null,
        filename: expectedFilename,
      });
    });

    it.each([
      'notes.md',
      'lesson.html',
      'plain-text',
    ])('keeps non-image filename %s unchanged', async (filename) => {
      await useCase.create({
        markdown: '# Hello',
        filename,
      });

      expect(mockRepo.create).toHaveBeenLastCalledWith({
        markdown: '# Hello',
        richTextHtml: null,
        filename,
      });
    });
  });

  describe('findAll', () => {
    it('returns all documents', async () => {
      const doc = new SavedDocument(
        'id-1',
        '# Hello',
        null,
        'test.html',
        now,
        now,
        'idle',
        null,
        null,
      );
      mockRepo.findAll.mockResolvedValue([doc]);

      const result = await useCase.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('id-1');
    });

    it('returns empty array when no documents', async () => {
      mockRepo.findAll.mockResolvedValue([]);

      const result = await useCase.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns document when found', async () => {
      const doc = new SavedDocument(
        'id-1',
        '# Hello',
        null,
        'test.html',
        now,
        now,
        'idle',
        null,
        null,
      );
      mockRepo.findById.mockResolvedValue(doc);

      const result = await useCase.findById('id-1');

      expect(mockRepo.findById).toHaveBeenCalledWith('id-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('id-1');
    });

    it('returns null when not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const result = await useCase.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('returns updated document', async () => {
      const updated = new SavedDocument(
        'id-1',
        '# Updated',
        null,
        'test.png',
        now,
        '2024-01-02T00:00:00.000Z',
        'idle',
        null,
        null,
      );
      mockRepo.update.mockResolvedValue(updated);

      const result = await useCase.update('id-1', { markdown: '# Updated' });

      expect(mockRepo.update).toHaveBeenCalledWith('id-1', {
        markdown: '# Updated',
        richTextHtml: null,
      });
      expect(result!.markdown).toBe('# Updated');
    });

    it('returns null when document not found', async () => {
      mockRepo.update.mockResolvedValue(null);

      const result = await useCase.update('missing', { markdown: 'x' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when deleted', async () => {
      mockRepo.delete.mockResolvedValue(true);

      const result = await useCase.delete('id-1');

      expect(mockRepo.delete).toHaveBeenCalledWith('id-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockRepo.delete.mockResolvedValue(false);

      const result = await useCase.delete('missing');

      expect(result).toBe(false);
    });
  });
});
