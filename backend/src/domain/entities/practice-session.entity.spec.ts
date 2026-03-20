import { PracticeSession } from './practice-session.entity';

describe('PracticeSession', () => {
  it('stores all properties', () => {
    const session = new PracticeSession(
      'sess-1',
      '2024-01-01T00:00:00.000Z',
      '2024-01-01T00:30:00.000Z',
      'en',
      'ru',
      10,
      7,
      '{"overallScore": 70}',
    );

    expect(session.id).toBe('sess-1');
    expect(session.startedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(session.completedAt).toBe('2024-01-01T00:30:00.000Z');
    expect(session.targetLang).toBe('en');
    expect(session.nativeLang).toBe('ru');
    expect(session.totalExercises).toBe(10);
    expect(session.correctCount).toBe(7);
    expect(session.llmAnalysis).toBe('{"overallScore": 70}');
  });

  it('allows null completedAt for in-progress session', () => {
    const session = new PracticeSession(
      'sess-2', '2024-01-01T00:00:00.000Z', null,
      'en', 'ru', 0, 0, '{}',
    );

    expect(session.completedAt).toBeNull();
  });
});
