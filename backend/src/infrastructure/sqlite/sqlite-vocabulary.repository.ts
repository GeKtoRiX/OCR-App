import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import type Database from 'better-sqlite3';
import {
  IVocabularyRepository,
  CreateVocabularyInput,
} from '../../domain/ports/vocabulary-repository.port';
import {
  VocabularyWord,
  VocabType,
} from '../../domain/entities/vocabulary-word.entity';
import { SqliteConnectionProvider } from './sqlite-connection.provider';

interface VocabularyRow {
  id: string;
  word: string;
  vocab_type: string;
  translation: string;
  target_lang: string;
  native_lang: string;
  context_sentence: string;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
  interval_days: number;
  easiness_factor: number;
  repetitions: number;
  next_review_at: string;
}

const DUPLICATE_VOCABULARY_ERROR =
  'Vocabulary word already exists for this language pair';

@Injectable()
export class SqliteVocabularyRepository
  extends IVocabularyRepository
  implements OnModuleInit
{
  private stmts!: {
    insert: Database.Statement;
    selectAll: Database.Statement;
    selectAllByLang: Database.Statement;
    selectById: Database.Statement;
    selectByWord: Database.Statement;
    selectDue: Database.Statement;
    selectDueByLang: Database.Statement;
    updateSrs: Database.Statement;
    updateFields: Database.Statement;
    deleteById: Database.Statement;
  };

  constructor(private readonly connection: SqliteConnectionProvider) {
    super();
  }

  onModuleInit(): void {
    this.connection.db.exec(`
      CREATE TABLE IF NOT EXISTS vocabulary (
        id                TEXT PRIMARY KEY,
        word              TEXT NOT NULL,
        vocab_type        TEXT NOT NULL DEFAULT 'word',
        translation       TEXT NOT NULL DEFAULT '',
        target_lang       TEXT NOT NULL DEFAULT 'en',
        native_lang       TEXT NOT NULL DEFAULT 'ru',
        context_sentence  TEXT NOT NULL DEFAULT '',
        source_document_id TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        interval_days     REAL NOT NULL DEFAULT 0,
        easiness_factor   REAL NOT NULL DEFAULT 2.5,
        repetitions       INTEGER NOT NULL DEFAULT 0,
        next_review_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vocabulary_next_review ON vocabulary(next_review_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_word_langs ON vocabulary(word, target_lang, native_lang);
    `);

    const db = this.connection.db;
    this.stmts = {
      insert: db.prepare(
        `INSERT INTO vocabulary
          (id, word, vocab_type, translation, target_lang, native_lang, context_sentence, source_document_id, created_at, updated_at, next_review_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      selectAll: db.prepare(
        'SELECT * FROM vocabulary ORDER BY created_at DESC',
      ),
      selectAllByLang: db.prepare(
        'SELECT * FROM vocabulary WHERE target_lang = ? AND native_lang = ? ORDER BY created_at DESC',
      ),
      selectById: db.prepare('SELECT * FROM vocabulary WHERE id = ?'),
      selectByWord: db.prepare(
        'SELECT * FROM vocabulary WHERE word = ? AND target_lang = ? AND native_lang = ?',
      ),
      selectDue: db.prepare(
        'SELECT * FROM vocabulary WHERE next_review_at <= ? ORDER BY next_review_at ASC LIMIT ?',
      ),
      selectDueByLang: db.prepare(
        'SELECT * FROM vocabulary WHERE next_review_at <= ? AND target_lang = ? AND native_lang = ? ORDER BY next_review_at ASC LIMIT ?',
      ),
      updateSrs: db.prepare(
        'UPDATE vocabulary SET interval_days = ?, easiness_factor = ?, repetitions = ?, next_review_at = ?, updated_at = ? WHERE id = ?',
      ),
      updateFields: db.prepare(
        'UPDATE vocabulary SET translation = ?, context_sentence = ?, updated_at = ? WHERE id = ?',
      ),
      deleteById: db.prepare('DELETE FROM vocabulary WHERE id = ?'),
    };
  }

  private toEntity(r: VocabularyRow): VocabularyWord {
    return new VocabularyWord(
      r.id,
      r.word,
      r.vocab_type as VocabType,
      r.translation,
      r.target_lang,
      r.native_lang,
      r.context_sentence,
      r.source_document_id,
      r.created_at,
      r.updated_at,
      r.interval_days,
      r.easiness_factor,
      r.repetitions,
      r.next_review_at,
    );
  }

  async create(
    word: string,
    vocabType: VocabType,
    translation: string,
    targetLang: string,
    nativeLang: string,
    contextSentence: string,
    sourceDocumentId: string | null,
  ): Promise<VocabularyWord> {
    const existing = this.stmts.selectByWord.get(
      word,
      targetLang,
      nativeLang,
    ) as VocabularyRow | undefined;
    if (existing) {
      throw new Error(DUPLICATE_VOCABULARY_ERROR);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      this.stmts.insert.run(
        id, word, vocabType, translation, targetLang, nativeLang,
        contextSentence, sourceDocumentId, now, now, now,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed')
      ) {
        throw new Error(DUPLICATE_VOCABULARY_ERROR);
      }
      throw error;
    }
    return new VocabularyWord(
      id, word, vocabType, translation, targetLang, nativeLang,
      contextSentence, sourceDocumentId, now, now, 0, 2.5, 0, now,
    );
  }

  async createMany(inputs: CreateVocabularyInput[]): Promise<VocabularyWord[]> {
    if (inputs.length === 0) return [];

    const now = new Date().toISOString();
    const results: VocabularyWord[] = [];

    const insertMany = this.connection.db.transaction(
      (items: CreateVocabularyInput[]) => {
        for (const item of items) {
          const id = crypto.randomUUID();
          this.stmts.insert.run(
            id, item.word, item.vocabType, item.translation,
            item.targetLang, item.nativeLang, item.contextSentence,
            item.sourceDocumentId, now, now, now,
          );
          results.push(
            new VocabularyWord(
              id, item.word, item.vocabType, item.translation,
              item.targetLang, item.nativeLang, item.contextSentence,
              item.sourceDocumentId, now, now, 0, 2.5, 0, now,
            ),
          );
        }
      },
    );

    insertMany(inputs);
    return results;
  }

  async findAll(
    targetLang?: string,
    nativeLang?: string,
  ): Promise<VocabularyWord[]> {
    const rows = (targetLang && nativeLang
      ? this.stmts.selectAllByLang.all(targetLang, nativeLang)
      : this.stmts.selectAll.all()) as VocabularyRow[];
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<VocabularyWord | null> {
    const row = this.stmts.selectById.get(id) as VocabularyRow | undefined;
    return row ? this.toEntity(row) : null;
  }

  async findByWord(
    word: string,
    targetLang: string,
    nativeLang: string,
  ): Promise<VocabularyWord | null> {
    const row = this.stmts.selectByWord.get(
      word, targetLang, nativeLang,
    ) as VocabularyRow | undefined;
    return row ? this.toEntity(row) : null;
  }

  async findDueForReview(limit: number, targetLang?: string, nativeLang?: string): Promise<VocabularyWord[]> {
    const now = new Date().toISOString();
    const rows = (targetLang && nativeLang
      ? this.stmts.selectDueByLang.all(now, targetLang, nativeLang, limit)
      : this.stmts.selectDue.all(now, limit)) as VocabularyRow[];
    return rows.map((r) => this.toEntity(r));
  }

  async updateSrs(
    id: string,
    intervalDays: number,
    easinessFactor: number,
    repetitions: number,
    nextReviewAt: string,
  ): Promise<VocabularyWord | null> {
    const now = new Date().toISOString();
    const result = this.stmts.updateSrs.run(
      intervalDays, easinessFactor, repetitions, nextReviewAt, now, id,
    );
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  async update(
    id: string,
    translation: string,
    contextSentence: string,
  ): Promise<VocabularyWord | null> {
    const now = new Date().toISOString();
    const result = this.stmts.updateFields.run(
      translation, contextSentence, now, id,
    );
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.stmts.deleteById.run(id);
    return result.changes > 0;
  }
}
