import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';

@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (req.method !== 'GET') {
      return next.handle();
    }

    return next.handle().pipe(
      map((body) => {
        const json = JSON.stringify(body);
        const etag = `"${createHash('md5').update(json).digest('hex')}"`;
        res.setHeader('ETag', etag);

        if (req.headers['if-none-match'] === etag) {
          res.status(304);
          return undefined;
        }

        return body;
      }),
    );
  }
}
