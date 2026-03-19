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
  const { paddleOcrReachable, paddleOcrDevice, lmStudioReachable, lmStudioModels } = health;

  if (!paddleOcrReachable) {
    return { color: 'red', tooltip: 'PaddleOCR unreachable' };
  }

  if (paddleOcrDevice === 'cpu') {
    return { color: 'yellow', tooltip: 'PaddleOCR running on CPU (GPU unavailable)' };
  }

  const hasQwen = lmStudioModels.some((m) => m.toLowerCase().includes('qwen'));

  if (!lmStudioReachable) {
    return { color: 'green', tooltip: 'PaddleOCR GPU ✓ | LM Studio unreachable' };
  }

  if (!hasQwen) {
    return {
      color: 'green',
      tooltip: `PaddleOCR GPU ✓ | LM Studio ✓ | qwen3.5 not found (${lmStudioModels.join(', ') || 'no models loaded'})`,
    };
  }

  return { color: 'blue', tooltip: 'PaddleOCR GPU ✓ | LM Studio ✓ | qwen3.5 ✓' };
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
