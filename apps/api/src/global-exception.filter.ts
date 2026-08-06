import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

function defaultCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST: return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED: return 'AUTHENTICATION_REQUIRED';
    case HttpStatus.FORBIDDEN: return 'ACCESS_DENIED';
    case HttpStatus.NOT_FOUND: return 'RESOURCE_NOT_FOUND';
    case HttpStatus.CONFLICT: return 'BUSINESS_RULE_VIOLATION';
    default: return status >= 500 ? 'INTERNAL_ERROR' : 'BUSINESS_RULE_VIOLATION';
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<any>();
    const response = context.getResponse<any>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const rawMessage = body.message ?? raw;
    const fields = Array.isArray(rawMessage) ? rawMessage : [];
    const traceId = typeof request.traceId === 'string' ? request.traceId : 'trc_unavailable';
    const message = status >= 500
      ? 'Ocorreu um erro interno. Utilize o código de rastreamento ao solicitar suporte.'
      : typeof body.message === 'string'
        ? body.message
        : typeof raw === 'string'
          ? raw
          : fields.length > 0
            ? 'Revise os campos informados.'
            : 'Não foi possível concluir a operação.';

    if (status >= 500) {
      const method = typeof request.method === 'string' ? request.method : 'UNKNOWN';
      const url = typeof request.originalUrl === 'string'
        ? request.originalUrl
        : typeof request.url === 'string'
          ? request.url
          : 'unknown';
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `[${traceId}] ${method} ${url} falhou com status ${status}`,
        stack,
      );
    }

    response.status(status).json({
      error: {
        code: typeof body.code === 'string' ? body.code : defaultCode(status),
        message,
        status,
        traceId,
        fields,
        context: typeof body.context === 'object' && body.context !== null ? body.context : {},
      },
    });
  }
}
