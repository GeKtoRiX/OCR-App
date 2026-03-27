import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import {
  CreateDocumentPayload,
  DOCUMENT_PATTERNS,
  DeleteDocumentPayload,
  FindDocumentByIdPayload,
  SavedDocumentDto,
  UpdateDocumentPayload,
} from '@ocr-app/shared';
import { SavedDocumentUseCase } from '@backend/application/use-cases/saved-document.use-case';

@Controller()
export class DocumentMessageController {
  constructor(private readonly savedDocumentUseCase: SavedDocumentUseCase) {}

  @MessagePattern(DOCUMENT_PATTERNS.CREATE)
  async create(
    payload: CreateDocumentPayload,
  ): Promise<SavedDocumentDto> {
    if (!payload.markdown?.trim()) {
      throw new RpcException({ statusCode: 400, message: 'markdown is required' });
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
    if (!payload.markdown?.trim()) {
      throw new RpcException({ statusCode: 400, message: 'markdown is required' });
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
}
