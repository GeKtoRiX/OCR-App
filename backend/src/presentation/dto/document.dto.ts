export class CreateDocumentDto {
  markdown?: string;
  richTextHtml?: string | null;
  filename!: string;
}

export class UpdateDocumentDto {
  markdown?: string;
  richTextHtml?: string | null;
}

export class SavedDocumentResponseDto {
  id!: string;
  markdown!: string;
  richTextHtml!: string | null;
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
