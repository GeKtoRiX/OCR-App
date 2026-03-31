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
import { lastValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import {
  CreateDocumentPayload,
  ConfirmDocumentVocabularyPayload,
  ConfirmDocumentVocabularyResultDto,
  DeleteDocumentPayload,
  DOCUMENT_PATTERNS,
  FindDocumentByIdPayload,
  PrepareDocumentVocabularyPayload,
  PreparedDocumentVocabularyDto,
  SavedDocumentDto,
  UpdateDocumentPayload,
} from '@ocr-app/shared';
import { asUpstreamHttpError } from '../upstream-http-error';

@Controller('api/documents')
export class GatewayDocumentController {
  constructor(
    @Inject('DOCUMENT_SERVICE')
    private readonly documentClient: ClientProxy,
  ) {}

  @Post()
  async create(@Body() body: CreateDocumentPayload): Promise<SavedDocumentDto> {
    if (!body.markdown?.trim()) {
      throw new BadRequestException('markdown is required');
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
    @Body() body: { markdown: string },
  ): Promise<SavedDocumentDto> {
    if (!body.markdown?.trim()) {
      throw new BadRequestException('markdown is required');
    }
    const payload: UpdateDocumentPayload = { id, markdown: body.markdown };
    return this.send<UpdateDocumentPayload, SavedDocumentDto>(
      DOCUMENT_PATTERNS.UPDATE,
      payload,
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

  private async send<TPayload, TResult>(
    pattern: string,
    payload: TPayload,
    timeoutMs = 150_000,
  ): Promise<TResult> {
    try {
      return await lastValueFrom(
        this.documentClient
          .send<TResult, TPayload>(pattern, payload)
          .pipe(timeout(timeoutMs)),
        { defaultValue: undefined as TResult },
      );
    } catch (error) {
      throw asUpstreamHttpError(error, 'Document service request failed');
    }
  }
}
