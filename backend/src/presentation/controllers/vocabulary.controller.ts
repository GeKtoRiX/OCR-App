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
import { VocabularyUseCase } from '../../application/use-cases/vocabulary.use-case';
import { AddVocabularyDto, UpdateVocabularyDto } from '../dto/vocabulary.dto';
import type { VocabType } from '../../domain/entities/vocabulary-word.entity';
import { ETagInterceptor } from '../interceptors/etag.interceptor';

const VALID_VOCAB_TYPES: VocabType[] = [
  'word',
  'phrasal_verb',
  'idiom',
  'collocation',
  'expression',
];

@UseInterceptors(ETagInterceptor)
@Controller('api/vocabulary')
export class VocabularyController {
  constructor(private readonly vocabularyUseCase: VocabularyUseCase) {}

  @Post()
  async create(@Body() body: AddVocabularyDto) {
    if (!body.word || !body.word.trim()) {
      throw new BadRequestException('word is required');
    }
    if (!body.vocabType || !VALID_VOCAB_TYPES.includes(body.vocabType as VocabType)) {
      throw new BadRequestException(
        `vocabType must be one of: ${VALID_VOCAB_TYPES.join(', ')}`,
      );
    }
    if (!body.targetLang || !body.nativeLang) {
      throw new BadRequestException('targetLang and nativeLang are required');
    }

    // Check for duplicate
    const existing = await this.vocabularyUseCase.findByWord(
      body.word.trim(),
      body.targetLang,
      body.nativeLang,
    );
    if (existing) {
      throw new HttpException(
        'Word already exists in vocabulary',
        HttpStatus.CONFLICT,
      );
    }

    return this.vocabularyUseCase.add({
      word: body.word.trim(),
      vocabType: body.vocabType as VocabType,
      translation: body.translation ?? '',
      targetLang: body.targetLang,
      nativeLang: body.nativeLang,
      contextSentence: body.contextSentence ?? '',
      sourceDocumentId: body.sourceDocumentId,
    });
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
      if (!item.vocabType || !VALID_VOCAB_TYPES.includes(item.vocabType as VocabType)) {
        throw new BadRequestException(
          `vocabType must be one of: ${VALID_VOCAB_TYPES.join(', ')}`,
        );
      }
      if (!item.targetLang || !item.nativeLang) {
        throw new BadRequestException('targetLang and nativeLang are required for all items');
      }
    }
    return this.vocabularyUseCase.addMany(
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
