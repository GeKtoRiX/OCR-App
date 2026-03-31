import { describe, it, expect } from 'vitest';
import { computeStatus } from './health-status';
import type { HealthResponse } from '../types';

const allUp: HealthResponse = {
  ocrReachable: true,
  ocrDevice: null,
  ocrModels: ['qwen/qwen3.5-9b'],
  lmStudioReachable: true,
  lmStudioModels: ['qwen/qwen3.5-9b'],
  superToneReachable: true,
  kokoroReachable: true,
};

describe('computeStatus', () => {
  it('returns blue when all systems fully operational', () => {
    const result = computeStatus(allUp);

    expect(result.color).toBe('blue');
    expect(result.tooltip).toContain('OCR ✓');
    expect(result.tooltip).toContain('LM Studio');
    expect(result.tooltip).toContain('Kokoro');
    expect(result.tooltip).toContain('Supertone');
  });

  it('returns red when OCR is unreachable', () => {
    const result = computeStatus({ ...allUp, ocrReachable: false });

    expect(result.color).toBe('red');
    expect(result.tooltip).toBe('OCR unavailable');
  });

  it('returns yellow when OCR runs on CPU', () => {
    const result = computeStatus({ ...allUp, ocrDevice: 'cpu' });

    expect(result.color).toBe('yellow');
    expect(result.tooltip).toContain('OCR CPU');
  });

  it('returns green when OCR is OK but LM Studio is down', () => {
    const result = computeStatus({ ...allUp, lmStudioReachable: false });

    expect(result.color).toBe('green');
    expect(result.tooltip).toContain('LM Studio ✗');
  });

  it('returns green when Kokoro down', () => {
    const result = computeStatus({ ...allUp, kokoroReachable: false });

    expect(result.color).toBe('green');
    expect(result.tooltip).toContain('Kokoro ✗');
  });

  it('returns green when Supertone down', () => {
    const result = computeStatus({ ...allUp, superToneReachable: false });

    expect(result.color).toBe('green');
    expect(result.tooltip).toContain('Supertone ✗');
  });

  it('yellow tooltip includes all service statuses', () => {
    const result = computeStatus({
      ...allUp,
      ocrDevice: 'cpu',
      lmStudioReachable: false,
      kokoroReachable: false,
    });

    expect(result.color).toBe('yellow');
    expect(result.tooltip).toContain('LM Studio ✗');
    expect(result.tooltip).toContain('Kokoro ✗');
    expect(result.tooltip).toContain('Supertone ✓');
  });
});
