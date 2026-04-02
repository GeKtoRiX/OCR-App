export class AddVocabularyDto {
  word!: string;
  vocabType!: string;
  pos?: string;
  translation!: string;
  targetLang!: string;
  nativeLang!: string;
  contextSentence!: string;
  sourceDocumentId?: string;
}

export class UpdateVocabularyDto {
  word?: string;
  vocabType?: string;
  pos?: string | null;
  translation!: string;
  contextSentence!: string;
}
