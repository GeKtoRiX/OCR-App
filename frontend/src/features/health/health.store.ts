import { create } from 'zustand';
import { checkHealth } from '../../shared/api';
import { toErrorMessage } from '../../shared/lib/errors';
import { computeStatus, type LightColor } from '../../shared/lib/health-status';

export interface HealthStore {
  color: LightColor;
  tooltip: string;
  startPolling(): () => void;
}

export const POLL_INTERVAL_MS = 30_000;

export const useHealthStore = create<HealthStore>(() => ({
  color: 'red',
  tooltip: 'Checking status...',
  startPolling() {
    let cancelled = false;

    async function poll() {
      try {
        const health = await checkHealth();
        if (!cancelled) {
          useHealthStore.setState(computeStatus(health));
        }
      } catch (error) {
        if (!cancelled) {
          useHealthStore.setState({
            color: 'red',
            tooltip: `Health check failed: ${toErrorMessage(error, 'Unknown error')}`,
          });
        }
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  },
}));
