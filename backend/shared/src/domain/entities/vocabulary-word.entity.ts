export type VocabType =
  | 'word'
  | 'phrasal_verb'
  | 'idiom'
  | 'collocation'
  | 'expression';

export type VocabularyWordPos =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | null;

export class VocabularyWord {
  constructor(
    public readonly id: string,
    public readonly word: string,
    public readonly vocabType: VocabType,
    public readonly translation: string,
    public readonly targetLang: string,
    public readonly nativeLang: string,
    public readonly contextSentence: string,
    public readonly sourceDocumentId: string | null,
    public readonly createdAt: string,
    public readonly updatedAt: string,
    public readonly intervalDays: number,
    public readonly easinessFactor: number,
    public readonly repetitions: number,
    public readonly nextReviewAt: string,
    public readonly pos: VocabularyWordPos = null,
  ) {}
}
