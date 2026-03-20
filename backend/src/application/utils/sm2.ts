import type { ExerciseType } from '../../domain/entities/exercise-attempt.entity';

export interface Sm2Result {
  interval: number;
  easinessFactor: number;
  repetitions: number;
}

export function calculateSm2(
  repetitions: number,
  easinessFactor: number,
  previousInterval: number,
  quality: number,
): Sm2Result {
  if (quality < 3) {
    return {
      interval: 0,
      easinessFactor: Math.max(1.3, easinessFactor - 0.2),
      repetitions: 0,
    };
  }

  const newRepetitions = repetitions + 1;
  let newInterval: number;

  if (newRepetitions === 1) {
    newInterval = 1;
  } else if (newRepetitions === 2) {
    newInterval = 6;
  } else {
    newInterval = Math.round(previousInterval * easinessFactor);
  }

  const newEf =
    easinessFactor +
    (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  return {
    interval: Math.max(1, newInterval),
    easinessFactor: Math.max(1.3, newEf),
    repetitions: newRepetitions,
  };
}

export function computeErrorPosition(
  userAnswer: string,
  correctAnswer: string,
): 'beginning' | 'middle' | 'end' {
  const ua = userAnswer.trim().toLowerCase();
  const ca = correctAnswer.trim().toLowerCase();
  const len = ca.length;
  if (len === 0) return 'beginning';

  const maxLen = Math.max(ua.length, ca.length);
  for (let i = 0; i < maxLen; i++) {
    if (ua[i] !== ca[i]) {
      const third = len / 3;
      if (i < third) return 'beginning';
      if (i < 2 * third) return 'middle';
      return 'end';
    }
  }
  return 'end';
}

export function computeQualityRating(
  isCorrect: boolean,
  exerciseType: ExerciseType,
): number {
  if (!isCorrect) return 1;
  switch (exerciseType) {
    case 'multiple_choice':
      return 4;
    case 'fill_blank':
      return 4;
    case 'context_sentence':
      return 5;
    case 'spelling':
      return 5;
    default:
      return 4;
  }
}
