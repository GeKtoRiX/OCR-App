import { SqliteSavedDocumentRepository } from './sqlite-saved-document.repository';
import { SqliteConnectionProvider } from './sqlite-connection.provider';
import { SqliteConfig } from '../config/sqlite.config';

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
    const doc = await repo.create('# Hello', 'test.png');

    expect(doc.id).toBeDefined();
    expect(doc.markdown).toBe('# Hello');
    expect(doc.filename).toBe('test.png');
    expect(doc.createdAt).toBeDefined();
    expect(doc.updatedAt).toBe(doc.createdAt);
    expect(doc.analysisStatus).toBe('idle');
    expect(doc.analysisError).toBeNull();
    expect(doc.analysisUpdatedAt).toBeNull();
  });

  it('findAll returns documents ordered by updatedAt DESC', async () => {
    const first = await repo.create('First', 'a.png');
    await repo.create('Second', 'b.png');
    // Update the first doc so its updatedAt is newest
    await repo.update(first.id, 'First updated');

    const docs = await repo.findAll();

    expect(docs).toHaveLength(2);
    expect(docs[0].markdown).toBe('First updated');
  });

  it('findAll returns empty array when no documents', async () => {
    const docs = await repo.findAll();

    expect(docs).toEqual([]);
  });

  it('findById returns document when found', async () => {
    const created = await repo.create('# Test', 'img.png');

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
    const created = await repo.create('original', 'file.png');

    const updated = await repo.update(created.id, '# Updated');

    expect(updated).not.toBeNull();
    expect(updated!.markdown).toBe('# Updated');
    expect(updated!.filename).toBe('file.png');
    expect(updated!.updatedAt >= created.updatedAt).toBe(true);
    expect(updated!.analysisStatus).toBe('idle');
  });

  it('update returns null for nonexistent id', async () => {
    const result = await repo.update('missing', 'text');

    expect(result).toBeNull();
  });

  it('delete removes document and returns true', async () => {
    const created = await repo.create('to delete', 'del.png');

    const deleted = await repo.delete(created.id);

    expect(deleted).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', async () => {
    const result = await repo.delete('missing');

    expect(result).toBe(false);
  });
});
