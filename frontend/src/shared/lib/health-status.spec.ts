import { describe, it, expect } from 'vitest';
import { computeStatus } from './health-status';
import type { HealthResponse } from '../types';

const allUp: HealthResponse = {
  paddleOcrReachable: true,
  paddleOcrDevice: 'gpu',
  paddleOcrModels: ['det', 'rec'],
  lmStudioReachable: true,
  lmStudioModels: ['qwen/qwen3.5-9b'],
  superToneReachable: true,
  kokoroReachable: true,
  f5TtsReachable: true,
  f5TtsDevice: 'gpu',
  voxtralReachable: false,
  voxtralDevice: null,
};

describe('computeStatus', () => {
  it('returns blue when all systems fully operational', () => {
    const result = computeStatus(allUp);

    expect(result.color).toBe('blue');
    expect(result.tooltip).toContain('PaddleOCR GPU');
    expect(result.tooltip).toContain('LM Studio');
    expect(result.tooltip).toContain('F5 TTS');
    expect(result.tooltip).toContain('Voxtral');
    expect(result.tooltip).toContain('Kokoro');
    expect(result.tooltip).toContain('Supertone');
  });

  it('returns red when PaddleOCR is unreachable', () => {
    const result = computeStatus({ ...allUp, paddleOcrReachable: false });

    expect(result.color).toBe('red');
    expect(result.tooltip).toBe('PaddleOCR unreachable');
  });

  it('returns yellow when PaddleOCR runs on CPU', () => {
    const result = computeStatus({ ...allUp, paddleOcrDevice: 'cpu' });

    expect(result.color).toBe('yellow');
    expect(result.tooltip).toContain('PaddleOCR CPU');
  });

  it('returns green when PaddleOCR GPU OK but LM Studio down', () => {
    const result = computeStatus({ ...allUp, lmStudioReachable: false });

    expect(result.color).toBe('green');
    expect(result.tooltip).toContain('LM Studio ✗');
  });

  it('returns green when PaddleOCR GPU OK but F5 TTS down', () => {
    const result = computeStatus({
      ...allUp,
      f5TtsReachable: false,
      f5TtsDevice: null,
    });

    expect(result.color).toBe('green');
    expect(result.tooltip).toContain('F5 TTS ✗');
  });

  it('returns green when F5 TTS on CPU', () => {
    const result = computeStatus({ ...allUp, f5TtsDevice: 'cpu' });

    expect(result.color).toBe('green');
    expect(result.tooltip).toContain('F5 TTS CPU');
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

  it('keeps blue when Voxtral is down but the baseline stack is healthy', () => {
    const result = computeStatus({ ...allUp, voxtralReachable: false, voxtralDevice: null });

    expect(result.color).toBe('blue');
    expect(result.tooltip).toContain('Voxtral ✗');
  });

  it('yellow tooltip includes all service statuses', () => {
    const result = computeStatus({
      ...allUp,
      paddleOcrDevice: 'cpu',
      lmStudioReachable: false,
      kokoroReachable: false,
    });

    expect(result.color).toBe('yellow');
    expect(result.tooltip).toContain('LM Studio ✗');
    expect(result.tooltip).toContain('Kokoro ✗');
    expect(result.tooltip).toContain('Supertone ✓');
  });
});
