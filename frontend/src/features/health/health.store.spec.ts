import { describe, expect, it } from 'vitest';
import { POLL_INTERVAL_MS, useHealthStore } from './health.store';
import { computeStatus } from '../../shared/lib/health-status';

describe('useHealthStore', () => {
  it('starts with the default health state', () => {
    expect(useHealthStore.getState()).toEqual({
      color: 'red',
      tooltip: 'Checking status...',
    });
  });

  it('updates via setState using computeStatus output', () => {
    useHealthStore.setState(
      computeStatus({
        paddleOcrReachable: true,
        paddleOcrModels: ['det', 'rec'],
        paddleOcrDevice: 'gpu',
        lmStudioReachable: true,
        lmStudioModels: ['qwen'],
        superToneReachable: true,
        kokoroReachable: true,
        f5TtsReachable: true,
        f5TtsDevice: 'gpu',
        voxtralReachable: false,
        voxtralDevice: null,
      }),
    );

    expect(useHealthStore.getState().color).toBe('blue');
    expect(useHealthStore.getState().tooltip).toContain('PaddleOCR GPU');
  });

  it('exports the polling interval constant', () => {
    expect(POLL_INTERVAL_MS).toBe(30_000);
  });
});
