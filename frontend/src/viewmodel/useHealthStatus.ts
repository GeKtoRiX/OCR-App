import { useState, useEffect } from 'react';
import { checkHealth } from '../model/api';
import { computeStatus } from '../model/health-status';
import type { HealthStatus } from '../model/health-status';

export type { LightColor, HealthStatus } from '../model/health-status';

const POLL_INTERVAL_MS = 30_000;

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
