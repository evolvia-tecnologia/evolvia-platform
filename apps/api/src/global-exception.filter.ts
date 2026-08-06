import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
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
    const message = status >= 500
      ? 'Ocorreu um erro interno. Utilize o código de rastreamento ao solicitar suporte.'
      : typeof body.message === 'string'
        ? body.message
        : typeof raw === 'string'
          ? raw
          : fields.length > 0
            ? 'Revise os campos informados.'
            : 'Não foi possível concluir a operação.';

    response.status(status).json({
      error: {
        code: typeof body.code === 'string' ? body.code : defaultCode(status),
        message,
        status,
        traceId: request.traceId,
        fields,
        context: typeof body.context === 'object' && body.context !== null ? body.context : {},
      },
    });
  }
}
