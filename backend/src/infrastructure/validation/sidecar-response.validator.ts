/**
 * Lightweight runtime validators for sidecar HTTP responses.
 * Replaces unsafe `as` type assertions with shape checks.
 */

export interface TtsHealthBody {
  ready: boolean;
  device: 'gpu' | 'cpu' | null;
}

export function validateTtsHealthResponse(
  body: unknown,
  label: string,
): TtsHealthBody {
  if (body === null || typeof body !== 'object') {
    throw new Error(`${label} health response is not an object`);
  }
  const obj = body as Record<string, unknown>;
  return {
    ready: obj.ready === true,
    device:
      obj.device === 'gpu' || obj.device === 'cpu' ? obj.device : null,
  };
}
