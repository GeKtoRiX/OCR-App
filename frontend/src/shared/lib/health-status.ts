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
    f5TtsReachable,
    f5TtsDevice,
    voxtralReachable,
    voxtralDevice,
  } = health;

  const f5Label = !f5TtsReachable
    ? 'F5 TTS ✗'
    : f5TtsDevice === 'cpu'
      ? 'F5 TTS CPU ⚠'
      : 'F5 TTS ✓';
  const voxtralLabel = !voxtralReachable
    ? 'Voxtral ✗'
    : voxtralDevice === 'cpu'
      ? 'Voxtral CPU ⚠'
      : 'Voxtral ✓';
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
      tooltip: `${ocrLabel} | LM Studio ${lmStudioReachable ? '✓' : '✗'} | ${f5Label} | ${voxtralLabel} | Kokoro ${kokoroReachable ? '✓' : '✗'} | Supertone ${superToneReachable ? '✓' : '✗'}`,
    };
  }

  if (
    lmStudioReachable &&
    f5TtsReachable &&
    f5TtsDevice === 'gpu' &&
    kokoroReachable &&
    superToneReachable
  ) {
    return {
      color: 'blue',
      tooltip: `${ocrLabel} | LM Studio ✓ | F5 TTS ✓ | ${voxtralLabel} | Kokoro ✓ | Supertone ✓`,
    };
  }

  const parts: string[] = [ocrLabel];
  parts.push(`LM Studio ${lmStudioReachable ? '✓' : '✗'}`);
  parts.push(f5Label);
  parts.push(voxtralLabel);
  parts.push(`Kokoro ${kokoroReachable ? '✓' : '✗'}`);
  parts.push(`Supertone ${superToneReachable ? '✓' : '✗'}`);

  return { color: 'green', tooltip: parts.join(' | ') };
}
