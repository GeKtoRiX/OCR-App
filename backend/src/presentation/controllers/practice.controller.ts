import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PracticeUseCase } from '../../application/use-cases/practice.use-case';
import {
  StartPracticeDto,
  PracticePlanDto,
  GeneratePracticeRoundDto,
  SubmitAnswerDto,
  CompletePracticeDto,
} from '../dto/practice.dto';
import type { ExerciseType } from '../../domain/entities/exercise-attempt.entity';

const VALID_EXERCISE_TYPES: ExerciseType[] = [
  'fill_blank',
  'spelling',
  'context_sentence',
  'multiple_choice',
];

@Controller('api/practice')
export class PracticeController {
  constructor(
    private readonly practiceUseCase: PracticeUseCase,
  ) {}

  @Post('start')
  async start(@Body() body: StartPracticeDto) {
    try {
      return await this.practiceUseCase.startPractice({
        targetLang: body.targetLang,
        nativeLang: body.nativeLang,
        wordLimit: body.wordLimit,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to start practice';
      if (message === 'No words due for review') {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('plan')
  async plan(@Body() body: PracticePlanDto) {
    try {
      return await this.practiceUseCase.planPractice({
        targetLang: body.targetLang,
        nativeLang: body.nativeLang,
        wordLimit: body.wordLimit,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to plan practice';
      if (message === 'No vocabulary words available') {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('round')
  async round(@Body() body: GeneratePracticeRoundDto) {
    if (!body.sessionId) {
      throw new BadRequestException('sessionId is required');
    }
    if (!Array.isArray(body.vocabularyIds) || body.vocabularyIds.length === 0) {
      throw new BadRequestException('vocabularyIds must be a non-empty array');
    }
    try {
      return await this.practiceUseCase.generatePracticeRound({
        sessionId: body.sessionId,
        vocabularyIds: body.vocabularyIds,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate practice round';
      if (
        message === 'Practice session not found' ||
        message === 'One or more vocabulary words were not found'
      ) {
        throw new HttpException(message, HttpStatus.NOT_FOUND);
      }
      if (message === 'vocabularyIds must be a non-empty array') {
        throw new BadRequestException(message);
      }
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('answer')
  async answer(@Body() body: SubmitAnswerDto) {
    if (!body.sessionId || !body.vocabularyId) {
      throw new BadRequestException('sessionId and vocabularyId are required');
    }
    if (!body.exerciseType || !VALID_EXERCISE_TYPES.includes(body.exerciseType as ExerciseType)) {
      throw new BadRequestException(
        `exerciseType must be one of: ${VALID_EXERCISE_TYPES.join(', ')}`,
      );
    }
    if (!body.userAnswer && body.userAnswer !== '') {
      throw new BadRequestException('userAnswer is required');
    }

    return this.practiceUseCase.submitAnswer({
      sessionId: body.sessionId,
      vocabularyId: body.vocabularyId,
      exerciseType: body.exerciseType as ExerciseType,
      prompt: body.prompt,
      correctAnswer: body.correctAnswer,
      userAnswer: body.userAnswer,
    });
  }

  @Post('complete')
  async complete(@Body() body: CompletePracticeDto) {
    if (!body.sessionId) {
      throw new BadRequestException('sessionId is required');
    }
    try {
      return await this.practiceUseCase.completeSession(body.sessionId);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to complete session';
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('sessions')
  async sessions(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.practiceUseCase.getRecentSessions(parsedLimit);
  }

  @Get('stats/:vocabularyId')
  async stats(@Param('vocabularyId') vocabularyId: string) {
    return this.practiceUseCase.getAttemptsByVocabulary(vocabularyId);
  }
}
