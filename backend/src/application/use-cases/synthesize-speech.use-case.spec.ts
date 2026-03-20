import { SynthesizeSpeechUseCase } from './synthesize-speech.use-case';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IQwenTtsPort } from '../../domain/ports/qwen-tts.port';

describe('SynthesizeSpeechUseCase', () => {
  let useCase: SynthesizeSpeechUseCase;
  let mockSupertone: jest.Mocked<ISupertonePort>;
  let mockKokoro: jest.Mocked<IKokoroPort>;
  let mockQwenTts: jest.Mocked<IQwenTtsPort>;

  beforeEach(() => {
    mockSupertone = {
      synthesize: jest.fn().mockResolvedValue(Buffer.from('supertone')),
      checkHealth: jest.fn(),
    } as unknown as jest.Mocked<ISupertonePort>;
    mockKokoro = {
      synthesize: jest.fn().mockResolvedValue(Buffer.from('kokoro')),
      checkHealth: jest.fn(),
    } as unknown as jest.Mocked<IKokoroPort>;
    mockQwenTts = {
      synthesize: jest.fn().mockResolvedValue(Buffer.from('qwen')),
      getHealth: jest.fn(),
    } as unknown as jest.Mocked<IQwenTtsPort>;

    useCase = new SynthesizeSpeechUseCase(mockSupertone, mockKokoro, mockQwenTts);
  });

  it('routes qwen engine to IQwenTtsPort', async () => {
    const result = await useCase.execute({
      text: 'hello',
      engine: 'qwen',
      lang: 'English',
      speaker: 'Ryan',
      instruct: 'Neutral delivery',
    });

    expect(mockQwenTts.synthesize).toHaveBeenCalledWith({
      text: 'hello',
      lang: 'English',
      speaker: 'Ryan',
      instruct: 'Neutral delivery',
    });
    expect(mockSupertone.synthesize).not.toHaveBeenCalled();
    expect(mockKokoro.synthesize).not.toHaveBeenCalled();
    expect(result.wav).toEqual(Buffer.from('qwen'));
  });

  it('routes kokoro engine to IKokoroPort', async () => {
    const result = await useCase.execute({
      text: 'hello',
      engine: 'kokoro',
      voice: 'am_adam',
      speed: 1.2,
    });

    expect(mockKokoro.synthesize).toHaveBeenCalledWith({
      text: 'hello',
      voice: 'am_adam',
      speed: 1.2,
    });
    expect(mockSupertone.synthesize).not.toHaveBeenCalled();
    expect(mockQwenTts.synthesize).not.toHaveBeenCalled();
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
    expect(mockQwenTts.synthesize).not.toHaveBeenCalled();
    expect(result.wav).toEqual(Buffer.from('supertone'));
  });

  it('routes unknown engine to ISupertonePort (default)', async () => {
    await useCase.execute({ text: 'hello', engine: 'piper' });

    expect(mockSupertone.synthesize).toHaveBeenCalled();
    expect(mockKokoro.synthesize).not.toHaveBeenCalled();
    expect(mockQwenTts.synthesize).not.toHaveBeenCalled();
  });

  it('routes undefined engine to ISupertonePort (default)', async () => {
    await useCase.execute({ text: 'hello' });

    expect(mockSupertone.synthesize).toHaveBeenCalled();
  });

  it('propagates errors from the port', async () => {
    mockSupertone.synthesize.mockRejectedValue(new Error('sidecar down'));

    await expect(
      useCase.execute({ text: 'hello', engine: 'supertone' }),
    ).rejects.toThrow('sidecar down');
  });
});
