import { useState, useRef, useEffect, useCallback } from 'react';
import { processImage } from '../model/api';
import type { OcrResponse } from '../model/types';

export type OcrStatus = 'idle' | 'loading' | 'success' | 'error';

export function useOCR() {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [result, setResult] = useState<OcrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const run = useCallback(async (file: File) => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setError(null);
    setResult(null);

    try {
      const data = await processImage(file, controller.signal);

      if (controller.signal.aborted || controllerRef.current !== controller) {
        return;
      }

      setResult(data);
      setStatus('success');
    } catch (e) {
      if (controller.signal.aborted || controllerRef.current !== controller) {
        return;
      }

      const msg = e instanceof Error ? e.message : 'ÐÐµÐ¸Ð·Ð²ÐµÑÑ‚Ð½Ð°Ñ Ð¾ÑˆÐ¸Ð±ÐºÐ°';
      setError(msg);
      setStatus('error');
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, run, reset };
}
