import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOCR } from './useOCR';

vi.mock('../model/api', () => ({
  processImage: vi.fn(),
}));

import { processImage } from '../model/api';

const mockProcessImage = vi.mocked(processImage);

describe('useOCR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with idle state', () => {
    const { result } = renderHook(() => useOCR());

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should transition to loading â†’ success on successful OCR', async () => {
    const mockResult = {
      rawText: 'Hello',
      markdown: '# Hello',
      filename: 'test.png',
    };
    mockProcessImage.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useOCR());
    const file = new File(['data'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.run(file);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.result).toEqual(mockResult);
    expect(result.current.error).toBeNull();
  });

  it('should abort previous request when a new run starts', async () => {
    mockProcessImage
      .mockImplementationOnce(
        (_file, signal) =>
          new Promise((_, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      )
      .mockResolvedValueOnce({
        rawText: 'Second',
        markdown: '# Second',
        filename: 'second.png',
      });

    const { result } = renderHook(() => useOCR());
    const firstFile = new File(['first'], 'first.png', { type: 'image/png' });
    const secondFile = new File(['second'], 'second.png', {
      type: 'image/png',
    });

    await act(async () => {
      const firstRun = result.current.run(firstFile);
      const secondRun = result.current.run(secondFile);
      await Promise.allSettled([firstRun, secondRun]);
    });

    const firstSignal = mockProcessImage.mock.calls[0][1];

    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.status).toBe('success');
    expect(result.current.result).toEqual({
      rawText: 'Second',
      markdown: '# Second',
      filename: 'second.png',
    });
  });

  it('should transition to loading â†’ error on failure', async () => {
    mockProcessImage.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useOCR());
    const file = new File(['data'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.run(file);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('API error');
    expect(result.current.result).toBeNull();
  });

  it('should handle non-Error exceptions', async () => {
    mockProcessImage.mockRejectedValue('string error');

    const { result } = renderHook(() => useOCR());
    const file = new File(['data'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.run(file);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Unknown error');
  });

  it('should reset state back to idle', async () => {
    mockProcessImage.mockResolvedValue({
      rawText: 'x',
      markdown: 'x',
      filename: 'x.png',
    });

    const { result } = renderHook(() => useOCR());

    await act(async () => {
      await result.current.run(new File(['d'], 'x.png', { type: 'image/png' }));
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
