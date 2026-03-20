export class AddVocabularyDto {
  word!: string;
  vocabType!: string;
  translation!: string;
  targetLang!: string;
  nativeLang!: string;
  contextSentence!: string;
  sourceDocumentId?: string;
}

export class UpdateVocabularyDto {
  translation!: string;
  contextSentence!: string;
}
