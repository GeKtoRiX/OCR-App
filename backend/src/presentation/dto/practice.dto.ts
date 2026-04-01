export class StartPracticeDto {
  targetLang?: string;
  nativeLang?: string;
  wordLimit?: number;
}

export class PracticePlanDto {
  targetLang?: string;
  nativeLang?: string;
  wordLimit?: number;
}

export class GeneratePracticeRoundDto {
  sessionId!: string;
  vocabularyIds!: string[];
}

export class SubmitAnswerDto {
  sessionId!: string;
  vocabularyId!: string;
  exerciseType!: string;
  prompt!: string;
  correctAnswer!: string;
  userAnswer!: string;
}

export class CompletePracticeDto {
  sessionId!: string;
}
