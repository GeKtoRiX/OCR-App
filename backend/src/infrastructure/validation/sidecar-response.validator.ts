/**
 * Lightweight runtime validators for sidecar HTTP responses.
 * Replaces unsafe `as` type assertions with shape checks.
 */

export interface F5HealthBody {
  ready: boolean;
  device: 'gpu' | 'cpu' | null;
}

function validateTtsHealthResponse(
  body: unknown,
  label: string,
): F5HealthBody {
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

export function validateF5HealthResponse(body: unknown): F5HealthBody {
  return validateTtsHealthResponse(body, 'F5');
}

export interface VoxtralHealthBody extends F5HealthBody {}

export function validateVoxtralHealthResponse(
  body: unknown,
): VoxtralHealthBody {
  return validateTtsHealthResponse(body, 'Voxtral');
}
