import { createHash } from 'crypto';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ETagInterceptor } from './etag.interceptor';

function createContext(method: string, headers: Record<string, string> = {}) {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn(),
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, response };
}

describe('ETagInterceptor', () => {
  let interceptor: ETagInterceptor;

  beforeEach(() => {
    interceptor = new ETagInterceptor();
  });

  it('passes through non-GET requests without writing an ETag', async () => {
    const { context, response } = createContext('POST');
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      ok: true,
    });
    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  it('sets an ETag and returns the body when the request cache does not match', async () => {
    const { context, response } = createContext('GET');
    const body = { id: 'doc-1', text: 'hello' };
    const next: CallHandler = { handle: () => of(body) };

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toEqual(
      body,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'ETag',
      `"${createHash('md5').update(JSON.stringify(body)).digest('hex')}"`,
    );
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns undefined and sets 304 when the ETag matches', async () => {
    const body = { id: 'doc-2', text: 'cached' };
    const etag = `"${createHash('md5').update(JSON.stringify(body)).digest('hex')}"`;
    const { context, response } = createContext('GET', {
      'if-none-match': etag,
    });
    const next: CallHandler = { handle: () => of(body) };

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBeUndefined();
    expect(response.setHeader).toHaveBeenCalledWith('ETag', etag);
    expect(response.status).toHaveBeenCalledWith(304);
  });
});
