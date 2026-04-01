import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { TTS_PATTERNS } from '@ocr-app/shared';
import { GatewayTtsController } from './gateway-tts.controller';

describe('GatewayTtsController', () => {
  let controller: GatewayTtsController;
  let ttsClient: { send: jest.Mock };
  let response: { status: jest.Mock; set: jest.Mock; send: jest.Mock };

  beforeEach(() => {
    ttsClient = {
      send: jest.fn().mockReturnValue(
        of({
          audioBase64: Buffer.from('wav-data').toString('base64'),
          contentType: 'audio/wav',
          filename: 'speech.wav',
        }),
      ),
    };

    response = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    controller = new GatewayTtsController(ttsClient as any);
  });

  it('validates empty text and overly long text', async () => {
    await expect(
      controller.synthesize({ text: '   ' }, response as any),
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      controller.synthesize({ text: 'a'.repeat(5001) }, response as any),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('forwards synthesis payload and writes the wav response', async () => {
    await controller.synthesize(
      {
        text: 'hello',
        engine: 'kokoro',
        voice: 'af_heart',
        speed: 1.1,
      },
      response as any,
    );

    expect(ttsClient.send).toHaveBeenCalledWith(TTS_PATTERNS.SYNTHESIZE, {
      text: 'hello',
      engine: 'kokoro',
      voice: 'af_heart',
      lang: undefined,
      speed: 1.1,
      totalSteps: undefined,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'audio/wav',
        'Content-Disposition': 'attachment; filename="speech.wav"',
      }),
    );
    expect(response.send).toHaveBeenCalledWith(Buffer.from('wav-data'));
  });

  it('wraps upstream failures', async () => {
    ttsClient.send.mockReturnValue(
      throwError(() => ({ status: 502, message: 'TTS down' })),
    );

    await expect(
      controller.synthesize({ text: 'hello' }, response as any),
    ).rejects.toMatchObject({
      status: 502,
      message: 'TTS down',
    });
  });
});
