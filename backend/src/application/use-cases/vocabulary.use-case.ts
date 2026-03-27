import { Injectable } from '@nestjs/common';
import {
  IVocabularyRepository,
  VOCABULARY_DUPLICATE_ERROR,
} from '../../domain/ports/vocabulary-repository.port';
import {
  AddVocabularyInput,
  UpdateVocabularyInput,
  VocabularyOutput,
} from '../dto/vocabulary.dto';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';

@Injectable()
export class VocabularyUseCase {
  constructor(private readonly repository: IVocabularyRepository) {}

  private toOutput(w: VocabularyWord): VocabularyOutput {
    return {
      id: w.id,
      word: w.word,
      vocabType: w.vocabType,
      translation: w.translation,
      targetLang: w.targetLang,
      nativeLang: w.nativeLang,
      contextSentence: w.contextSentence,
      sourceDocumentId: w.sourceDocumentId,
      intervalDays: w.intervalDays,
      easinessFactor: w.easinessFactor,
      repetitions: w.repetitions,
      nextReviewAt: w.nextReviewAt,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    };
  }

  async add(input: AddVocabularyInput): Promise<VocabularyOutput> {
    const existing = await this.repository.findByWord(
      input.word,
      input.targetLang,
      input.nativeLang,
    );
    if (existing) {
      throw new Error(VOCABULARY_DUPLICATE_ERROR);
    }

    const word = await this.repository.create(
      input.word,
      input.vocabType,
      input.translation,
      input.targetLang,
      input.nativeLang,
      input.contextSentence,
      input.sourceDocumentId ?? null,
    );
    return this.toOutput(word);
  }

  async addMany(inputs: AddVocabularyInput[]): Promise<VocabularyOutput[]> {
    const words = await this.repository.createMany(
      inputs.map((i) => ({
        word: i.word,
        vocabType: i.vocabType,
        translation: i.translation,
        targetLang: i.targetLang,
        nativeLang: i.nativeLang,
        contextSentence: i.contextSentence,
        sourceDocumentId: i.sourceDocumentId ?? null,
      })),
    );
    return words.map((w) => this.toOutput(w));
  }

  async findAll(
    targetLang?: string,
    nativeLang?: string,
  ): Promise<VocabularyOutput[]> {
    const words = await this.repository.findAll(targetLang, nativeLang);
    return words.map((w) => this.toOutput(w));
  }

  async findById(id: string): Promise<VocabularyOutput | null> {
    const word = await this.repository.findById(id);
    return word ? this.toOutput(word) : null;
  }

  async findByWord(
    word: string,
    targetLang: string,
    nativeLang: string,
  ): Promise<VocabularyOutput | null> {
    const found = await this.repository.findByWord(word, targetLang, nativeLang);
    return found ? this.toOutput(found) : null;
  }

  async findDueForReview(limit?: number): Promise<VocabularyOutput[]> {
    const words = await this.repository.findDueForReview(limit ?? 10);
    return words.map((w) => this.toOutput(w));
  }

  async update(
    id: string,
    input: UpdateVocabularyInput,
  ): Promise<VocabularyOutput | null> {
    const word = await this.repository.update(
      id,
      input.translation,
      input.contextSentence,
    );
    return word ? this.toOutput(word) : null;
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }
}
