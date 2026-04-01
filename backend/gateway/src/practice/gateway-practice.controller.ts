import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CompletePracticePayload,
  CompletePracticeResponse,
  PracticeSessionsPayload,
  PracticeStatsPayload,
  StartPracticePayload,
  StartPracticeResponse,
  SubmitPracticeAnswerPayload,
  SubmitPracticeAnswerResponse,
  VOCABULARY_PATTERNS,
} from '@ocr-app/shared';
import { gatewaySend } from '../gateway-send';

type ExerciseType =
  | 'fill_blank'
  | 'spelling'
  | 'context_sentence'
  | 'multiple_choice';

const VALID_EXERCISE_TYPES: ExerciseType[] = [
  'fill_blank',
  'spelling',
  'context_sentence',
  'multiple_choice',
];

@Controller('api/practice')
export class GatewayPracticeController {
  constructor(
    @Inject('VOCABULARY_SERVICE')
    private readonly vocabularyClient: ClientProxy,
  ) {}

  @Post('start')
  async start(@Body() body: StartPracticePayload): Promise<StartPracticeResponse> {
    return this.send<StartPracticePayload, StartPracticeResponse>(
      VOCABULARY_PATTERNS.PRACTICE_START,
      body,
    );
  }

  @Post('answer')
  async answer(
    @Body() body: SubmitPracticeAnswerPayload,
  ): Promise<SubmitPracticeAnswerResponse> {
    if (!body.sessionId || !body.vocabularyId) {
      throw new BadRequestException('sessionId and vocabularyId are required');
    }
    if (
      !body.exerciseType ||
      !VALID_EXERCISE_TYPES.includes(body.exerciseType)
    ) {
      throw new BadRequestException(
        `exerciseType must be one of: ${VALID_EXERCISE_TYPES.join(', ')}`,
      );
    }
    if (!body.userAnswer && body.userAnswer !== '') {
      throw new BadRequestException('userAnswer is required');
    }
    return this.send<SubmitPracticeAnswerPayload, SubmitPracticeAnswerResponse>(
      VOCABULARY_PATTERNS.PRACTICE_ANSWER,
      body,
    );
  }

  @Post('complete')
  async complete(
    @Body() body: CompletePracticePayload,
  ): Promise<CompletePracticeResponse> {
    if (!body.sessionId) {
      throw new BadRequestException('sessionId is required');
    }
    return this.send<CompletePracticePayload, CompletePracticeResponse>(
      VOCABULARY_PATTERNS.PRACTICE_COMPLETE,
      body,
    );
  }

  @Get('sessions')
  async sessions(@Query('limit') limit?: string): Promise<unknown> {
    const payload: PracticeSessionsPayload = {
      limit: limit ? parseInt(limit, 10) : 20,
    };
    return this.send<PracticeSessionsPayload, unknown>(
      VOCABULARY_PATTERNS.PRACTICE_SESSIONS,
      payload,
    );
  }

  @Get('stats/:vocabularyId')
  async stats(@Param('vocabularyId') vocabularyId: string): Promise<unknown> {
    const payload: PracticeStatsPayload = { vocabularyId };
    return this.send<PracticeStatsPayload, unknown>(
      VOCABULARY_PATTERNS.PRACTICE_STATS,
      payload,
    );
  }

  private send<TPayload, TResult>(pattern: string, payload: TPayload): Promise<TResult> {
    return gatewaySend(this.vocabularyClient, pattern, payload, 'Practice service request failed');
  }
}
