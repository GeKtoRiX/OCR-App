import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import type Database from 'better-sqlite3';
import { ISavedDocumentRepository } from '../../domain/ports/saved-document-repository.port';
import { SavedDocument } from '../../domain/entities/saved-document.entity';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';
import type {
  DocumentCandidatePos,
  DocumentCandidateReviewSource,
} from '../../domain/entities/document-vocab-candidate.entity';
import type { VocabType } from '../../domain/entities/vocabulary-word.entity';
import { SqliteConnectionProvider } from './sqlite-connection.provider';

interface DocumentRow {
  id: string;
  markdown: string;
  filename: string;
  created_at: string;
  updated_at: string;
  analysis_status: SavedDocument['analysisStatus'];
  analysis_error: string | null;
  analysis_updated_at: string | null;
}

interface CandidateRow {
  id: string;
  document_id: string;
  surface: string;
  normalized: string;
  lemma: string;
  vocab_type: string;
  pos: string | null;
  translation: string;
  context_sentence: string;
  sentence_index: number;
  start_offset: number;
  end_offset: number;
  selected_by_default: number;
  is_duplicate: number;
  review_source: string;
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
    deleteCandidatesByDocumentId: Database.Statement;
    insertCandidate: Database.Statement;
    selectCandidatesByDocumentId: Database.Statement;
    updateAnalysisStatus: Database.Statement;
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
        updated_at TEXT NOT NULL,
        analysis_status TEXT NOT NULL DEFAULT 'idle',
        analysis_error TEXT,
        analysis_updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS document_vocab_candidates (
        id                  TEXT PRIMARY KEY,
        document_id         TEXT NOT NULL,
        surface             TEXT NOT NULL,
        normalized          TEXT NOT NULL,
        lemma               TEXT NOT NULL,
        vocab_type          TEXT NOT NULL,
        pos                 TEXT,
        translation         TEXT NOT NULL DEFAULT '',
        context_sentence    TEXT NOT NULL DEFAULT '',
        sentence_index      INTEGER NOT NULL DEFAULT 0,
        start_offset        INTEGER NOT NULL DEFAULT 0,
        end_offset          INTEGER NOT NULL DEFAULT 0,
        selected_by_default INTEGER NOT NULL DEFAULT 1,
        is_duplicate        INTEGER NOT NULL DEFAULT 0,
        review_source       TEXT NOT NULL DEFAULT 'base_nlp',
        FOREIGN KEY(document_id) REFERENCES saved_documents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_document_vocab_candidates_document_id
      ON document_vocab_candidates(document_id);
    `);

    const columns = this.connection.db
      .prepare('PRAGMA table_info(saved_documents)')
      .all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has('analysis_status')) {
      this.connection.db.exec(
        "ALTER TABLE saved_documents ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'idle'",
      );
    }
    if (!names.has('analysis_error')) {
      this.connection.db.exec(
        'ALTER TABLE saved_documents ADD COLUMN analysis_error TEXT',
      );
    }
    if (!names.has('analysis_updated_at')) {
      this.connection.db.exec(
        'ALTER TABLE saved_documents ADD COLUMN analysis_updated_at TEXT',
      );
    }

    const db = this.connection.db;
    this.stmts = {
      insert: db.prepare(
        `INSERT INTO saved_documents
          (id, markdown, filename, created_at, updated_at, analysis_status, analysis_error, analysis_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      selectAll: db.prepare(
        `SELECT id, markdown, filename, created_at, updated_at,
                analysis_status, analysis_error, analysis_updated_at
         FROM saved_documents ORDER BY updated_at DESC`,
      ),
      selectById: db.prepare(
        `SELECT id, markdown, filename, created_at, updated_at,
                analysis_status, analysis_error, analysis_updated_at
         FROM saved_documents WHERE id = ?`,
      ),
      update: db.prepare(
        `UPDATE saved_documents
         SET markdown = ?, updated_at = ?, analysis_status = 'idle', analysis_error = NULL, analysis_updated_at = NULL
         WHERE id = ?`,
      ),
      deleteById: db.prepare('DELETE FROM saved_documents WHERE id = ?'),
      deleteCandidatesByDocumentId: db.prepare(
        'DELETE FROM document_vocab_candidates WHERE document_id = ?',
      ),
      insertCandidate: db.prepare(
        `INSERT INTO document_vocab_candidates
          (id, document_id, surface, normalized, lemma, vocab_type, pos, translation,
           context_sentence, sentence_index, start_offset, end_offset,
           selected_by_default, is_duplicate, review_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      selectCandidatesByDocumentId: db.prepare(
        `SELECT id, document_id, surface, normalized, lemma, vocab_type, pos, translation,
                context_sentence, sentence_index, start_offset, end_offset,
                selected_by_default, is_duplicate, review_source
         FROM document_vocab_candidates
         WHERE document_id = ?
         ORDER BY sentence_index ASC, start_offset ASC, normalized ASC`,
      ),
      updateAnalysisStatus: db.prepare(
        'UPDATE saved_documents SET analysis_status = ?, analysis_error = ?, analysis_updated_at = ?, updated_at = ? WHERE id = ?',
      ),
    };
  }

  private toDocumentEntity(row: DocumentRow): SavedDocument {
    return new SavedDocument(
      row.id,
      row.markdown,
      row.filename,
      row.created_at,
      row.updated_at,
      row.analysis_status,
      row.analysis_error,
      row.analysis_updated_at,
    );
  }

  private toCandidateEntity(row: CandidateRow): DocumentVocabCandidate {
    return new DocumentVocabCandidate(
      row.id,
      row.document_id,
      row.surface,
      row.normalized,
      row.lemma,
      row.vocab_type as VocabType,
      row.pos as DocumentCandidatePos,
      row.translation,
      row.context_sentence,
      row.sentence_index,
      row.start_offset,
      row.end_offset,
      Boolean(row.selected_by_default),
      Boolean(row.is_duplicate),
      row.review_source as DocumentCandidateReviewSource,
    );
  }

  async create(markdown: string, filename: string): Promise<SavedDocument> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.stmts.insert.run(id, markdown, filename, now, now, 'idle', null, null);
    return new SavedDocument(id, markdown, filename, now, now, 'idle', null, null);
  }

  async findAll(): Promise<SavedDocument[]> {
    const rows = this.stmts.selectAll.all() as DocumentRow[];
    return rows.map((row) => this.toDocumentEntity(row));
  }

  async findById(id: string): Promise<SavedDocument | null> {
    const row = this.stmts.selectById.get(id) as DocumentRow | undefined;
    if (!row) return null;
    return this.toDocumentEntity(row);
  }

  async update(id: string, markdown: string): Promise<SavedDocument | null> {
    const now = new Date().toISOString();
    const updateDocument = this.connection.db.transaction(
      (documentId: string, nextMarkdown: string, timestamp: string) => {
        const result = this.stmts.update.run(nextMarkdown, timestamp, documentId);
        if (result.changes === 0) {
          return 0;
        }
        this.stmts.deleteCandidatesByDocumentId.run(documentId);
        return result.changes;
      },
    );
    const changes = updateDocument(id, markdown, now);
    if (changes === 0) return null;
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.stmts.deleteById.run(id);
    return result.changes > 0;
  }

  async replaceVocabularyCandidates(
    documentId: string,
    candidates: DocumentVocabCandidate[],
  ): Promise<void> {
    const replaceCandidates = this.connection.db.transaction(
      (docId: string, nextCandidates: DocumentVocabCandidate[]) => {
        this.stmts.deleteCandidatesByDocumentId.run(docId);
        for (const candidate of nextCandidates) {
          this.stmts.insertCandidate.run(
            candidate.id,
            docId,
            candidate.surface,
            candidate.normalized,
            candidate.lemma,
            candidate.vocabType,
            candidate.pos,
            candidate.translation,
            candidate.contextSentence,
            candidate.sentenceIndex,
            candidate.startOffset,
            candidate.endOffset,
            candidate.selectedByDefault ? 1 : 0,
            candidate.isDuplicate ? 1 : 0,
            candidate.reviewSource,
          );
        }
      },
    );

    replaceCandidates(documentId, candidates);
  }

  async findVocabularyCandidates(documentId: string): Promise<DocumentVocabCandidate[]> {
    const rows = this.stmts.selectCandidatesByDocumentId.all(documentId) as CandidateRow[];
    return rows.map((row) => this.toCandidateEntity(row));
  }

  async updateAnalysisStatus(
    id: string,
    status: SavedDocument['analysisStatus'],
    error: string | null,
  ): Promise<SavedDocument | null> {
    const now = new Date().toISOString();
    const result = this.stmts.updateAnalysisStatus.run(status, error, now, now, id);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(id);
  }
}
