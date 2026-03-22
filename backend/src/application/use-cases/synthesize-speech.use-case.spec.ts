import { SynthesizeSpeechUseCase } from './synthesize-speech.use-case';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IF5TtsPort } from '../../domain/ports/f5-tts.port';

describe('SynthesizeSpeechUseCase', () => {
  let useCase: SynthesizeSpeechUseCase;
  let mockSupertone: jest.Mocked<ISupertonePort>;
  let mockKokoro: jest.Mocked<IKokoroPort>;
  let mockF5Tts: jest.Mocked<IF5TtsPort>;

  beforeEach(() => {
    mockSupertone = {
      synthesize: jest.fn().mockResolvedValue(Buffer.from('supertone')),
      checkHealth: jest.fn(),
    } as unknown as jest.Mocked<ISupertonePort>;
    mockKokoro = {
      synthesize: jest.fn().mockResolvedValue(Buffer.from('kokoro')),
      checkHealth: jest.fn(),
    } as unknown as jest.Mocked<IKokoroPort>;
    mockF5Tts = {
      synthesize: jest.fn().mockResolvedValue(Buffer.from('f5')),
      getHealth: jest.fn(),
    } as unknown as jest.Mocked<IF5TtsPort>;

    useCase = new SynthesizeSpeechUseCase(mockSupertone, mockKokoro, mockF5Tts);
  });

  it('routes f5 engine to IF5TtsPort', async () => {
    const refAudio = {
      buffer: Buffer.from('wav'),
      mimetype: 'audio/wav',
      originalname: 'reference.wav',
    } as Express.Multer.File;

    const result = await useCase.execute({
      text: 'hello',
      engine: 'f5',
      refText: 'Reference text',
      refAudio,
      removeSilence: true,
    });

    expect(mockF5Tts.synthesize).toHaveBeenCalledWith({
      text: 'hello',
      refText: 'Reference text',
      refAudio,
      autoTranscribe: undefined,
      removeSilence: true,
    });
    expect(mockSupertone.synthesize).not.toHaveBeenCalled();
    expect(mockKokoro.synthesize).not.toHaveBeenCalled();
    expect(result.wav).toEqual(Buffer.from('f5'));
  });

  it('routes kokoro engine to IKokoroPort', async () => {
    const result = await useCase.execute({
      text: 'hello',
      engine: 'kokoro',
      voice: 'am_michael',
      speed: 1.2,
    });

    expect(mockKokoro.synthesize).toHaveBeenCalledWith({
      text: 'hello',
      voice: 'am_michael',
      speed: 1.2,
    });
    expect(mockSupertone.synthesize).not.toHaveBeenCalled();
    expect(mockF5Tts.synthesize).not.toHaveBeenCalled();
    expect(result.wav).toEqual(Buffer.from('kokoro'));
  });

  it('routes supertone engine to ISupertonePort', async () => {
    const result = await useCase.execute({
      text: 'hello',
      engine: 'supertone',
      voice: 'M1',
      lang: 'en',
      speed: 1.0,
      totalSteps: 5,
    });

    expect(mockSupertone.synthesize).toHaveBeenCalledWith({
      text: 'hello',
      engine: 'supertone',
      voice: 'M1',
      lang: 'en',
      speed: 1.0,
      totalSteps: 5,
    });
    expect(mockKokoro.synthesize).not.toHaveBeenCalled();
    expect(mockF5Tts.synthesize).not.toHaveBeenCalled();
    expect(result.wav).toEqual(Buffer.from('supertone'));
  });

  it('routes unknown engine to ISupertonePort (default)', async () => {
    await useCase.execute({ text: 'hello', engine: 'piper' });

    expect(mockSupertone.synthesize).toHaveBeenCalled();
    expect(mockKokoro.synthesize).not.toHaveBeenCalled();
    expect(mockF5Tts.synthesize).not.toHaveBeenCalled();
  });

  it('routes undefined engine to ISupertonePort (default)', async () => {
    await useCase.execute({ text: 'hello' });

    expect(mockSupertone.synthesize).toHaveBeenCalled();
  });

  it('rejects f5 requests without refAudio', async () => {
    await expect(
      useCase.execute({ text: 'hello', engine: 'f5', refText: 'Reference text' }),
    ).rejects.toThrow('F5 TTS requires refAudio');
  });

  it('rejects f5 requests without refText when autoTranscribe is disabled', async () => {
    const refAudio = {
      buffer: Buffer.from('wav'),
      mimetype: 'audio/wav',
      originalname: 'reference.wav',
    } as Express.Multer.File;

    await expect(
      useCase.execute({ text: 'hello', engine: 'f5', refAudio }),
    ).rejects.toThrow('F5 TTS requires refText unless autoTranscribe is enabled');
  });

  it('allows f5 requests without refText when autoTranscribe is enabled', async () => {
    const refAudio = {
      buffer: Buffer.from('wav'),
      mimetype: 'audio/wav',
      originalname: 'reference.wav',
    } as Express.Multer.File;

    await useCase.execute({
      text: 'hello',
      engine: 'f5',
      refAudio,
      autoTranscribe: true,
    });

    expect(mockF5Tts.synthesize).toHaveBeenCalledWith({
      text: 'hello',
      refText: undefined,
      refAudio,
      autoTranscribe: true,
      removeSilence: undefined,
    });
  });

  it('passes explicit falsey f5 flags through to the F5 port', async () => {
    const refAudio = {
      buffer: Buffer.from('wav'),
      mimetype: 'audio/wav',
      originalname: 'reference.wav',
    } as Express.Multer.File;

    await useCase.execute({
      text: 'hello',
      engine: 'f5',
      refText: 'Reference text',
      refAudio,
      autoTranscribe: false,
      removeSilence: false,
    });

    expect(mockF5Tts.synthesize).toHaveBeenCalledWith({
      text: 'hello',
      refText: 'Reference text',
      refAudio,
      autoTranscribe: false,
      removeSilence: false,
    });
  });

  it('propagates errors from the port', async () => {
    mockSupertone.synthesize.mockRejectedValue(new Error('sidecar down'));

    await expect(
      useCase.execute({ text: 'hello', engine: 'supertone' }),
    ).rejects.toThrow('sidecar down');
  });
});
