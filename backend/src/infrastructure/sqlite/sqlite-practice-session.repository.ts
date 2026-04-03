import { Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import type Database from 'better-sqlite3';
import {
  IPracticeSessionRepository,
  type CachedGeneratedExercise,
  type CachedGeneratedExerciseSet,
  type GeneratedExerciseCacheKey,
  type VocabularyAttemptStats,
} from '../../domain/ports/practice-session-repository.port';
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

interface GeneratedExerciseSetRow {
  set_id: string;
  vocabulary_id: string;
  content_signature: string;
  set_created_at: string;
  exercise_type: string;
  prompt: string;
  correct_answer: string;
  options_json: string | null;
}

const REQUIRED_CACHED_EXERCISE_TYPES: ExerciseType[] = [
  'multiple_choice',
  'spelling',
  'context_sentence',
  'fill_blank',
];

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
    insertGeneratedExerciseSet: Database.Statement;
    insertGeneratedExercise: Database.Statement;
    updateMnemonic: Database.Statement;
  };

  private readonly vocabStatsStmtCache = new Map<number, Database.Statement>();
  private readonly generatedExerciseSetsStmtCache = new Map<number, Database.Statement>();

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

      CREATE TABLE IF NOT EXISTS generated_exercise_sets (
        id                TEXT PRIMARY KEY,
        vocabulary_id     TEXT NOT NULL,
        content_signature TEXT NOT NULL,
        created_at        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generated_exercises (
        id             TEXT PRIMARY KEY,
        set_id         TEXT NOT NULL,
        exercise_type  TEXT NOT NULL,
        prompt         TEXT NOT NULL,
        correct_answer TEXT NOT NULL,
        options_json   TEXT,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_generated_exercise_sets_vocab
        ON generated_exercise_sets(vocabulary_id);
      CREATE INDEX IF NOT EXISTS idx_generated_exercise_sets_signature
        ON generated_exercise_sets(content_signature);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_exercises_set_type
        ON generated_exercises(set_id, exercise_type);
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
      insertGeneratedExerciseSet: db.prepare(
        `INSERT INTO generated_exercise_sets
          (id, vocabulary_id, content_signature, created_at)
         VALUES (?, ?, ?, ?)`,
      ),
      insertGeneratedExercise: db.prepare(
        `INSERT INTO generated_exercises
          (id, set_id, exercise_type, prompt, correct_answer, options_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ),
      updateMnemonic: db.prepare(
        'UPDATE exercise_attempts SET mnemonic_sentence = ? WHERE id = ?',
      ),
    };
  }

  private getVocabStatsStmt(count: number): Database.Statement {
    if (!this.vocabStatsStmtCache.has(count)) {
      const placeholders = Array(count).fill('?').join(', ');
      this.vocabStatsStmtCache.set(
        count,
        this.connection.db.prepare(
          `SELECT vocabulary_id AS vocabularyId,
                  COUNT(*) AS attemptCount,
                  SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS incorrectCount
           FROM exercise_attempts
           WHERE vocabulary_id IN (${placeholders})
           GROUP BY vocabulary_id`,
        ),
      );
    }
    return this.vocabStatsStmtCache.get(count)!;
  }

  private getGeneratedExerciseSetsStmt(count: number): Database.Statement {
    if (!this.generatedExerciseSetsStmtCache.has(count)) {
      const whereClause = Array(count)
        .fill('(s.vocabulary_id = ? AND s.content_signature = ?)')
        .join(' OR ');
      this.generatedExerciseSetsStmtCache.set(
        count,
        this.connection.db.prepare(
          `SELECT s.id AS set_id,
                  s.vocabulary_id,
                  s.content_signature,
                  s.created_at AS set_created_at,
                  e.exercise_type,
                  e.prompt,
                  e.correct_answer,
                  e.options_json
           FROM generated_exercise_sets s
           JOIN generated_exercises e ON e.set_id = s.id
           WHERE ${whereClause}
           ORDER BY s.created_at DESC, e.created_at ASC`,
        ),
      );
    }
    return this.generatedExerciseSetsStmtCache.get(count)!;
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

  private parseGeneratedExerciseOptions(
    value: string | null,
  ): string[] | undefined {
    if (!value) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
        ? parsed
        : undefined;
    } catch {
      return undefined;
    }
  }

  private isValidGeneratedExerciseSet(
    exercises: CachedGeneratedExercise[],
  ): boolean {
    if (exercises.length !== REQUIRED_CACHED_EXERCISE_TYPES.length) {
      return false;
    }

    const types = new Set(exercises.map((exercise) => exercise.exerciseType));
    return REQUIRED_CACHED_EXERCISE_TYPES.every((type) => types.has(type));
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

  async findVocabularyStats(
    vocabularyIds: string[],
  ): Promise<VocabularyAttemptStats[]> {
    if (vocabularyIds.length === 0) return [];
    const rows = this.getVocabStatsStmt(vocabularyIds.length).all(
      ...vocabularyIds,
    ) as Array<{ vocabularyId: string; attemptCount: number; incorrectCount: number | null }>;
    return rows.map((row) => ({
      vocabularyId: row.vocabularyId,
      attemptCount: row.attemptCount,
      incorrectCount: row.incorrectCount ?? 0,
    }));
  }

  async findGeneratedExerciseSets(
    keys: GeneratedExerciseCacheKey[],
  ): Promise<CachedGeneratedExerciseSet[]> {
    if (keys.length === 0) {
      return [];
    }

    const params = keys.flatMap((key) => [key.vocabularyId, key.contentSignature]);
    const rows = this.getGeneratedExerciseSetsStmt(keys.length).all(
      ...params,
    ) as GeneratedExerciseSetRow[];

    const sets = new Map<string, CachedGeneratedExerciseSet>();
    for (const row of rows) {
      const existing = sets.get(row.set_id);
      const exercise: CachedGeneratedExercise = {
        exerciseType: row.exercise_type as ExerciseType,
        prompt: row.prompt,
        correctAnswer: row.correct_answer,
        options: this.parseGeneratedExerciseOptions(row.options_json),
      };

      if (existing) {
        existing.exercises.push(exercise);
        continue;
      }

      sets.set(row.set_id, {
        setId: row.set_id,
        vocabularyId: row.vocabulary_id,
        contentSignature: row.content_signature,
        createdAt: row.set_created_at,
        exercises: [exercise],
      });
    }

    return [...sets.values()].filter((set) =>
      this.isValidGeneratedExerciseSet(set.exercises),
    );
  }

  async saveGeneratedExerciseSet(
    vocabularyId: string,
    contentSignature: string,
    exercises: CachedGeneratedExercise[],
  ): Promise<void> {
    if (!this.isValidGeneratedExerciseSet(exercises)) {
      return;
    }

    const insertSet = this.connection.db.transaction(
      (
        wordId: string,
        signature: string,
        cachedExercises: CachedGeneratedExercise[],
      ) => {
        const setId = crypto.randomUUID();
        const now = new Date().toISOString();
        this.stmts.insertGeneratedExerciseSet.run(
          setId,
          wordId,
          signature,
          now,
        );

        for (const exercise of cachedExercises) {
          this.stmts.insertGeneratedExercise.run(
            crypto.randomUUID(),
            setId,
            exercise.exerciseType,
            exercise.prompt,
            exercise.correctAnswer,
            exercise.options ? JSON.stringify(exercise.options) : null,
            now,
          );
        }
      },
    );

    insertSet(vocabularyId, contentSignature, exercises);
  }

  async updateAttemptMnemonic(
    attemptId: string,
    mnemonicSentence: string,
  ): Promise<void> {
    this.stmts.updateMnemonic.run(mnemonicSentence, attemptId);
  }
}
