import { HttpException, HttpStatus } from '@nestjs/common';

interface ErrorLike {
  status?: number;
  statusCode?: number;
  message?: string | string[];
  error?: unknown;
}

export function asUpstreamHttpError(
  error: unknown,
  fallback: string,
): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  const upstream = extractErrorLike(error);
  const status = mapStatus(upstream.statusCode ?? upstream.status);
  const message = extractMessage(upstream, error, fallback);

  return new HttpException(message, status);
}

export function extractErrorLike(error: unknown): ErrorLike {
  if (typeof error !== 'object' || error === null) {
    return {};
  }

  const direct = error as ErrorLike;
  if (direct.statusCode || direct.status || direct.message) {
    return direct;
  }

  if (
    typeof direct.error === 'object' &&
    direct.error !== null &&
    ('statusCode' in (direct.error as object) ||
      'status' in (direct.error as object) ||
      'message' in (direct.error as object))
  ) {
    return direct.error as ErrorLike;
  }

  return direct;
}

export function extractMessage(
  error: ErrorLike,
  original: unknown,
  fallback: string,
): string {
  if (Array.isArray(error.message)) {
    return error.message.join(', ');
  }
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  if (original instanceof Error && original.message.trim()) {
    return original.message;
  }
  return fallback;
}

function mapStatus(status?: number): number {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return HttpStatus.BAD_REQUEST;
    case HttpStatus.NOT_FOUND:
      return HttpStatus.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return HttpStatus.CONFLICT;
    default:
      return HttpStatus.BAD_GATEWAY;
  }
}
