import type { DocumentAnalysisStatus } from '../domain/entities/saved-document.entity';

export const DOCUMENT_PATTERNS = {
  CREATE: 'document.create',
  FIND_ALL: 'document.find_all',
  FIND_BY_ID: 'document.find_by_id',
  UPDATE: 'document.update',
  DELETE: 'document.delete',
  PREPARE_VOCABULARY: 'document.prepare_vocabulary',
  CONFIRM_VOCABULARY: 'document.confirm_vocabulary',
} as const;

export type DocumentCandidatePos = 'noun' | 'verb' | 'adjective' | 'adverb' | null;
export type DocumentCandidateReviewSource =
  | 'base_nlp'
  | 'llm_added'
  | 'llm_reclassified';

export interface SavedDocumentDto {
  id: string;
  markdown: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
  analysisStatus: DocumentAnalysisStatus;
  analysisError: string | null;
  analysisUpdatedAt: string | null;
}

export interface DocumentVocabCandidateDto {
  id: string;
  surface: string;
  normalized: string;
  lemma: string;
  vocabType: 'word' | 'phrasal_verb' | 'idiom' | 'collocation' | 'expression';
  pos: DocumentCandidatePos;
  translation: string;
  contextSentence: string;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
  selectedByDefault: boolean;
  isDuplicate: boolean;
  reviewSource: DocumentCandidateReviewSource;
}

export interface CreateDocumentPayload {
  markdown: string;
  filename: string;
}

export interface FindDocumentByIdPayload {
  id: string;
}

export interface UpdateDocumentPayload {
  id: string;
  markdown: string;
}

export interface DeleteDocumentPayload {
  id: string;
}

export interface PrepareDocumentVocabularyPayload {
  id: string;
  llmReview: boolean;
  targetLang: string;
  nativeLang: string;
}

export interface PreparedDocumentVocabularyDto {
  document: SavedDocumentDto;
  candidates: DocumentVocabCandidateDto[];
  llmReviewApplied: boolean;
}

export interface ConfirmDocumentVocabularyItemPayload {
  candidateId: string;
  word: string;
  vocabType: 'word' | 'phrasal_verb' | 'idiom' | 'collocation' | 'expression';
  translation: string;
  contextSentence: string;
}

export interface ConfirmDocumentVocabularyPayload {
  id: string;
  targetLang: string;
  nativeLang: string;
  items: ConfirmDocumentVocabularyItemPayload[];
}

export interface ConfirmDocumentVocabularyResultDto {
  savedCount: number;
  skippedDuplicateCount: number;
  failedCount: number;
  savedItems: {
    candidateId: string;
    vocabularyId: string;
    word: string;
  }[];
  skippedItems: {
    candidateId: string;
    word: string;
    reason: 'duplicate' | 'missing_candidate';
  }[];
  failedItems: {
    candidateId: string;
    word: string;
    reason: string;
  }[];
}
