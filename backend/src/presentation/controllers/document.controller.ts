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
}
