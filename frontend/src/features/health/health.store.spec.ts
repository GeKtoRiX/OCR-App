import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkHealth: vi.fn(),
  computeStatus: vi.fn(),
}));

vi.mock('../../shared/api', () => ({
  checkHealth: mocks.checkHealth,
}));

vi.mock('../../shared/lib/health-status', async () => {
  const actual = await vi.importActual<typeof import('../../shared/lib/health-status')>('../../shared/lib/health-status');

  return {
    ...actual,
    computeStatus: mocks.computeStatus,
  };
});

import { POLL_INTERVAL_MS, useHealthStore } from './health.store';

async function flushPolling() {
  await Promise.resolve();
}

describe('useHealthStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.computeStatus.mockReturnValue({
      color: 'blue',
      tooltip: 'All systems nominal',
    });
    useHealthStore.setState({
      color: 'red',
      tooltip: 'Checking status...',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the default health state', () => {
    expect(useHealthStore.getState()).toMatchObject({
      color: 'red',
      tooltip: 'Checking status...',
    });
    expect(useHealthStore.getState().startPolling).toEqual(expect.any(Function));
  });

  it('startPolling() calls checkHealth immediately and applies computeStatus output', async () => {
    const health = {
      paddleOcrReachable: true,
      paddleOcrModels: ['det', 'rec'],
      paddleOcrDevice: 'gpu' as const,
      lmStudioReachable: true,
      lmStudioModels: ['qwen'],
      superToneReachable: true,
      kokoroReachable: true,
      f5TtsReachable: true,
      f5TtsDevice: 'gpu' as const,
      voxtralReachable: false,
      voxtralDevice: null,
    };
    mocks.checkHealth.mockResolvedValue(health);

    const stopPolling = useHealthStore.getState().startPolling();

    await flushPolling();

    expect(mocks.checkHealth).toHaveBeenCalledTimes(1);
    expect(mocks.computeStatus).toHaveBeenCalledWith(health);
    expect(useHealthStore.getState()).toMatchObject({
      color: 'blue',
      tooltip: 'All systems nominal',
    });

    stopPolling();
  });

  it('startPolling() polls again on the interval', async () => {
    mocks.checkHealth.mockResolvedValue({
      paddleOcrReachable: true,
      paddleOcrModels: ['det', 'rec'],
      paddleOcrDevice: 'gpu' as const,
      lmStudioReachable: true,
      lmStudioModels: ['qwen'],
      superToneReachable: true,
      kokoroReachable: true,
      f5TtsReachable: true,
      f5TtsDevice: 'gpu' as const,
      voxtralReachable: false,
      voxtralDevice: null,
    });

    const stopPolling = useHealthStore.getState().startPolling();

    await flushPolling();
    expect(mocks.checkHealth).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    await flushPolling();

    expect(mocks.checkHealth).toHaveBeenCalledTimes(2);

    stopPolling();
  });

  it('startPolling() cleanup stops future interval polling', async () => {
    mocks.checkHealth.mockResolvedValue({
      paddleOcrReachable: true,
      paddleOcrModels: ['det', 'rec'],
      paddleOcrDevice: 'gpu' as const,
      lmStudioReachable: true,
      lmStudioModels: ['qwen'],
      superToneReachable: true,
      kokoroReachable: true,
      f5TtsReachable: true,
      f5TtsDevice: 'gpu' as const,
      voxtralReachable: false,
      voxtralDevice: null,
    });

    const stopPolling = useHealthStore.getState().startPolling();

    await flushPolling();
    expect(mocks.checkHealth).toHaveBeenCalledTimes(1);

    stopPolling();
    mocks.checkHealth.mockClear();

    vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);

    expect(mocks.checkHealth).not.toHaveBeenCalled();
  });

  it('startPolling() stores an error state when checkHealth fails', async () => {
    mocks.checkHealth.mockRejectedValue(new Error('OCR backend unavailable'));

    const stopPolling = useHealthStore.getState().startPolling();

    await flushPolling();

    expect(useHealthStore.getState()).toMatchObject({
      color: 'red',
      tooltip: 'Health check failed: OCR backend unavailable',
    });

    stopPolling();
  });

  it('exports the polling interval constant', () => {
    expect(POLL_INTERVAL_MS).toBe(30_000);
  });
});
