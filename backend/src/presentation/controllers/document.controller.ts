import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { SavedDocumentUseCase } from '../../application/use-cases/saved-document.use-case';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  SavedDocumentResponseDto,
  PrepareDocumentVocabularyDto,
  ConfirmDocumentVocabularyDto,
} from '../dto/document.dto';
import { ETagInterceptor } from '../interceptors/etag.interceptor';

@UseInterceptors(ETagInterceptor)
@Controller('api/documents')
export class DocumentController {
  constructor(private readonly savedDocumentUseCase: SavedDocumentUseCase) {}

  @Post()
  async create(
    @Body() body: CreateDocumentDto,
  ): Promise<SavedDocumentResponseDto> {
    if (!body.markdown || !body.markdown.trim()) {
      throw new BadRequestException('markdown is required');
    }
    if (!body.filename || !body.filename.trim()) {
      throw new BadRequestException('filename is required');
    }
    return this.savedDocumentUseCase.create({
      markdown: body.markdown,
      filename: body.filename,
    });
  }

  @Get()
  async findAll(): Promise<SavedDocumentResponseDto[]> {
    return this.savedDocumentUseCase.findAll();
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
  ): Promise<SavedDocumentResponseDto> {
    const doc = await this.savedDocumentUseCase.findById(id);
    if (!doc) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }
    return doc;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateDocumentDto,
  ): Promise<SavedDocumentResponseDto> {
    if (!body.markdown || !body.markdown.trim()) {
      throw new BadRequestException('markdown is required');
    }
    const doc = await this.savedDocumentUseCase.update(id, {
      markdown: body.markdown,
    });
    if (!doc) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }
    return doc;
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const deleted = await this.savedDocumentUseCase.delete(id);
    if (!deleted) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }
  }

  @Post(':id/vocabulary/prepare')
  async prepareVocabulary(
    @Param('id') id: string,
    @Body() body: PrepareDocumentVocabularyDto,
  ) {
    if (!body.targetLang?.trim() || !body.nativeLang?.trim()) {
      throw new BadRequestException('targetLang and nativeLang are required');
    }
    const prepared = await this.savedDocumentUseCase.prepareVocabulary(id, {
      llmReview: Boolean(body.llmReview),
      targetLang: body.targetLang.trim(),
      nativeLang: body.nativeLang.trim(),
    });
    if (!prepared) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }
    return prepared;
  }

  @Post(':id/vocabulary/confirm')
  async confirmVocabulary(
    @Param('id') id: string,
    @Body() body: ConfirmDocumentVocabularyDto,
  ) {
    if (!body.targetLang?.trim() || !body.nativeLang?.trim()) {
      throw new BadRequestException('targetLang and nativeLang are required');
    }
    if (!Array.isArray(body.items)) {
      throw new BadRequestException('items must be an array');
    }
    const result = await this.savedDocumentUseCase.confirmVocabulary(id, {
      targetLang: body.targetLang.trim(),
      nativeLang: body.nativeLang.trim(),
      items: body.items.map((item) => ({
        candidateId: item.candidateId,
        word: item.word.trim(),
        vocabType: item.vocabType as 'word' | 'phrasal_verb' | 'idiom' | 'collocation' | 'expression',
        translation: item.translation ?? '',
        contextSentence: item.contextSentence ?? '',
      })),
    });
    if (!result) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }
    return result;
  }
}
