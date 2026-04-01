/**
 * Wraps fetch with retry logic and a per-attempt timeout.
 *
 * Retries on:
 * - Network errors (fetch rejects)
 * - HTTP 5xx responses
 *
 * Does NOT retry on:
 * - HTTP 4xx (client errors)
 * - HTTP 2xx / 3xx (success / redirect)
 */
export async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, 'signal'>,
  options: {
    timeoutMs: number;
    maxAttempts?: number;
    baseDelayMs?: number;
  },
): Promise<Response> {
  const { timeoutMs, maxAttempts = 3, baseDelayMs = 200 } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status >= 500 && attempt < maxAttempts) {
        lastError = new Error(`HTTP ${response.status}`);
        await delay(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await delay(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
