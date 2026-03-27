import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorLike {
  status?: number;
  statusCode?: number;
  message?: string | string[];
  error?: unknown;
}

@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      response.status(status).json(payload);
      return;
    }

    const error = this.extractErrorLike(exception);
    const status = this.mapStatus(error.statusCode ?? error.status);
    const message = this.extractMessage(error, exception);

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private extractErrorLike(exception: unknown): ErrorLike {
    if (typeof exception !== 'object' || exception === null) {
      return {};
    }

    const direct = exception as ErrorLike;
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

  private extractMessage(error: ErrorLike, exception: unknown): string {
    if (Array.isArray(error.message)) {
      return error.message.join(', ');
    }
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }
    if (exception instanceof Error && exception.message.trim()) {
      return exception.message;
    }
    return 'Upstream service error';
  }

  private mapStatus(status?: number): number {
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
}
