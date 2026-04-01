import type { Provider, Type } from '@nestjs/common';

export function smokeOnlyProvider<T>(
  token: abstract new (...args: any[]) => T,
  real: Type<T>,
  stub: Type<T>,
): Provider {
  return {
    provide: token,
    useClass: process.env.LM_STUDIO_SMOKE_ONLY === 'true' ? stub : real,
  };
}
