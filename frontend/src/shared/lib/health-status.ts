import type { HealthResponse } from '../types';

export type LightColor = 'blue' | 'green' | 'yellow' | 'red';

export interface HealthStatus {
  color: LightColor;
  tooltip: string;
}

export const HEALTH_LABELS = {
  blue: 'All systems ready',
  green: 'OCR ready',
  yellow: 'CPU mode',
  red: 'Service issue',
} as const;

export function computeStatus(health: HealthResponse): HealthStatus {
  const {
    paddleOcrReachable,
    paddleOcrDevice,
    lmStudioReachable,
    superToneReachable,
    kokoroReachable,
    f5TtsReachable,
    f5TtsDevice,
  } = health;

  const f5Label = !f5TtsReachable
    ? 'F5 TTS ✗'
    : f5TtsDevice === 'cpu'
      ? 'F5 TTS CPU ⚠'
      : 'F5 TTS ✓';

  // 🔴 PaddleOCR down — nothing works
  if (!paddleOcrReachable) {
    return { color: 'red', tooltip: 'PaddleOCR unreachable' };
  }

  // 🟡 PaddleOCR reachable but on CPU
  if (paddleOcrDevice === 'cpu') {
    return {
      color: 'yellow',
      tooltip: `PaddleOCR CPU ⚠ | LM Studio ${lmStudioReachable ? '✓' : '✗'} | ${f5Label} | Kokoro ${kokoroReachable ? '✓' : '✗'} | Supertone ${superToneReachable ? '✓' : '✗'}`,
    };
  }

  // 🔵 All systems fully operational
  if (
    lmStudioReachable &&
    f5TtsReachable &&
    f5TtsDevice === 'gpu' &&
    kokoroReachable &&
    superToneReachable
  ) {
    return {
      color: 'blue',
      tooltip: 'PaddleOCR GPU ✓ | LM Studio ✓ | F5 TTS ✓ | Kokoro ✓ | Supertone ✓',
    };
  }

  // 🟢 PaddleOCR GPU OK, but something else missing
  const parts: string[] = ['PaddleOCR GPU ✓'];
  parts.push(`LM Studio ${lmStudioReachable ? '✓' : '✗'}`);
  parts.push(f5Label);
  parts.push(`Kokoro ${kokoroReachable ? '✓' : '✗'}`);
  parts.push(`Supertone ${superToneReachable ? '✓' : '✗'}`);

  return { color: 'green', tooltip: parts.join(' | ') };
}
