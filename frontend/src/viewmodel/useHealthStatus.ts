import { useState, useEffect } from 'react';
import { checkHealth } from '../model/api';
import type { HealthResponse } from '../model/types';

export type LightColor = 'blue' | 'green' | 'yellow' | 'red';

export interface HealthStatus {
  color: LightColor;
  tooltip: string;
}

const POLL_INTERVAL_MS = 30_000;

function computeStatus(health: HealthResponse): HealthStatus {
  const {
    paddleOcrReachable,
    paddleOcrDevice,
    lmStudioReachable,
    superToneReachable,
    kokoroReachable,
    qwenTtsReachable,
    qwenTtsDevice,
  } = health;

  const qwenLabel = !qwenTtsReachable
    ? 'Qwen TTS ✗'
    : qwenTtsDevice === 'cpu'
      ? 'Qwen TTS CPU ⚠'
      : 'Qwen TTS ✓';

  // 🔴 PaddleOCR down — nothing works
  if (!paddleOcrReachable) {
    return { color: 'red', tooltip: 'PaddleOCR unreachable' };
  }

  // 🟡 PaddleOCR reachable but on CPU
  if (paddleOcrDevice === 'cpu') {
    return {
      color: 'yellow',
      tooltip: `PaddleOCR CPU ⚠ | LM Studio ${lmStudioReachable ? '✓' : '✗'} | ${qwenLabel} | Kokoro ${kokoroReachable ? '✓' : '✗'} | Supertone ${superToneReachable ? '✓' : '✗'}`,
    };
  }

  // 🔵 All systems fully operational
  if (
    lmStudioReachable &&
    qwenTtsReachable &&
    qwenTtsDevice === 'gpu' &&
    kokoroReachable &&
    superToneReachable
  ) {
    return {
      color: 'blue',
      tooltip: 'PaddleOCR GPU ✓ | LM Studio ✓ | Qwen TTS ✓ | Kokoro ✓ | Supertone ✓',
    };
  }

  // 🟢 PaddleOCR GPU OK, but something else missing
  const parts: string[] = ['PaddleOCR GPU ✓'];
  parts.push(`LM Studio ${lmStudioReachable ? '✓' : '✗'}`);
  parts.push(qwenLabel);
  parts.push(`Kokoro ${kokoroReachable ? '✓' : '✗'}`);
  parts.push(`Supertone ${superToneReachable ? '✓' : '✗'}`);

  return { color: 'green', tooltip: parts.join(' | ') };
}

export function useHealthStatus(): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>({ color: 'red', tooltip: 'Checking status...' });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const health = await checkHealth();
        if (!cancelled) setStatus(computeStatus(health));
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          setStatus({ color: 'red', tooltip: `Health check failed: ${msg}` });
        }
      }
    }

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return status;
}
