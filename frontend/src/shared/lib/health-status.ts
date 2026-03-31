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
    ocrReachable,
    ocrDevice,
    lmStudioReachable,
    superToneReachable,
    kokoroReachable,
  } = health;

  const ocrLabel = !ocrReachable
    ? 'OCR ✗'
    : ocrDevice === 'cpu'
      ? 'OCR CPU ⚠'
      : ocrDevice === 'gpu'
        ? 'OCR GPU ✓'
        : 'OCR ✓';

  if (!ocrReachable) {
    return { color: 'red', tooltip: 'OCR unavailable' };
  }

  if (ocrDevice === 'cpu') {
    return {
      color: 'yellow',
      tooltip: `${ocrLabel} | LM Studio ${lmStudioReachable ? '✓' : '✗'} | Kokoro ${kokoroReachable ? '✓' : '✗'} | Supertone ${superToneReachable ? '✓' : '✗'}`,
    };
  }

  if (lmStudioReachable && kokoroReachable && superToneReachable) {
    return {
      color: 'blue',
      tooltip: `${ocrLabel} | LM Studio ✓ | Kokoro ✓ | Supertone ✓`,
    };
  }

  const parts: string[] = [ocrLabel];
  parts.push(`LM Studio ${lmStudioReachable ? '✓' : '✗'}`);
  parts.push(`Kokoro ${kokoroReachable ? '✓' : '✗'}`);
  parts.push(`Supertone ${superToneReachable ? '✓' : '✗'}`);

  return { color: 'green', tooltip: parts.join(' | ') };
}
