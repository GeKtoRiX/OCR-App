import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import {
  VocabularyUseCase,
} from '../../application/use-cases/vocabulary.use-case';
import { AddVocabularyDto, UpdateVocabularyDto } from '../dto/vocabulary.dto';
import {
  VOCAB_TYPES,
  type VocabType,
} from '../../domain/entities/vocabulary-word.entity';
import { VOCABULARY_DUPLICATE_ERROR } from '../../domain/ports/vocabulary-repository.port';
import { ETagInterceptor } from '../interceptors/etag.interceptor';

@UseInterceptors(ETagInterceptor)
@Controller('api/vocabulary')
export class VocabularyController {
  constructor(private readonly vocabularyUseCase: VocabularyUseCase) {}

  @Post()
  async create(@Body() body: AddVocabularyDto) {
    if (!body.word || !body.word.trim()) {
      throw new BadRequestException('word is required');
    }
    if (!body.vocabType || !VOCAB_TYPES.includes(body.vocabType as VocabType)) {
      throw new BadRequestException(
        `vocabType must be one of: ${VOCAB_TYPES.join(', ')}`,
      );
    }
    if (!body.targetLang || !body.nativeLang) {
      throw new BadRequestException('targetLang and nativeLang are required');
    }
    try {
      return await this.vocabularyUseCase.add({
        word: body.word.trim(),
        vocabType: body.vocabType as VocabType,
        translation: body.translation ?? '',
        targetLang: body.targetLang,
        nativeLang: body.nativeLang,
        contextSentence: body.contextSentence ?? '',
        sourceDocumentId: body.sourceDocumentId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === VOCABULARY_DUPLICATE_ERROR
      ) {
        throw new HttpException(
          VOCABULARY_DUPLICATE_ERROR,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  @Post('batch')
  async createBatch(@Body() body: AddVocabularyDto[]) {
    if (!Array.isArray(body) || body.length === 0) {
      throw new BadRequestException('Request body must be a non-empty array');
    }
    if (body.length > 500) {
      throw new BadRequestException('Maximum 500 words per batch');
    }
    for (const item of body) {
      if (!item.word?.trim()) throw new BadRequestException('word is required for all items');
      if (!item.vocabType || !VOCAB_TYPES.includes(item.vocabType as VocabType)) {
        throw new BadRequestException(
          `vocabType must be one of: ${VOCAB_TYPES.join(', ')}`,
        );
      }
      if (!item.targetLang || !item.nativeLang) {
        throw new BadRequestException('targetLang and nativeLang are required for all items');
      }
    }
    try {
      return await this.vocabularyUseCase.addMany(
        body.map((item) => ({
          word: item.word.trim(),
          vocabType: item.vocabType as VocabType,
          translation: item.translation ?? '',
          targetLang: item.targetLang,
          nativeLang: item.nativeLang,
          contextSentence: item.contextSentence ?? '',
          sourceDocumentId: item.sourceDocumentId,
        })),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === VOCABULARY_DUPLICATE_ERROR
      ) {
        throw new HttpException(
          VOCABULARY_DUPLICATE_ERROR,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  @Get()
  async findAll(
    @Query('targetLang') targetLang?: string,
    @Query('nativeLang') nativeLang?: string,
  ) {
    return this.vocabularyUseCase.findAll(targetLang, nativeLang);
  }

  @Get('review/due')
  async findDue(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.vocabularyUseCase.findDueForReview(parsedLimit);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const word = await this.vocabularyUseCase.findById(id);
    if (!word) {
      throw new HttpException('Word not found', HttpStatus.NOT_FOUND);
    }
    return word;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateVocabularyDto,
  ) {
    const word = await this.vocabularyUseCase.update(id, {
      word: body.word?.trim(),
      translation: body.translation ?? '',
      contextSentence: body.contextSentence ?? '',
    });
    if (!word) {
      throw new HttpException('Word not found', HttpStatus.NOT_FOUND);
    }
    return word;
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const deleted = await this.vocabularyUseCase.delete(id);
    if (!deleted) {
      throw new HttpException('Word not found', HttpStatus.NOT_FOUND);
    }
  }
}
