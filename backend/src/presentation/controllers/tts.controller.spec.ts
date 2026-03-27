import { HttpException } from '@nestjs/common';
import { TtsController } from './tts.controller';
import {
  F5_TTS_REQUIRES_REF_AUDIO_ERROR,
  F5_TTS_REQUIRES_REF_TEXT_ERROR,
  SynthesizeSpeechUseCase,
} from '../../application/use-cases/synthesize-speech.use-case';

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

  it('routes f5 requests to use case with f5 engine', async () => {
    mockSynthesizeSpeech.execute.mockResolvedValue({
      wav: Buffer.from('f5'),
    });
    const refAudio = {
      originalname: 'reference.wav',
      mimetype: 'audio/wav',
      buffer: Buffer.from('wav'),
    } as any;

    await controller.synthesize(
      {
        text: 'hello',
        engine: 'f5',
        refText: 'Reference text',
        removeSilence: 'true',
      },
      mockRes,
      refAudio,
    );

    expect(mockSynthesizeSpeech.execute).toHaveBeenCalledWith({
      text: 'hello',
      engine: 'f5',
      refText: 'Reference text',
      refAudio: {
        buffer: refAudio.buffer,
        originalname: refAudio.originalname,
        mimetype: refAudio.mimetype,
        size: refAudio.size,
      },
      autoTranscribe: undefined,
      removeSilence: true,
      format: undefined,
      voice: undefined,
      lang: undefined,
      speed: undefined,
      totalSteps: undefined,
    });
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith(Buffer.from('f5'));
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
      format: undefined,
      refText: undefined,
      refAudio: undefined,
      removeSilence: undefined,
    });
  });

  it('routes kokoro requests to use case', async () => {
    mockSynthesizeSpeech.execute.mockResolvedValue({
      wav: Buffer.from('kokoro'),
    });

    await controller.synthesize(
      { text: 'hello', engine: 'kokoro', voice: 'am_michael', speed: 1.2 },
      mockRes,
    );

    expect(mockSynthesizeSpeech.execute).toHaveBeenCalledWith({
      text: 'hello',
      engine: 'kokoro',
      voice: 'am_michael',
      format: undefined,
      speed: 1.2,
      lang: undefined,
      totalSteps: undefined,
      refText: undefined,
      refAudio: undefined,
      removeSilence: undefined,
    });
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });

  it('rejects f5 requests without refAudio', async () => {
    mockSynthesizeSpeech.execute.mockRejectedValue(
      new Error(F5_TTS_REQUIRES_REF_AUDIO_ERROR),
    );

    await expect(
      controller.synthesize(
        {
          text: 'hello',
          engine: 'f5',
          refText: 'Reference text',
        },
        mockRes,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects f5 requests without refText', async () => {
    mockSynthesizeSpeech.execute.mockRejectedValue(
      new Error(F5_TTS_REQUIRES_REF_TEXT_ERROR),
    );

    await expect(
      controller.synthesize(
        {
          text: 'hello',
          engine: 'f5',
        },
        mockRes,
        {
          originalname: 'reference.wav',
          mimetype: 'audio/wav',
          buffer: Buffer.from('wav'),
        } as any,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('allows f5 requests without refText when autoTranscribe=true', async () => {
    mockSynthesizeSpeech.execute.mockResolvedValue({
      wav: Buffer.from('f5'),
    });

    await controller.synthesize(
      {
        text: 'hello',
        engine: 'f5',
        autoTranscribe: 'true',
      },
      mockRes,
      {
        originalname: 'reference.wav',
        mimetype: 'audio/wav',
        buffer: Buffer.from('wav'),
      } as any,
    );

    expect(mockSynthesizeSpeech.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: 'f5',
        refText: undefined,
        autoTranscribe: true,
      }),
    );
  });

  it('uses the uploaded buffer directly and trims refText', async () => {
    mockSynthesizeSpeech.execute.mockResolvedValue({
      wav: Buffer.from('f5'),
    });

    await controller.synthesize(
      {
        text: 'hello',
        engine: 'f5',
        refText: '  Reference text  ',
        autoTranscribe: false,
        removeSilence: false,
      },
      mockRes,
      {
        buffer: Buffer.from('memory-wav'),
        originalname: 'reference.wav',
        mimetype: 'audio/wav',
        size: 8,
      } as any,
    );

    expect(mockSynthesizeSpeech.execute).toHaveBeenCalledWith({
      text: 'hello',
      engine: 'f5',
      voice: undefined,
      format: undefined,
      lang: undefined,
      speed: undefined,
      totalSteps: undefined,
      refText: 'Reference text',
      refAudio: {
        buffer: Buffer.from('memory-wav'),
        originalname: 'reference.wav',
        mimetype: 'audio/wav',
        size: 8,
      },
      autoTranscribe: false,
      removeSilence: false,
    });
  });

  it('surfaces non-Error failures as strings', async () => {
    mockSynthesizeSpeech.execute.mockRejectedValue('sidecar down' as any);

    const err = await controller
      .synthesize(
        {
          text: 'hello',
          engine: 'f5',
          refText: 'Reference text',
        },
        mockRes,
        {
          buffer: Buffer.from('memory-wav'),
          originalname: 'reference.wav',
          mimetype: 'audio/wav',
          size: 8,
        } as any,
      )
      .catch((e) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).message).toBe('TTS synthesis failed: sidecar down');
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

  it('parses false string flags before passing them to the use case', async () => {
    mockSynthesizeSpeech.execute.mockResolvedValue({
      wav: Buffer.from('kokoro'),
    });

    await controller.synthesize(
      {
        text: 'hello',
        engine: 'kokoro',
        autoTranscribe: 'FALSE',
        removeSilence: 'FALSE',
      },
      mockRes,
    );

    expect(mockSynthesizeSpeech.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        autoTranscribe: false,
        removeSilence: false,
      }),
    );
  });
});
