import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: any, response: any, next: () => void): void {
    const incoming = request.headers?.['x-request-id'];
    const requestId = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();

    request.requestId = requestId;
    request.traceId = `trc_${requestId}`;
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-trace-id', request.traceId);
    next();
  }
}
