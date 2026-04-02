import {
  VocabularyWord,
  VocabType,
  VocabularyWordPos,
} from '../entities/vocabulary-word.entity';

export interface CreateVocabularyInput {
  word: string;
  vocabType: VocabType;
  pos?: VocabularyWordPos;
  translation: string;
  targetLang: string;
  nativeLang: string;
  contextSentence: string;
  sourceDocumentId: string | null;
}

export abstract class IVocabularyRepository {
  abstract create(
    word: string,
    vocabType: VocabType,
    translation: string,
    targetLang: string,
    nativeLang: string,
    contextSentence: string,
    sourceDocumentId: string | null,
    pos?: VocabularyWordPos,
  ): Promise<VocabularyWord>;
  abstract createMany(inputs: CreateVocabularyInput[]): Promise<VocabularyWord[]>;
  abstract findAll(
    targetLang?: string,
    nativeLang?: string,
  ): Promise<VocabularyWord[]>;
  abstract findById(id: string): Promise<VocabularyWord | null>;
  abstract findByWord(
    word: string,
    targetLang: string,
    nativeLang: string,
  ): Promise<VocabularyWord | null>;
  abstract findDueForReview(limit: number, targetLang?: string, nativeLang?: string): Promise<VocabularyWord[]>;
  abstract updateSrs(
    id: string,
    intervalDays: number,
    easinessFactor: number,
    repetitions: number,
    nextReviewAt: string,
  ): Promise<VocabularyWord | null>;
  abstract update(
    id: string,
    translation: string,
    contextSentence: string,
    word?: string,
    vocabType?: VocabType,
    pos?: VocabularyWordPos,
  ): Promise<VocabularyWord | null>;
  abstract delete(id: string): Promise<boolean>;
}
