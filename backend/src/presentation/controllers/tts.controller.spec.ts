import { HttpException } from '@nestjs/common';
import { TtsController } from './tts.controller';
import { SynthesizeSpeechUseCase } from '../../application/use-cases/synthesize-speech.use-case';

describe('TtsController', () => {
  let controller: TtsController;
  let mockSynthesizeSpeech: jest.Mocked<SynthesizeSpeechUseCase>;
  let mockRes: any;

  beforeEach(() => {
    mockSynthesizeSpeech = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SynthesizeSpeechUseCase>;
    controller = new TtsController(mockSynthesizeSpeech);
    mockRes = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  it('routes qwen requests to use case with qwen engine', async () => {
    mockSynthesizeSpeech.execute.mockResolvedValue({
      wav: Buffer.from('qwen'),
    });

    await controller.synthesize(
      {
        text: 'hello',
        engine: 'qwen',
        lang: 'English',
        speaker: 'Ryan',
        instruct: 'Neutral delivery',
      },
      mockRes,
    );

    expect(mockSynthesizeSpeech.execute).toHaveBeenCalledWith({
      text: 'hello',
      engine: 'qwen',
      lang: 'English',
      speaker: 'Ryan',
      instruct: 'Neutral delivery',
      voice: undefined,
      speed: undefined,
      totalSteps: undefined,
    });
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith(Buffer.from('qwen'));
  });

  it('routes supertone requests to use case', async () => {
    mockSynthesizeSpeech.execute.mockResolvedValue({
      wav: Buffer.from('supertone'),
    });

    await controller.synthesize(
      {
        text: 'hello',
        engine: 'piper',
        voice: 'en_US-ryan-high',
        lang: 'en',
        speed: 1.2,
        totalSteps: 5,
      },
      mockRes,
    );

    expect(mockSynthesizeSpeech.execute).toHaveBeenCalledWith({
      text: 'hello',
      engine: 'piper',
      voice: 'en_US-ryan-high',
      lang: 'en',
      speed: 1.2,
      totalSteps: 5,
      speaker: undefined,
      instruct: undefined,
    });
  });

  it('routes kokoro requests to use case', async () => {
    mockSynthesizeSpeech.execute.mockResolvedValue({
      wav: Buffer.from('kokoro'),
    });

    await controller.synthesize(
      { text: 'hello', engine: 'kokoro', voice: 'am_adam', speed: 1.2 },
      mockRes,
    );

    expect(mockSynthesizeSpeech.execute).toHaveBeenCalledWith({
      text: 'hello',
      engine: 'kokoro',
      voice: 'am_adam',
      speed: 1.2,
      lang: undefined,
      totalSteps: undefined,
      speaker: undefined,
      instruct: undefined,
    });
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  it('rejects qwen voice design requests', async () => {
    await expect(
      controller.synthesize(
        {
          text: 'hello',
          engine: 'qwen',
          qwenMode: 'voice_design',
        },
        mockRes,
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('throws 400 when text is empty', async () => {
    await expect(
      controller.synthesize({ text: '   ' }, mockRes),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('throws 400 when text exceeds 5000 characters', async () => {
    await expect(
      controller.synthesize({ text: 'x'.repeat(5001) }, mockRes),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('throws 502 when use case throws an error', async () => {
    mockSynthesizeSpeech.execute.mockRejectedValue(new Error('sidecar down'));

    const err = await controller
      .synthesize({ text: 'hello', engine: 'supertone' }, mockRes)
      .catch((e) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(502);
  });
});
