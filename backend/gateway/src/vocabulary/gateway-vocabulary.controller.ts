import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AddVocabularyPayload,
  DeleteVocabularyPayload,
  FindAllVocabularyPayload,
  FindDueVocabularyPayload,
  FindVocabularyByIdPayload,
  UpdateVocabularyPayload,
  VOCABULARY_PATTERNS,
  VocabularyItemDto,
} from '@ocr-app/shared';
import { gatewaySend } from '../gateway-send';

type VocabType =
  | 'word'
  | 'phrasal_verb'
  | 'idiom'
  | 'collocation'
  | 'expression';

const VALID_VOCAB_TYPES: VocabType[] = [
  'word',
  'phrasal_verb',
  'idiom',
  'collocation',
  'expression',
];

@Controller('api/vocabulary')
export class GatewayVocabularyController {
  constructor(
    @Inject('VOCABULARY_SERVICE')
    private readonly vocabularyClient: ClientProxy,
  ) {}

  @Post()
  async create(@Body() body: AddVocabularyPayload): Promise<VocabularyItemDto> {
    this.validateCreateBody(body);
    return this.send<AddVocabularyPayload, VocabularyItemDto>(
      VOCABULARY_PATTERNS.ADD,
      {
        ...body,
        word: body.word.trim(),
        translation: body.translation ?? '',
        contextSentence: body.contextSentence ?? '',
      },
    );
  }

  @Post('batch')
  async createBatch(
    @Body() body: AddVocabularyPayload[],
  ): Promise<VocabularyItemDto[]> {
    if (!Array.isArray(body) || body.length === 0) {
      throw new BadRequestException('Request body must be a non-empty array');
    }
    if (body.length > 500) {
      throw new BadRequestException('Maximum 500 words per batch');
    }
    body.forEach((item) => this.validateCreateBody(item));

    return this.send<AddVocabularyPayload[], VocabularyItemDto[]>(
      VOCABULARY_PATTERNS.ADD_MANY,
      body.map((item) => ({
        ...item,
        word: item.word.trim(),
        translation: item.translation ?? '',
        contextSentence: item.contextSentence ?? '',
      })),
    );
  }

  @Get()
  async findAll(
    @Query('targetLang') targetLang?: string,
    @Query('nativeLang') nativeLang?: string,
  ): Promise<VocabularyItemDto[]> {
    const payload: FindAllVocabularyPayload = { targetLang, nativeLang };
    return this.send<FindAllVocabularyPayload, VocabularyItemDto[]>(
      VOCABULARY_PATTERNS.FIND_ALL,
      payload,
    );
  }

  @Get('review/due')
  async findDue(
    @Query('limit') limit?: string,
    @Query('targetLang') targetLang?: string,
    @Query('nativeLang') nativeLang?: string,
  ): Promise<VocabularyItemDto[]> {
    const payload: FindDueVocabularyPayload = {
      limit: limit ? parseInt(limit, 10) : undefined,
      targetLang: targetLang || undefined,
      nativeLang: nativeLang || undefined,
    };
    return this.send<FindDueVocabularyPayload, VocabularyItemDto[]>(
      VOCABULARY_PATTERNS.FIND_DUE,
      payload,
    );
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<VocabularyItemDto> {
    return this.send<FindVocabularyByIdPayload, VocabularyItemDto>(
      VOCABULARY_PATTERNS.FIND_BY_ID,
      { id },
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { word?: string; translation?: string; contextSentence?: string },
  ): Promise<VocabularyItemDto> {
    const payload: UpdateVocabularyPayload = {
      id,
      word: body.word?.trim(),
      translation: body.translation ?? '',
      contextSentence: body.contextSentence ?? '',
    };
    return this.send<UpdateVocabularyPayload, VocabularyItemDto>(
      VOCABULARY_PATTERNS.UPDATE,
      payload,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.send<DeleteVocabularyPayload, void>(VOCABULARY_PATTERNS.DELETE, {
      id,
    });
  }

  private validateCreateBody(body: AddVocabularyPayload): void {
    if (!body.word?.trim()) {
      throw new BadRequestException('word is required');
    }
    if (!body.vocabType || !VALID_VOCAB_TYPES.includes(body.vocabType)) {
      throw new BadRequestException(
        `vocabType must be one of: ${VALID_VOCAB_TYPES.join(', ')}`,
      );
    }
    if (!body.targetLang || !body.nativeLang) {
      throw new BadRequestException('targetLang and nativeLang are required');
    }
  }

  private send<TPayload, TResult>(pattern: string, payload: TPayload): Promise<TResult> {
    return gatewaySend(this.vocabularyClient, pattern, payload, 'Vocabulary service request failed');
  }
}
