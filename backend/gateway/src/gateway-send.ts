import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { asUpstreamHttpError } from './upstream-http-error';

export async function gatewaySend<TPayload, TResult>(
  client: ClientProxy,
  pattern: string,
  payload: TPayload,
  errorContext: string,
  timeoutMs?: number,
): Promise<TResult> {
  try {
    const observable = client.send<TResult, TPayload>(pattern, payload);
    return await lastValueFrom(
      timeoutMs ? observable.pipe(timeout(timeoutMs)) : observable,
      { defaultValue: undefined as TResult },
    );
  } catch (error) {
    throw asUpstreamHttpError(error, errorContext);
  }
}
