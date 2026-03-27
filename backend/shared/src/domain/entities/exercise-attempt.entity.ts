export type ExerciseType =
  | 'fill_blank'
  | 'spelling'
  | 'context_sentence'
  | 'multiple_choice';

export type ErrorPosition = 'beginning' | 'middle' | 'end' | null;

export class ExerciseAttempt {
  constructor(
    public readonly id: string,
    public readonly sessionId: string,
    public readonly vocabularyId: string,
    public readonly exerciseType: ExerciseType,
    public readonly prompt: string,
    public readonly correctAnswer: string,
    public readonly userAnswer: string,
    public readonly isCorrect: boolean,
    public readonly errorPosition: ErrorPosition,
    public readonly qualityRating: number,
    public readonly mnemonicSentence: string | null,
    public readonly createdAt: string,
  ) {}
}
