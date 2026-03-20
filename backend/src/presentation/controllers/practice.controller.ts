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
import { IPracticeSessionRepository } from '../../domain/ports/practice-session-repository.port';
import {
  StartPracticeDto,
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
    private readonly sessionRepo: IPracticeSessionRepository,
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
    return this.sessionRepo.findRecentSessions(parsedLimit);
  }

  @Get('stats/:vocabularyId')
  async stats(@Param('vocabularyId') vocabularyId: string) {
    return this.sessionRepo.findAttemptsByVocabulary(vocabularyId);
  }
}
