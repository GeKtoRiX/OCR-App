import { ExerciseAttempt } from './exercise-attempt.entity';

describe('ExerciseAttempt', () => {
  it('stores all properties for a correct attempt', () => {
    const attempt = new ExerciseAttempt(
      'att-1', 'sess-1', 'vocab-1',
      'spelling', 'Translate: красивый', 'beautiful', 'beautiful',
      true, null, 5, null, '2024-01-01T00:00:00.000Z',
    );

    expect(attempt.id).toBe('att-1');
    expect(attempt.sessionId).toBe('sess-1');
    expect(attempt.vocabularyId).toBe('vocab-1');
    expect(attempt.exerciseType).toBe('spelling');
    expect(attempt.isCorrect).toBe(true);
    expect(attempt.errorPosition).toBeNull();
    expect(attempt.qualityRating).toBe(5);
    expect(attempt.mnemonicSentence).toBeNull();
  });

  it('stores error position for incorrect attempt', () => {
    const attempt = new ExerciseAttempt(
      'att-2', 'sess-1', 'vocab-1',
      'spelling', 'Translate: красивый', 'beautiful', 'beatiful',
      false, 'middle', 1,
      'Big Elephants Are Ugly',
      '2024-01-01T00:00:00.000Z',
    );

    expect(attempt.isCorrect).toBe(false);
    expect(attempt.errorPosition).toBe('middle');
    expect(attempt.qualityRating).toBe(1);
    expect(attempt.mnemonicSentence).toBe('Big Elephants Are Ugly');
  });
});
