import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHealthStatus } from './useHealthStatus';

vi.mock('../model/api', () => ({
  checkHealth: vi.fn(),
}));

import { checkHealth } from '../model/api';

const mockCheckHealth = vi.mocked(checkHealth);

const allGood = () => ({
  paddleOcrReachable: true,
  paddleOcrDevice: 'gpu' as const,
  paddleOcrModels: ['det', 'rec'],
  lmStudioReachable: true,
  lmStudioModels: ['qwen/qwen3.5-9b'],
  superToneReachable: true,
  kokoroReachable: true,
  qwenTtsReachable: true,
  qwenTtsDevice: 'gpu' as const,
});

describe('useHealthStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start with red/"Checking status..." before first poll resolves', () => {
    mockCheckHealth.mockImplementation(() => new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useHealthStatus());

    expect(result.current.color).toBe('red');
    expect(result.current.tooltip).toBe('Checking status...');
  });

  it('should go blue when all systems are fully operational', async () => {
    mockCheckHealth.mockResolvedValue(allGood());

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.color).toBe('blue'));
    expect(result.current.tooltip).toContain('Qwen TTS');
    expect(result.current.tooltip).toContain('Supertone');
  });

  it('should go red when PaddleOCR is unreachable', async () => {
    mockCheckHealth.mockResolvedValue({ ...allGood(), paddleOcrReachable: false });

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.color).toBe('red'));
    expect(result.current.tooltip).toContain('unreachable');
  });

  it('should go yellow when PaddleOCR runs on CPU', async () => {
    mockCheckHealth.mockResolvedValue({ ...allGood(), paddleOcrDevice: 'cpu' });

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.color).toBe('yellow'));
    expect(result.current.tooltip).toContain('CPU');
  });

  it('should go green when GPU OK but LM Studio is down', async () => {
    mockCheckHealth.mockResolvedValue({
      ...allGood(),
      lmStudioReachable: false,
      lmStudioModels: [],
    });

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.color).toBe('green'));
    expect(result.current.tooltip).toContain('LM Studio ✗');
  });

  it('should go green when GPU OK but Qwen TTS is down', async () => {
    mockCheckHealth.mockResolvedValue({
      ...allGood(),
      qwenTtsReachable: false,
      qwenTtsDevice: null,
    });

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.color).toBe('green'));
    expect(result.current.tooltip).toContain('Qwen TTS ✗');
  });

  it('should go green when Qwen TTS is reachable but not on GPU', async () => {
    mockCheckHealth.mockResolvedValue({
      ...allGood(),
      qwenTtsDevice: 'cpu',
    });

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.color).toBe('green'));
    expect(result.current.tooltip).toContain('Qwen TTS CPU');
  });

  it('should go green when GPU OK but Kokoro is down', async () => {
    mockCheckHealth.mockResolvedValue({ ...allGood(), kokoroReachable: false });

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.color).toBe('green'));
    expect(result.current.tooltip).toContain('Kokoro ✗');
  });

  it('should go green when GPU+Qwen TTS OK but Supertone is down', async () => {
    mockCheckHealth.mockResolvedValue({ ...allGood(), superToneReachable: false });

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.color).toBe('green'));
    expect(result.current.tooltip).toContain('Supertone ✗');
  });

  it('should go red and report error message on checkHealth failure', async () => {
    mockCheckHealth.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useHealthStatus());

    await waitFor(() => expect(result.current.tooltip).toContain('Health check failed'));
    expect(result.current.color).toBe('red');
    expect(result.current.tooltip).toContain('Network error');
  });

  it('should poll again after 30 seconds', async () => {
    vi.useFakeTimers();
    mockCheckHealth.mockResolvedValue(allGood());

    renderHook(() => useHealthStatus());

    // Flush the initial immediate poll
    await vi.advanceTimersByTimeAsync(1);
    expect(mockCheckHealth).toHaveBeenCalledTimes(1);

    // Advance exactly 30s — triggers one interval tick
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockCheckHealth).toHaveBeenCalledTimes(2);
  });

  it('should stop polling after unmount', async () => {
    vi.useFakeTimers();
    mockCheckHealth.mockResolvedValue(allGood());

    const { unmount } = renderHook(() => useHealthStatus());

    // Flush the initial poll, then unmount
    await vi.advanceTimersByTimeAsync(1);
    unmount();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockCheckHealth).toHaveBeenCalledTimes(1);
  });
});
