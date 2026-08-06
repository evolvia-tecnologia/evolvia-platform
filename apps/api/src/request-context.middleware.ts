import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: any, response: any, next: () => void): void {
    const incoming = request.headers?.['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length <= 120 ? incoming : randomUUID();
    request.requestId = requestId;
    request.traceId = `trc_${requestId}`;
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-trace-id', request.traceId);
    next();
  }
}
