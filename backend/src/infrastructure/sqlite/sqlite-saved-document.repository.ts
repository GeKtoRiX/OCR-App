import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import type Database from 'better-sqlite3';
import { ISavedDocumentRepository } from '../../domain/ports/saved-document-repository.port';
import { SavedDocument } from '../../domain/entities/saved-document.entity';
import { SqliteConnectionProvider } from './sqlite-connection.provider';

interface DocumentRow {
  id: string;
  markdown: string;
  filename: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class SqliteSavedDocumentRepository
  extends ISavedDocumentRepository
  implements OnModuleInit
{
  private stmts!: {
    insert: Database.Statement;
    selectAll: Database.Statement;
    selectById: Database.Statement;
    update: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(private readonly connection: SqliteConnectionProvider) {
    super();
  }

  onModuleInit(): void {
    this.connection.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_documents (
        id         TEXT PRIMARY KEY,
        markdown   TEXT NOT NULL,
        filename   TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const db = this.connection.db;
    this.stmts = {
      insert: db.prepare(
        'INSERT INTO saved_documents (id, markdown, filename, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ),
      selectAll: db.prepare(
        'SELECT id, markdown, filename, created_at, updated_at FROM saved_documents ORDER BY updated_at DESC',
      ),
      selectById: db.prepare(
        'SELECT id, markdown, filename, created_at, updated_at FROM saved_documents WHERE id = ?',
      ),
      update: db.prepare(
        'UPDATE saved_documents SET markdown = ?, updated_at = ? WHERE id = ?',
      ),
      deleteById: db.prepare('DELETE FROM saved_documents WHERE id = ?'),
    };
  }

  async create(markdown: string, filename: string): Promise<SavedDocument> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.stmts.insert.run(id, markdown, filename, now, now);
    return new SavedDocument(id, markdown, filename, now, now);
  }

  async findAll(): Promise<SavedDocument[]> {
    const rows = this.stmts.selectAll.all() as DocumentRow[];
    return rows.map(
      (r) =>
        new SavedDocument(r.id, r.markdown, r.filename, r.created_at, r.updated_at),
    );
  }

  async findById(id: string): Promise<SavedDocument | null> {
    const row = this.stmts.selectById.get(id) as DocumentRow | undefined;
    if (!row) return null;
    return new SavedDocument(
      row.id,
      row.markdown,
      row.filename,
      row.created_at,
      row.updated_at,
    );
  }

  async update(id: string, markdown: string): Promise<SavedDocument | null> {
    const now = new Date().toISOString();
    const result = this.stmts.update.run(markdown, now, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.stmts.deleteById.run(id);
    return result.changes > 0;
  }
}
