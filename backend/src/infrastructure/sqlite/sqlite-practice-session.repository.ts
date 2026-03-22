import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import type Database from 'better-sqlite3';
import { IPracticeSessionRepository } from '../../domain/ports/practice-session-repository.port';
import { PracticeSession } from '../../domain/entities/practice-session.entity';
import {
  ExerciseAttempt,
  ExerciseType,
  ErrorPosition,
} from '../../domain/entities/exercise-attempt.entity';
import { SqliteConnectionProvider } from './sqlite-connection.provider';

interface SessionRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  target_lang: string;
  native_lang: string;
  total_exercises: number;
  correct_count: number;
  llm_analysis: string;
}

interface AttemptRow {
  id: string;
  session_id: string;
  vocabulary_id: string;
  exercise_type: string;
  prompt: string;
  correct_answer: string;
  user_answer: string;
  is_correct: number;
  error_position: string | null;
  quality_rating: number;
  mnemonic_sentence: string | null;
  created_at: string;
}

@Injectable()
export class SqlitePracticeSessionRepository
  extends IPracticeSessionRepository
  implements OnModuleInit
{
  private stmts!: {
    insertSession: Database.Statement;
    completeSession: Database.Statement;
    selectSessionById: Database.Statement;
    selectRecentSessions: Database.Statement;
    insertAttempt: Database.Statement;
    selectAttemptsBySession: Database.Statement;
    selectAttemptsByVocab: Database.Statement;
    updateMnemonic: Database.Statement;
  };

  constructor(private readonly connection: SqliteConnectionProvider) {
    super();
  }

  onModuleInit(): void {
    this.connection.db.exec(`
      CREATE TABLE IF NOT EXISTS practice_sessions (
        id              TEXT PRIMARY KEY,
        started_at      TEXT NOT NULL,
        completed_at    TEXT,
        target_lang     TEXT NOT NULL,
        native_lang     TEXT NOT NULL,
        total_exercises INTEGER NOT NULL DEFAULT 0,
        correct_count   INTEGER NOT NULL DEFAULT 0,
        llm_analysis    TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS exercise_attempts (
        id               TEXT PRIMARY KEY,
        session_id       TEXT NOT NULL,
        vocabulary_id    TEXT NOT NULL,
        exercise_type    TEXT NOT NULL,
        prompt           TEXT NOT NULL,
        correct_answer   TEXT NOT NULL,
        user_answer      TEXT NOT NULL,
        is_correct       INTEGER NOT NULL DEFAULT 0,
        error_position   TEXT,
        quality_rating   INTEGER NOT NULL DEFAULT 0,
        mnemonic_sentence TEXT,
        created_at       TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_exercise_attempts_session ON exercise_attempts(session_id);
      CREATE INDEX IF NOT EXISTS idx_exercise_attempts_vocab ON exercise_attempts(vocabulary_id);
    `);
    this.connection.db.pragma('foreign_keys = ON');

    const db = this.connection.db;
    this.stmts = {
      insertSession: db.prepare(
        'INSERT INTO practice_sessions (id, started_at, target_lang, native_lang) VALUES (?, ?, ?, ?)',
      ),
      completeSession: db.prepare(
        'UPDATE practice_sessions SET completed_at = ?, total_exercises = ?, correct_count = ?, llm_analysis = ? WHERE id = ?',
      ),
      selectSessionById: db.prepare(
        'SELECT * FROM practice_sessions WHERE id = ?',
      ),
      selectRecentSessions: db.prepare(
        'SELECT * FROM practice_sessions ORDER BY started_at DESC LIMIT ?',
      ),
      insertAttempt: db.prepare(
        `INSERT INTO exercise_attempts
          (id, session_id, vocabulary_id, exercise_type, prompt, correct_answer, user_answer, is_correct, error_position, quality_rating, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      selectAttemptsBySession: db.prepare(
        'SELECT * FROM exercise_attempts WHERE session_id = ? ORDER BY created_at ASC',
      ),
      selectAttemptsByVocab: db.prepare(
        'SELECT * FROM exercise_attempts WHERE vocabulary_id = ? ORDER BY created_at ASC',
      ),
      updateMnemonic: db.prepare(
        'UPDATE exercise_attempts SET mnemonic_sentence = ? WHERE id = ?',
      ),
    };
  }

  private toSession(r: SessionRow): PracticeSession {
    return new PracticeSession(
      r.id, r.started_at, r.completed_at,
      r.target_lang, r.native_lang,
      r.total_exercises, r.correct_count, r.llm_analysis,
    );
  }

  private toAttempt(r: AttemptRow): ExerciseAttempt {
    return new ExerciseAttempt(
      r.id, r.session_id, r.vocabulary_id,
      r.exercise_type as ExerciseType,
      r.prompt, r.correct_answer, r.user_answer,
      r.is_correct === 1,
      (r.error_position as ErrorPosition) ?? null,
      r.quality_rating,
      r.mnemonic_sentence,
      r.created_at,
    );
  }

  async createSession(
    targetLang: string,
    nativeLang: string,
  ): Promise<PracticeSession> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.stmts.insertSession.run(id, now, targetLang, nativeLang);
    return new PracticeSession(id, now, null, targetLang, nativeLang, 0, 0, '{}');
  }

  async completeSession(
    id: string,
    totalExercises: number,
    correctCount: number,
    llmAnalysis: string,
  ): Promise<PracticeSession | null> {
    const now = new Date().toISOString();
    const result = this.stmts.completeSession.run(
      now, totalExercises, correctCount, llmAnalysis, id,
    );
    if (result.changes === 0) return null;
    return this.findSessionById(id);
  }

  async findSessionById(id: string): Promise<PracticeSession | null> {
    const row = this.stmts.selectSessionById.get(id) as SessionRow | undefined;
    return row ? this.toSession(row) : null;
  }

  async findRecentSessions(limit: number): Promise<PracticeSession[]> {
    const rows = this.stmts.selectRecentSessions.all(limit) as SessionRow[];
    return rows.map((r) => this.toSession(r));
  }

  async createAttempt(
    sessionId: string,
    vocabularyId: string,
    exerciseType: ExerciseType,
    prompt: string,
    correctAnswer: string,
    userAnswer: string,
    isCorrect: boolean,
    errorPosition: ErrorPosition,
    qualityRating: number,
  ): Promise<ExerciseAttempt> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.stmts.insertAttempt.run(
      id, sessionId, vocabularyId, exerciseType,
      prompt, correctAnswer, userAnswer,
      isCorrect ? 1 : 0, errorPosition, qualityRating, now,
    );
    return new ExerciseAttempt(
      id, sessionId, vocabularyId, exerciseType,
      prompt, correctAnswer, userAnswer,
      isCorrect, errorPosition, qualityRating, null, now,
    );
  }

  async findAttemptsBySession(sessionId: string): Promise<ExerciseAttempt[]> {
    const rows = this.stmts.selectAttemptsBySession.all(sessionId) as AttemptRow[];
    return rows.map((r) => this.toAttempt(r));
  }

  async findAttemptsByVocabulary(
    vocabularyId: string,
  ): Promise<ExerciseAttempt[]> {
    const rows = this.stmts.selectAttemptsByVocab.all(vocabularyId) as AttemptRow[];
    return rows.map((r) => this.toAttempt(r));
  }

  async updateAttemptMnemonic(
    attemptId: string,
    mnemonicSentence: string,
  ): Promise<void> {
    this.stmts.updateMnemonic.run(mnemonicSentence, attemptId);
  }
}
