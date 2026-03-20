import { SqlitePracticeSessionRepository } from './sqlite-practice-session.repository';
import { SqliteConnectionProvider } from './sqlite-connection.provider';
import { SqliteConfig } from '../config/sqlite.config';

describe('SqlitePracticeSessionRepository', () => {
  let repo: SqlitePracticeSessionRepository;
  let connection: SqliteConnectionProvider;

  beforeEach(() => {
    const config = { dbPath: ':memory:' } as SqliteConfig;
    connection = new SqliteConnectionProvider(config);
    connection.onModuleInit();
    repo = new SqlitePracticeSessionRepository(connection);
    repo.onModuleInit();
  });

  afterEach(() => {
    connection.onModuleDestroy();
  });

  describe('sessions', () => {
    it('creates a session', async () => {
      const session = await repo.createSession('en', 'ru');

      expect(session.id).toBeDefined();
      expect(session.targetLang).toBe('en');
      expect(session.nativeLang).toBe('ru');
      expect(session.completedAt).toBeNull();
      expect(session.totalExercises).toBe(0);
    });

    it('completes a session', async () => {
      const session = await repo.createSession('en', 'ru');

      const completed = await repo.completeSession(
        session.id, 10, 7, '{"overallScore": 70}',
      );

      expect(completed).not.toBeNull();
      expect(completed!.completedAt).toBeDefined();
      expect(completed!.totalExercises).toBe(10);
      expect(completed!.correctCount).toBe(7);
      expect(completed!.llmAnalysis).toBe('{"overallScore": 70}');
    });

    it('completeSession returns null for nonexistent id', async () => {
      expect(await repo.completeSession('missing', 0, 0, '{}')).toBeNull();
    });

    it('findSessionById returns session', async () => {
      const created = await repo.createSession('en', 'ru');

      const found = await repo.findSessionById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('findSessionById returns null when not found', async () => {
      expect(await repo.findSessionById('missing')).toBeNull();
    });

    it('findRecentSessions returns sessions', async () => {
      await repo.createSession('en', 'ru');
      await repo.createSession('en', 'es');

      const sessions = await repo.findRecentSessions(10);

      expect(sessions).toHaveLength(2);
    });
  });

  describe('attempts', () => {
    it('creates an attempt', async () => {
      const session = await repo.createSession('en', 'ru');

      const attempt = await repo.createAttempt(
        session.id, 'vocab-1', 'spelling',
        'Translate: тест', 'test', 'tset',
        false, 'middle', 1,
      );

      expect(attempt.id).toBeDefined();
      expect(attempt.isCorrect).toBe(false);
      expect(attempt.errorPosition).toBe('middle');
      expect(attempt.qualityRating).toBe(1);
      expect(attempt.mnemonicSentence).toBeNull();
    });

    it('findAttemptsBySession returns attempts for session', async () => {
      const session = await repo.createSession('en', 'ru');
      await repo.createAttempt(session.id, 'v1', 'spelling', 'p', 'a', 'a', true, null, 5);
      await repo.createAttempt(session.id, 'v2', 'fill_blank', 'p', 'b', 'c', false, 'end', 1);

      const attempts = await repo.findAttemptsBySession(session.id);

      expect(attempts).toHaveLength(2);
    });

    it('findAttemptsByVocabulary returns attempts for a word', async () => {
      const s1 = await repo.createSession('en', 'ru');
      const s2 = await repo.createSession('en', 'ru');
      await repo.createAttempt(s1.id, 'v1', 'spelling', 'p', 'a', 'a', true, null, 5);
      await repo.createAttempt(s2.id, 'v1', 'fill_blank', 'p', 'a', 'b', false, 'end', 1);
      await repo.createAttempt(s1.id, 'v2', 'spelling', 'p', 'c', 'c', true, null, 5);

      const attempts = await repo.findAttemptsByVocabulary('v1');

      expect(attempts).toHaveLength(2);
    });

    it('updateAttemptMnemonic sets mnemonic sentence', async () => {
      const session = await repo.createSession('en', 'ru');
      const attempt = await repo.createAttempt(
        session.id, 'v1', 'spelling', 'p', 'beautiful', 'beatiful',
        false, 'middle', 1,
      );

      await repo.updateAttemptMnemonic(attempt.id, 'Big Elephants Are Ugly');

      const attempts = await repo.findAttemptsBySession(session.id);
      expect(attempts[0].mnemonicSentence).toBe('Big Elephants Are Ugly');
    });
  });
});
