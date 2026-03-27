import { create } from 'zustand';
import type { LightColor } from '../../shared/lib/health-status';

export interface HealthStore {
  color: LightColor;
  tooltip: string;
}

export const POLL_INTERVAL_MS = 30_000;

export const useHealthStore = create<HealthStore>(() => ({
  color: 'red',
  tooltip: 'Checking status...',
}));
