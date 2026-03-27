import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  AddVocabularyPayload,
  FindVocabularyByWordPayload,
  VOCABULARY_PATTERNS,
  VocabularyItemDto,
} from '@ocr-app/shared';
import {
  CreateVocabularyInput,
  IVocabularyRepository,
} from '../../domain/ports/vocabulary-repository.port';
import { VocabularyWord, VocabType } from '../../domain/entities/vocabulary-word.entity';

@Injectable()
export class TcpVocabularyRepository
  extends IVocabularyRepository
  implements OnModuleDestroy
{
  constructor(
    @Inject('VOCABULARY_SERVICE_CLIENT')
    private readonly vocabularyClient: ClientProxy,
  ) {
    super();
  }

  onModuleDestroy(): void {
    this.vocabularyClient.close();
  }

  private toEntity(item: VocabularyItemDto): VocabularyWord {
    return new VocabularyWord(
      item.id,
      item.word,
      item.vocabType,
      item.translation,
      item.targetLang,
      item.nativeLang,
      item.contextSentence,
      item.sourceDocumentId ?? null,
      item.createdAt,
      item.updatedAt,
      item.intervalDays,
      item.easinessFactor,
      item.repetitions,
      item.nextReviewAt,
    );
  }

  async create(
    word: string,
    vocabType: VocabType,
    translation: string,
    targetLang: string,
    nativeLang: string,
    contextSentence: string,
    sourceDocumentId: string | null,
  ): Promise<VocabularyWord> {
    const payload: AddVocabularyPayload = {
      word,
      vocabType,
      translation,
      targetLang,
      nativeLang,
      contextSentence,
      sourceDocumentId: sourceDocumentId ?? undefined,
    };

    const created = await lastValueFrom(
      this.vocabularyClient.send<VocabularyItemDto, AddVocabularyPayload>(
        VOCABULARY_PATTERNS.ADD,
        payload,
      ),
    );

    return this.toEntity(created);
  }

  async createMany(_inputs: CreateVocabularyInput[]): Promise<VocabularyWord[]> {
    throw new Error('TcpVocabularyRepository.createMany is not implemented');
  }

  async findAll(
    _targetLang?: string,
    _nativeLang?: string,
  ): Promise<VocabularyWord[]> {
    throw new Error('TcpVocabularyRepository.findAll is not implemented');
  }

  async findById(_id: string): Promise<VocabularyWord | null> {
    throw new Error('TcpVocabularyRepository.findById is not implemented');
  }

  async findByWord(
    word: string,
    targetLang: string,
    nativeLang: string,
  ): Promise<VocabularyWord | null> {
    const payload: FindVocabularyByWordPayload = {
      word,
      targetLang,
      nativeLang,
    };

    const found = await lastValueFrom(
      this.vocabularyClient.send<VocabularyItemDto | null, FindVocabularyByWordPayload>(
        VOCABULARY_PATTERNS.FIND_BY_WORD,
        payload,
      ),
    );

    return found ? this.toEntity(found) : null;
  }

  async findDueForReview(
    _limit: number,
    _targetLang?: string,
    _nativeLang?: string,
  ): Promise<VocabularyWord[]> {
    throw new Error('TcpVocabularyRepository.findDueForReview is not implemented');
  }

  async updateSrs(
    _id: string,
    _intervalDays: number,
    _easinessFactor: number,
    _repetitions: number,
    _nextReviewAt: string,
  ): Promise<VocabularyWord | null> {
    throw new Error('TcpVocabularyRepository.updateSrs is not implemented');
  }

  async update(
    _id: string,
    _translation: string,
    _contextSentence: string,
  ): Promise<VocabularyWord | null> {
    throw new Error('TcpVocabularyRepository.update is not implemented');
  }

  async delete(_id: string): Promise<boolean> {
    throw new Error('TcpVocabularyRepository.delete is not implemented');
  }
}
