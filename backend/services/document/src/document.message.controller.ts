import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import {
  ConfirmDocumentVocabularyPayload,
  ConfirmDocumentVocabularyResultDto,
  CreateDocumentPayload,
  DOCUMENT_PATTERNS,
  DeleteDocumentPayload,
  FindDocumentByIdPayload,
  hasDocumentContent,
  PrepareDocumentVocabularyPayload,
  PreparedDocumentVocabularyDto,
  SavedDocumentDto,
  UpdateDocumentPayload,
} from '@ocr-app/shared';
import { SavedDocumentUseCase } from '@backend/application/use-cases/saved-document.use-case';
import { DocumentVocabularyPipelineUseCase } from '@backend/application/use-cases/document-vocabulary-pipeline.use-case';

@Controller()
export class DocumentMessageController {
  constructor(
    private readonly savedDocumentUseCase: SavedDocumentUseCase,
    private readonly pipelineUseCase: DocumentVocabularyPipelineUseCase,
  ) {}

  @MessagePattern(DOCUMENT_PATTERNS.CREATE)
  async create(
    payload: CreateDocumentPayload,
  ): Promise<SavedDocumentDto> {
    if (!hasDocumentContent(payload)) {
      throw new RpcException({ statusCode: 400, message: 'markdown or richTextHtml is required' });
    }
    if (!payload.filename?.trim()) {
      throw new RpcException({ statusCode: 400, message: 'filename is required' });
    }
    return this.savedDocumentUseCase.create(payload);
  }

  @MessagePattern(DOCUMENT_PATTERNS.FIND_ALL)
  async findAll(): Promise<SavedDocumentDto[]> {
    return this.savedDocumentUseCase.findAll();
  }

  @MessagePattern(DOCUMENT_PATTERNS.FIND_BY_ID)
  async findById(
    payload: FindDocumentByIdPayload,
  ): Promise<SavedDocumentDto> {
    const doc = await this.savedDocumentUseCase.findById(payload.id);
    if (!doc) {
      throw new RpcException({ statusCode: 404, message: 'Document not found' });
    }
    return doc;
  }

  @MessagePattern(DOCUMENT_PATTERNS.UPDATE)
  async update(
    payload: UpdateDocumentPayload,
  ): Promise<SavedDocumentDto> {
    if (!hasDocumentContent(payload)) {
      throw new RpcException({ statusCode: 400, message: 'markdown or richTextHtml is required' });
    }
    const doc = await this.savedDocumentUseCase.update(payload.id, payload);
    if (!doc) {
      throw new RpcException({ statusCode: 404, message: 'Document not found' });
    }
    return doc;
  }

  @MessagePattern(DOCUMENT_PATTERNS.DELETE)
  async remove(payload: DeleteDocumentPayload): Promise<void> {
    const deleted = await this.savedDocumentUseCase.delete(payload.id);
    if (!deleted) {
      throw new RpcException({ statusCode: 404, message: 'Document not found' });
    }
  }

  @MessagePattern(DOCUMENT_PATTERNS.PREPARE_VOCABULARY)
  async prepareVocabulary(
    payload: PrepareDocumentVocabularyPayload,
  ): Promise<PreparedDocumentVocabularyDto> {
    const prepared = await this.pipelineUseCase.prepareVocabulary(payload.id, {
      llmReview: payload.llmReview,
      targetLang: payload.targetLang,
      nativeLang: payload.nativeLang,
      selectedCandidateIds: payload.selectedCandidateIds,
    });
    if (!prepared) {
      throw new RpcException({ statusCode: 404, message: 'Document not found' });
    }
    return prepared;
  }

  @MessagePattern(DOCUMENT_PATTERNS.CONFIRM_VOCABULARY)
  async confirmVocabulary(
    payload: ConfirmDocumentVocabularyPayload,
  ): Promise<ConfirmDocumentVocabularyResultDto> {
    const confirmed = await this.pipelineUseCase.confirmVocabulary(payload.id, {
      targetLang: payload.targetLang,
      nativeLang: payload.nativeLang,
      items: payload.items.map((item) => ({
        candidateId: item.candidateId,
        word: item.word,
        vocabType: item.vocabType,
        translation: item.translation,
        contextSentence: item.contextSentence,
      })),
    });
    if (!confirmed) {
      throw new RpcException({ statusCode: 404, message: 'Document not found' });
    }
    return confirmed;
  }
}
