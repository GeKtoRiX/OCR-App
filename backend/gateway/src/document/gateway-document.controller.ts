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
import {
  CreateDocumentPayload,
  DeleteDocumentPayload,
  DOCUMENT_PATTERNS,
  FindDocumentByIdPayload,
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

  private async send<TPayload, TResult>(
    pattern: string,
    payload: TPayload,
  ): Promise<TResult> {
    try {
      return await lastValueFrom(
        this.documentClient.send<TResult, TPayload>(pattern, payload),
      );
    } catch (error) {
      throw asUpstreamHttpError(error, 'Document service request failed');
    }
  }
}
