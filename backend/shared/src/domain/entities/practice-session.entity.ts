export class PracticeSession {
  constructor(
    public readonly id: string,
    public readonly startedAt: string,
    public readonly completedAt: string | null,
    public readonly targetLang: string,
    public readonly nativeLang: string,
    public readonly totalExercises: number,
    public readonly correctCount: number,
    public readonly llmAnalysis: string,
  ) {}
}
