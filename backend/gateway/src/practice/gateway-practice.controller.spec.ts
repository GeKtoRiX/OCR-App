import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { VOCABULARY_PATTERNS } from '@ocr-app/shared';
import { GatewayPracticeController } from './gateway-practice.controller';

describe('GatewayPracticeController', () => {
  let controller: GatewayPracticeController;
  let vocabularyClient: { send: jest.Mock };

  beforeEach(() => {
    vocabularyClient = {
      send: jest.fn().mockReturnValue(of({ ok: true })),
    };

    controller = new GatewayPracticeController(vocabularyClient as any);
  });

  it('forwards practice start payloads', async () => {
    await controller.start({ limit: 5, targetLang: 'en', nativeLang: 'ru' } as any);

    expect(vocabularyClient.send).toHaveBeenCalledWith(
      VOCABULARY_PATTERNS.PRACTICE_START,
      { limit: 5, targetLang: 'en', nativeLang: 'ru' },
    );
  });

  it('validates answer payloads before forwarding', async () => {
    await expect(
      controller.answer({
        sessionId: '',
        vocabularyId: 'v1',
        exerciseType: 'spelling',
        userAnswer: 'test',
      } as any),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.answer({
        sessionId: 's1',
        vocabularyId: 'v1',
        exerciseType: 'unknown',
        userAnswer: 'test',
      } as any),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.answer({
        sessionId: 's1',
        vocabularyId: 'v1',
        exerciseType: 'spelling',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('uses the default sessions limit when none is provided', async () => {
    await controller.sessions(undefined);

    expect(vocabularyClient.send).toHaveBeenCalledWith(
      VOCABULARY_PATTERNS.PRACTICE_SESSIONS,
      { limit: 20 },
    );
  });

  it('forwards stats lookups with the route vocabulary id', async () => {
    await controller.stats('v1');

    expect(vocabularyClient.send).toHaveBeenCalledWith(
      VOCABULARY_PATTERNS.PRACTICE_STATS,
      { vocabularyId: 'v1' },
    );
  });

  it('wraps upstream errors', async () => {
    vocabularyClient.send.mockReturnValue(
      throwError(() => ({ status: 500, message: 'Practice failure' })),
    );

    await expect(controller.complete({ sessionId: 's1' })).rejects.toMatchObject({
      status: 502,
      message: 'Practice failure',
    });
  });
});
