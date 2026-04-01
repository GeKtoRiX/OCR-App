import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Body,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CreateDocumentPayload,
  ConfirmDocumentVocabularyPayload,
  ConfirmDocumentVocabularyResultDto,
  DeleteDocumentPayload,
  DOCUMENT_PATTERNS,
  FindDocumentByIdPayload,
  hasDocumentContent,
  PrepareDocumentVocabularyPayload,
  PreparedDocumentVocabularyDto,
  SavedDocumentDto,
  UpdateDocumentPayload,
} from '@ocr-app/shared';
import { gatewaySend } from '../gateway-send';

@Controller('api/documents')
export class GatewayDocumentController {
  constructor(
    @Inject('DOCUMENT_SERVICE')
    private readonly documentClient: ClientProxy,
  ) {}

  @Post()
  async create(@Body() body: CreateDocumentPayload): Promise<SavedDocumentDto> {
    if (!hasDocumentContent(body)) {
      throw new BadRequestException('markdown or richTextHtml is required');
    }
    if (!body.filename?.trim()) {
      throw new BadRequestException('filename is required');
    }
    return this.send<CreateDocumentPayload, SavedDocumentDto>(
      DOCUMENT_PATTERNS.CREATE,
      body,
    );
  }

  @Get()
  async findAll(): Promise<SavedDocumentDto[]> {
    return this.send<object, SavedDocumentDto[]>(DOCUMENT_PATTERNS.FIND_ALL, {});
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<SavedDocumentDto> {
    return this.send<FindDocumentByIdPayload, SavedDocumentDto>(
      DOCUMENT_PATTERNS.FIND_BY_ID,
      { id },
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Omit<UpdateDocumentPayload, 'id'>,
  ): Promise<SavedDocumentDto> {
    if (!hasDocumentContent(body)) {
      throw new BadRequestException('markdown or richTextHtml is required');
    }
    return this.send<UpdateDocumentPayload, SavedDocumentDto>(
      DOCUMENT_PATTERNS.UPDATE,
      { ...body, id },
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.send<DeleteDocumentPayload, void>(DOCUMENT_PATTERNS.DELETE, {
      id,
    });
  }

  @Post(':id/vocabulary/prepare')
  async prepareVocabulary(
    @Param('id') id: string,
    @Body() body: Omit<PrepareDocumentVocabularyPayload, 'id'>,
  ): Promise<PreparedDocumentVocabularyDto> {
    if (!body.targetLang?.trim() || !body.nativeLang?.trim()) {
      throw new BadRequestException('targetLang and nativeLang are required');
    }
    const payload: PrepareDocumentVocabularyPayload = {
      id,
      llmReview: Boolean(body.llmReview),
      targetLang: body.targetLang.trim(),
      nativeLang: body.nativeLang.trim(),
      selectedCandidateIds: Array.isArray(body.selectedCandidateIds)
        ? body.selectedCandidateIds
        : undefined,
    };
    return this.send<PrepareDocumentVocabularyPayload, PreparedDocumentVocabularyDto>(
      DOCUMENT_PATTERNS.PREPARE_VOCABULARY,
      payload,
    );
  }

  @Post(':id/vocabulary/confirm')
  async confirmVocabulary(
    @Param('id') id: string,
    @Body() body: Omit<ConfirmDocumentVocabularyPayload, 'id'>,
  ): Promise<ConfirmDocumentVocabularyResultDto> {
    if (!body.targetLang?.trim() || !body.nativeLang?.trim()) {
      throw new BadRequestException('targetLang and nativeLang are required');
    }
    if (!Array.isArray(body.items)) {
      throw new BadRequestException('items must be an array');
    }
    const payload: ConfirmDocumentVocabularyPayload = {
      id,
      targetLang: body.targetLang.trim(),
      nativeLang: body.nativeLang.trim(),
      items: body.items,
    };
    return this.send<ConfirmDocumentVocabularyPayload, ConfirmDocumentVocabularyResultDto>(
      DOCUMENT_PATTERNS.CONFIRM_VOCABULARY,
      payload,
    );
  }

  private send<TPayload, TResult>(
    pattern: string,
    payload: TPayload,
    timeoutMs = 150_000,
  ): Promise<TResult> {
    return gatewaySend(this.documentClient, pattern, payload, 'Document service request failed', timeoutMs);
  }
}
