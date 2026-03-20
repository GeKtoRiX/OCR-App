import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
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

@Injectable()
export class SqliteVocabularyRepository
  extends IVocabularyRepository
  implements OnModuleInit
{
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
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.connection.db
      .prepare(
        `INSERT INTO vocabulary
          (id, word, vocab_type, translation, target_lang, native_lang, context_sentence, source_document_id, created_at, updated_at, next_review_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, word, vocabType, translation, targetLang, nativeLang, contextSentence, sourceDocumentId, now, now, now);
    return new VocabularyWord(
      id, word, vocabType, translation, targetLang, nativeLang,
      contextSentence, sourceDocumentId, now, now, 0, 2.5, 0, now,
    );
  }

  async findAll(
    targetLang?: string,
    nativeLang?: string,
  ): Promise<VocabularyWord[]> {
    let sql = 'SELECT * FROM vocabulary';
    const params: string[] = [];
    if (targetLang && nativeLang) {
      sql += ' WHERE target_lang = ? AND native_lang = ?';
      params.push(targetLang, nativeLang);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.connection.db.prepare(sql).all(...params) as VocabularyRow[];
    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<VocabularyWord | null> {
    const row = this.connection.db
      .prepare('SELECT * FROM vocabulary WHERE id = ?')
      .get(id) as VocabularyRow | undefined;
    return row ? this.toEntity(row) : null;
  }

  async findByWord(
    word: string,
    targetLang: string,
    nativeLang: string,
  ): Promise<VocabularyWord | null> {
    const row = this.connection.db
      .prepare(
        'SELECT * FROM vocabulary WHERE word = ? AND target_lang = ? AND native_lang = ?',
      )
      .get(word, targetLang, nativeLang) as VocabularyRow | undefined;
    return row ? this.toEntity(row) : null;
  }

  async findDueForReview(limit: number): Promise<VocabularyWord[]> {
    const now = new Date().toISOString();
    const rows = this.connection.db
      .prepare(
        'SELECT * FROM vocabulary WHERE next_review_at <= ? ORDER BY next_review_at ASC LIMIT ?',
      )
      .all(now, limit) as VocabularyRow[];
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
    const result = this.connection.db
      .prepare(
        'UPDATE vocabulary SET interval_days = ?, easiness_factor = ?, repetitions = ?, next_review_at = ?, updated_at = ? WHERE id = ?',
      )
      .run(intervalDays, easinessFactor, repetitions, nextReviewAt, now, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  async update(
    id: string,
    translation: string,
    contextSentence: string,
  ): Promise<VocabularyWord | null> {
    const now = new Date().toISOString();
    const result = this.connection.db
      .prepare(
        'UPDATE vocabulary SET translation = ?, context_sentence = ?, updated_at = ? WHERE id = ?',
      )
      .run(translation, contextSentence, now, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = this.connection.db
      .prepare('DELETE FROM vocabulary WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }
}
