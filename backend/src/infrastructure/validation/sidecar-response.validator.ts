/**
 * Lightweight runtime validators for sidecar HTTP responses.
 * Replaces unsafe `as` type assertions with shape checks.
 */

export interface PaddleOcrExtractResult {
  text: string | null;
}

export function validatePaddleOcrExtractResponse(
  body: unknown,
): PaddleOcrExtractResult {
  if (body === null || typeof body !== 'object') {
    throw new Error('PaddleOCR response is not an object');
  }
  const obj = body as Record<string, unknown>;
  const text =
    typeof obj.text === 'string' ? obj.text : null;
  return { text };
}

export interface F5HealthBody {
  ready: boolean;
  device: 'gpu' | 'cpu' | null;
}

export function validateF5HealthResponse(body: unknown): F5HealthBody {
  if (body === null || typeof body !== 'object') {
    throw new Error('F5 health response is not an object');
  }
  const obj = body as Record<string, unknown>;
  return {
    ready: obj.ready === true,
    device:
      obj.device === 'gpu' || obj.device === 'cpu' ? obj.device : null,
  };
}
