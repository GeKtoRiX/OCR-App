import type { DocumentAnalysisStatus } from '../../domain/entities/saved-document.entity';
import type {
  DocumentCandidatePos,
  DocumentCandidateReviewSource,
} from '../../domain/entities/document-vocab-candidate.entity';
import type { VocabType } from '../../domain/entities/vocabulary-word.entity';

export interface CreateDocumentInput {
  markdown: string;
  filename: string;
}

export interface UpdateDocumentInput {
  markdown: string;
}

export interface SavedDocumentOutput {
  id: string;
  markdown: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
  analysisStatus: DocumentAnalysisStatus;
  analysisError: string | null;
  analysisUpdatedAt: string | null;
}

export interface PrepareDocumentVocabularyInput {
  llmReview: boolean;
  targetLang: string;
  nativeLang: string;
  selectedCandidateIds?: string[];
}

export interface DocumentVocabCandidateOutput {
  id: string;
  surface: string;
  normalized: string;
  lemma: string;
  vocabType: VocabType;
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

export interface PreparedDocumentVocabularyOutput {
  document: SavedDocumentOutput;
  candidates: DocumentVocabCandidateOutput[];
  llmReviewApplied: boolean;
}

export interface ConfirmDocumentVocabularyItemInput {
  candidateId: string;
  word: string;
  vocabType: VocabType;
  translation: string;
  contextSentence: string;
}

export interface ConfirmDocumentVocabularyInput {
  targetLang: string;
  nativeLang: string;
  items: ConfirmDocumentVocabularyItemInput[];
}

export interface ConfirmDocumentVocabularyOutput {
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
