import type { OcrResponse, HealthResponse } from './types';

const BASE = '/api';

async function getErrorMessage(response: Response): Promise<string> {
  const body = await response
    .json()
    .catch(() => ({ message: response.statusText }));
  return body.message ?? `HTTP ${response.status}`;
}

export async function processImage(
  file: File,
  signal?: AbortSignal,
): Promise<OcrResponse> {
  const form = new FormData();
  form.append('image', file);

  const res = await fetch(`${BASE}/ocr`, {
    method: 'POST',
    body: form,
    signal,
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }

  return res.json();
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`);

  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }

  return res.json();
}
