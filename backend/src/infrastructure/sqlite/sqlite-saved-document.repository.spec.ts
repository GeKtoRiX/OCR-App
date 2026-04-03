import { SqliteSavedDocumentRepository } from './sqlite-saved-document.repository';
import { SqliteConnectionProvider } from './sqlite-connection.provider';
import { SqliteConfig } from '../config/sqlite.config';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';

describe('SqliteSavedDocumentRepository', () => {
  let repo: SqliteSavedDocumentRepository;
  let connection: SqliteConnectionProvider;

  beforeEach(() => {
    const config = { dbPath: ':memory:' } as SqliteConfig;
    connection = new SqliteConnectionProvider(config);
    connection.onModuleInit();
    repo = new SqliteSavedDocumentRepository(connection);
    repo.onModuleInit();
  });

  afterEach(() => {
    connection.onModuleDestroy();
  });

  it('creates a document and returns it', async () => {
    const doc = await repo.create({
      markdown: '# Hello',
      richTextHtml: null,
      filename: 'test.png',
    });

    expect(doc.id).toBeDefined();
    expect(doc.markdown).toBe('# Hello');
    expect(doc.richTextHtml).toBeNull();
    expect(doc.filename).toBe('test.png');
    expect(doc.createdAt).toBeDefined();
    expect(doc.updatedAt).toBe(doc.createdAt);
    expect(doc.analysisStatus).toBe('idle');
    expect(doc.analysisError).toBeNull();
    expect(doc.analysisUpdatedAt).toBeNull();
  });

  it('findAll returns documents ordered by updatedAt DESC', async () => {
    const first = await repo.create({ markdown: 'First', richTextHtml: null, filename: 'a.png' });
    await repo.create({ markdown: 'Second', richTextHtml: null, filename: 'b.png' });
    // Update the first doc so its updatedAt is newest
    await repo.update(first.id, { markdown: 'First updated', richTextHtml: null });

    const docs = await repo.findAll();

    expect(docs).toHaveLength(2);
    expect(docs[0].markdown).toBe('First updated');
  });

  it('findAll returns empty array when no documents', async () => {
    const docs = await repo.findAll();

    expect(docs).toEqual([]);
  });

  it('findById returns document when found', async () => {
    const created = await repo.create({ markdown: '# Test', richTextHtml: null, filename: 'img.png' });

    const found = await repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.markdown).toBe('# Test');
  });

  it('findById returns null when not found', async () => {
    const found = await repo.findById('nonexistent');

    expect(found).toBeNull();
  });

  it('update modifies markdown and updatedAt', async () => {
    const created = await repo.create({ markdown: 'original', richTextHtml: null, filename: 'file.png' });

    const updated = await repo.update(created.id, { markdown: '# Updated', richTextHtml: null });

    expect(updated).not.toBeNull();
    expect(updated!.markdown).toBe('# Updated');
    expect(updated!.filename).toBe('file.png');
    expect(updated!.updatedAt >= created.updatedAt).toBe(true);
    expect(updated!.analysisStatus).toBe('idle');
  });

  it('update returns null for nonexistent id', async () => {
    const result = await repo.update('missing', { markdown: 'text', richTextHtml: null });

    expect(result).toBeNull();
  });

  it('delete removes document and returns true', async () => {
    const created = await repo.create({ markdown: 'to delete', richTextHtml: null, filename: 'del.png' });

    const deleted = await repo.delete(created.id);

    expect(deleted).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', async () => {
    const result = await repo.delete('missing');

    expect(result).toBe(false);
  });

  it('persists richTextHtml when provided', async () => {
    const created = await repo.create({
      markdown: 'Hello world',
      richTextHtml: '<p><strong>Hello</strong> world</p>',
      filename: 'rich.html',
    });

    expect(created.richTextHtml).toBe('<p><strong>Hello</strong> world</p>');
  });

  it('replaces and retrieves vocabulary candidates for a document', async () => {
    const created = await repo.create({
      markdown: '# Test',
      richTextHtml: null,
      filename: 'lesson.html',
    });

    const candidates = [
      new DocumentVocabCandidate(
        'candidate-2',
        created.id,
        'piece of cake',
        'piece of cake',
        'piece of cake',
        'idiom',
        null,
        'очень легко',
        'This task was a piece of cake.',
        0,
        5,
        18,
        true,
        false,
        'llm_reviewed',
      ),
      new DocumentVocabCandidate(
        'candidate-1',
        created.id,
        'study',
        'study',
        'study',
        'word',
        'verb',
        'учиться',
        'They study every night.',
        0,
        0,
        5,
        true,
        false,
        'base_nlp',
      ),
    ];

    await repo.replaceVocabularyCandidates(created.id, candidates);

    const found = await repo.findVocabularyCandidates(created.id);

    expect(found.map((candidate) => candidate.id)).toEqual([
      'candidate-1',
      'candidate-2',
    ]);
    expect(found[1]?.reviewSource).toBe('llm_reviewed');
  });

  it('update clears saved vocabulary candidates for the document', async () => {
    const created = await repo.create({
      markdown: '# Test',
      richTextHtml: null,
      filename: 'lesson.html',
    });

    await repo.replaceVocabularyCandidates(created.id, [
      new DocumentVocabCandidate(
        'candidate-1',
        created.id,
        'study',
        'study',
        'study',
        'word',
        'verb',
        'учиться',
        'They study every night.',
        0,
        0,
        5,
        true,
        false,
        'base_nlp',
      ),
    ]);

    await repo.update(created.id, {
      markdown: '# Updated',
      richTextHtml: null,
    });

    expect(await repo.findVocabularyCandidates(created.id)).toEqual([]);
  });

  it('updates analysis status fields and returns the refreshed document', async () => {
    const created = await repo.create({
      markdown: '# Test',
      richTextHtml: null,
      filename: 'lesson.html',
    });

    const updated = await repo.updateAnalysisStatus(
      created.id,
      'failed',
      'analysis crashed',
    );

    expect(updated?.analysisStatus).toBe('failed');
    expect(updated?.analysisError).toBe('analysis crashed');
    expect(updated?.analysisUpdatedAt).toBeTruthy();
  });

  it('returns null when updating analysis status for a missing document', async () => {
    const updated = await repo.updateAnalysisStatus('missing', 'ready', null);

    expect(updated).toBeNull();
  });
});
