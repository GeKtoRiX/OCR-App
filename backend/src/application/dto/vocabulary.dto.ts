import type { VocabType } from '../../domain/entities/vocabulary-word.entity';

export interface AddVocabularyInput {
  word: string;
  vocabType: VocabType;
  translation: string;
  targetLang: string;
  nativeLang: string;
  contextSentence: string;
  sourceDocumentId?: string;
}

export interface UpdateVocabularyInput {
  word?: string;
  translation: string;
  contextSentence: string;
}

export interface VocabularyOutput {
  id: string;
  word: string;
  vocabType: VocabType;
  translation: string;
  targetLang: string;
  nativeLang: string;
  contextSentence: string;
  sourceDocumentId: string | null;
  intervalDays: number;
  easinessFactor: number;
  repetitions: number;
  nextReviewAt: string;
  createdAt: string;
  updatedAt: string;
}
