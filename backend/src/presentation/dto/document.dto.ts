export class CreateDocumentDto {
  markdown!: string;
  filename!: string;
}

export class UpdateDocumentDto {
  markdown!: string;
}

export class SavedDocumentResponseDto {
  id!: string;
  markdown!: string;
  filename!: string;
  createdAt!: string;
  updatedAt!: string;
  analysisStatus!: 'idle' | 'pending' | 'ready' | 'failed';
  analysisError!: string | null;
  analysisUpdatedAt!: string | null;
}

export class PrepareDocumentVocabularyDto {
  llmReview!: boolean;
  targetLang!: string;
  nativeLang!: string;
}

export class ConfirmDocumentVocabularyItemDto {
  candidateId!: string;
  word!: string;
  vocabType!: string;
  translation!: string;
  contextSentence!: string;
}

export class ConfirmDocumentVocabularyDto {
  targetLang!: string;
  nativeLang!: string;
  items!: ConfirmDocumentVocabularyItemDto[];
}
