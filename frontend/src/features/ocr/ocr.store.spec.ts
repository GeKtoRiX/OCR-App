import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOcrStore } from './ocr.store';
import { processImage } from '../../shared/api';

vi.mock('../../shared/api', () => ({
  processImage: vi.fn(),
}));

const mockProcessImage = vi.mocked(processImage);

describe('useOcrStore', () => {
  beforeEach(() => {
    useOcrStore.setState({
      status: 'idle',
      result: null,
      error: null,
      entries: [],
      activeHistoryId: null,
    });
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('entry-1');
  });

  it('run() stores a successful OCR result and prepends a history entry', async () => {
    const file = new File(['x'], 'receipt.png', { type: 'image/png' });
    const result = {
      rawText: 'hello',
      markdown: '# hello',
      filename: 'receipt.png',
    };
    mockProcessImage.mockResolvedValue(result);

    await useOcrStore.getState().run(file);

    expect(useOcrStore.getState().status).toBe('success');
    expect(useOcrStore.getState().result).toEqual(result);
    expect(useOcrStore.getState().entries).toHaveLength(1);
    expect(useOcrStore.getState().activeHistoryId).toBe('entry-1');
    expect(useOcrStore.getState().entries[0]).toMatchObject({
      id: 'entry-1',
      file,
      result,
    });
  });

  it('run() stores an error when OCR fails', async () => {
    mockProcessImage.mockRejectedValue(new Error('OCR failed'));

    await useOcrStore.getState().run(new File(['x'], 'receipt.png', { type: 'image/png' }));

    expect(useOcrStore.getState().status).toBe('error');
    expect(useOcrStore.getState().error).toBe('OCR failed');
    expect(useOcrStore.getState().result).toBeNull();
  });

  it('reset() clears transient OCR state but preserves history', () => {
    useOcrStore.setState({
      status: 'success',
      result: { rawText: 'raw', markdown: '# raw', filename: 'file.png' },
      error: 'old error',
      entries: [
        {
          id: 'entry-1',
          file: new File(['x'], 'file.png', { type: 'image/png' }),
          result: { rawText: 'raw', markdown: '# raw', filename: 'file.png' },
          processedAt: new Date(),
        },
      ],
      activeHistoryId: 'entry-1',
    });

    useOcrStore.getState().reset();

    expect(useOcrStore.getState().status).toBe('idle');
    expect(useOcrStore.getState().result).toBeNull();
    expect(useOcrStore.getState().error).toBeNull();
    expect(useOcrStore.getState().entries).toHaveLength(1);
    expect(useOcrStore.getState().activeHistoryId).toBe('entry-1');
  });

  it('removeEntry() selects the next entry when deleting the active one', () => {
    useOcrStore.setState({
      entries: [
        {
          id: 'entry-1',
          file: new File(['1'], 'one.png', { type: 'image/png' }),
          result: { rawText: '1', markdown: '# 1', filename: 'one.png' },
          processedAt: new Date(),
        },
        {
          id: 'entry-2',
          file: new File(['2'], 'two.png', { type: 'image/png' }),
          result: { rawText: '2', markdown: '# 2', filename: 'two.png' },
          processedAt: new Date(),
        },
      ],
      activeHistoryId: 'entry-1',
    });

    useOcrStore.getState().removeEntry('entry-1');

    expect(useOcrStore.getState().entries).toHaveLength(1);
    expect(useOcrStore.getState().activeHistoryId).toBe('entry-2');
  });
});
