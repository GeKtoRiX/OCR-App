import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import {
  AddVocabularyPayload,
  CompletePracticePayload,
  CompletePracticeResponse,
  DeleteVocabularyPayload,
  FindAllVocabularyPayload,
  FindVocabularyByWordPayload,
  FindDueVocabularyPayload,
  FindVocabularyByIdPayload,
  PracticeSessionsPayload,
  PracticeStatsPayload,
  StartPracticePayload,
  StartPracticeResponse,
  SubmitPracticeAnswerPayload,
  SubmitPracticeAnswerResponse,
  UpdateVocabularyPayload,
  VOCABULARY_PATTERNS,
  VocabularyItemDto,
} from '@ocr-app/shared';
import { PracticeUseCase } from '@backend/application/use-cases/practice.use-case';
import {
  VOCABULARY_DUPLICATE_ERROR,
  VocabularyUseCase,
} from '@backend/application/use-cases/vocabulary.use-case';

@Controller()
export class VocabularyMessageController {
  constructor(
    private readonly vocabularyUseCase: VocabularyUseCase,
    private readonly practiceUseCase: PracticeUseCase,
  ) {}

  @MessagePattern(VOCABULARY_PATTERNS.ADD)
  async add(payload: AddVocabularyPayload): Promise<VocabularyItemDto> {
    try {
      return await this.vocabularyUseCase.add(payload);
    } catch (error) {
      this.rethrowVocabularyError(error);
    }
  }

  @MessagePattern(VOCABULARY_PATTERNS.ADD_MANY)
  async addMany(
    payload: AddVocabularyPayload[],
  ): Promise<VocabularyItemDto[]> {
    try {
      return await this.vocabularyUseCase.addMany(payload);
    } catch (error) {
      this.rethrowVocabularyError(error);
    }
  }

  @MessagePattern(VOCABULARY_PATTERNS.FIND_ALL)
  async findAll(
    payload: FindAllVocabularyPayload,
  ): Promise<VocabularyItemDto[]> {
    return this.vocabularyUseCase.findAll(payload?.targetLang, payload?.nativeLang);
  }

  @MessagePattern(VOCABULARY_PATTERNS.FIND_DUE)
  async findDue(
    payload: FindDueVocabularyPayload,
  ): Promise<VocabularyItemDto[]> {
    return this.vocabularyUseCase.findDueForReview(payload?.limit);
  }

  @MessagePattern(VOCABULARY_PATTERNS.FIND_BY_ID)
  async findById(
    payload: FindVocabularyByIdPayload,
  ): Promise<VocabularyItemDto> {
    const word = await this.vocabularyUseCase.findById(payload.id);
    if (!word) {
      throw new RpcException({ statusCode: 404, message: 'Word not found' });
    }
    return word;
  }

  @MessagePattern(VOCABULARY_PATTERNS.FIND_BY_WORD)
  async findByWord(
    payload: FindVocabularyByWordPayload,
  ): Promise<VocabularyItemDto | null> {
    return this.vocabularyUseCase.findByWord(
      payload.word,
      payload.targetLang,
      payload.nativeLang,
    );
  }

  @MessagePattern(VOCABULARY_PATTERNS.UPDATE)
  async update(
    payload: UpdateVocabularyPayload,
  ): Promise<VocabularyItemDto> {
    const word = await this.vocabularyUseCase.update(payload.id, payload);
    if (!word) {
      throw new RpcException({ statusCode: 404, message: 'Word not found' });
    }
    return word;
  }

  @MessagePattern(VOCABULARY_PATTERNS.DELETE)
  async remove(payload: DeleteVocabularyPayload): Promise<void> {
    const deleted = await this.vocabularyUseCase.delete(payload.id);
    if (!deleted) {
      throw new RpcException({ statusCode: 404, message: 'Word not found' });
    }
  }

  @MessagePattern(VOCABULARY_PATTERNS.PRACTICE_START)
  async startPractice(
    payload: StartPracticePayload,
  ): Promise<StartPracticeResponse> {
    try {
      return await this.practiceUseCase.startPractice(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start practice';
      if (message === 'No words due for review') {
        throw new RpcException({ statusCode: 400, message });
      }
      throw new RpcException({ statusCode: 502, message });
    }
  }

  @MessagePattern(VOCABULARY_PATTERNS.PRACTICE_ANSWER)
  async submitAnswer(
    payload: SubmitPracticeAnswerPayload,
  ): Promise<SubmitPracticeAnswerResponse> {
    return this.practiceUseCase.submitAnswer(payload);
  }

  @MessagePattern(VOCABULARY_PATTERNS.PRACTICE_COMPLETE)
  async completePractice(
    payload: CompletePracticePayload,
  ): Promise<CompletePracticeResponse> {
    try {
      return await this.practiceUseCase.completeSession(payload.sessionId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to complete session';
      throw new RpcException({ statusCode: 502, message });
    }
  }

  @MessagePattern(VOCABULARY_PATTERNS.PRACTICE_SESSIONS)
  async sessions(payload: PracticeSessionsPayload): Promise<unknown> {
    return this.practiceUseCase.getRecentSessions(payload?.limit ?? 20);
  }

  @MessagePattern(VOCABULARY_PATTERNS.PRACTICE_STATS)
  async stats(payload: PracticeStatsPayload): Promise<unknown> {
    return this.practiceUseCase.getAttemptsByVocabulary(payload.vocabularyId);
  }

  private rethrowVocabularyError(error: unknown): never {
    if (
      error instanceof Error &&
      error.message === VOCABULARY_DUPLICATE_ERROR
    ) {
      throw new RpcException({ statusCode: 409, message: error.message });
    }
    const message =
      error instanceof Error ? error.message : 'Vocabulary service request failed';
    throw new RpcException({ statusCode: 502, message });
  }
}
