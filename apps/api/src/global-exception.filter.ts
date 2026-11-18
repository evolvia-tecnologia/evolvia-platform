import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const SAFE_EXCEPTION_NAME = /^[A-Za-z][A-Za-z0-9._]{0,63}$/u;
const SAFE_FRAME_LOCATION = /^[A-Za-z0-9._/\\:-]+$/u;
const FRAME_WITH_PARENS = /\(([^()]+):(\d+):(\d+)\)$/u;
const FRAME_BARE = /^at ([^()\s]+):(\d+):(\d+)$/u;

function validatedMethod(method: unknown): string | undefined {
  if (typeof method !== 'string') return undefined;
  const normalized = method.toUpperCase();
  return HTTP_METHODS.has(normalized) ? normalized : undefined;
}

function frameworkRouteTemplate(route: unknown): string | undefined {
  if (!route || typeof route !== 'object') return undefined;
  const path = (route as { path?: unknown }).path;
  if (typeof path !== 'string' || !path.startsWith('/')) return undefined;
  if (!/^[A-Za-z0-9/_\-.:]*$/u.test(path)) return undefined;
  return path;
}

/** Nome da classe apenas — nunca a mensagem interpolada. */
function safeExceptionName(exception: unknown): string | undefined {
  if (!(exception instanceof Error)) return undefined;
  return SAFE_EXCEPTION_NAME.test(exception.name) ? exception.name : undefined;
}

/**
 * Frames de diagnóstico sem a linha da mensagem.
 * Mantém só localização (arquivo:linha:coluna); descarta nomes de função e a mensagem.
 */
function diagnosticFrames(exception: unknown): string[] {
  if (!(exception instanceof Error) || typeof exception.stack !== 'string') return [];
  const frames: string[] = [];
  for (const rawLine of exception.stack.split('\n').slice(1)) {
    const line = rawLine.trim();
    const match = line.match(FRAME_WITH_PARENS) ?? (line.startsWith('at ') ? line.match(FRAME_BARE) : null);
    if (!match) continue;
    const location = match[1];
    if (!SAFE_FRAME_LOCATION.test(location) || /[?#]|:\/\//u.test(location)) continue;
    frames.push(`${location}:${match[2]}:${match[3]}`);
    if (frames.length >= 10) break;
  }
  return frames;
}

function defaultCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST: return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED: return 'AUTHENTICATION_REQUIRED';
    case HttpStatus.FORBIDDEN: return 'ACCESS_DENIED';
    case HttpStatus.NOT_FOUND: return 'RESOURCE_NOT_FOUND';
    case HttpStatus.CONFLICT: return 'BUSINESS_RULE_VIOLATION';
    case HttpStatus.PAYLOAD_TOO_LARGE: return 'PAYLOAD_TOO_LARGE';
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
    const clientFields = Array.isArray(body.fields)
      ? body.fields
      : Array.isArray(rawMessage)
        ? rawMessage
        : [];
    const traceId = typeof request.traceId === 'string' ? request.traceId : 'trc_unavailable';
    const serverError = status >= 500;
    const message = status === HttpStatus.PAYLOAD_TOO_LARGE
      ? 'O envio excede o limite permitido. Imagens da Divulgação devem ter no máximo 5 MB.'
      : serverError
      ? 'Ocorreu um erro interno. Utilize o código de rastreamento ao solicitar suporte.'
      : typeof body.message === 'string'
        ? body.message
        : typeof raw === 'string'
          ? raw
          : clientFields.length > 0
            ? 'Revise os campos informados.'
            : 'Não foi possível concluir a operação.';

    if (serverError) {
      const method = validatedMethod(request.method);
      const route = frameworkRouteTemplate(request.route);
      const name = safeExceptionName(exception);
      const frames = diagnosticFrames(exception);
      this.logger.error(JSON.stringify({
        traceId,
        status,
        ...(name ? { name } : {}),
        ...(method ? { method } : {}),
        ...(route ? { route } : {}),
        ...(frames.length ? { frames } : {}),
      }));
    }

    response.status(status).json({
      error: {
        code: serverError ? 'INTERNAL_ERROR' : typeof body.code === 'string' ? body.code : defaultCode(status),
        message,
        status,
        traceId,
        fields: serverError ? [] : clientFields,
        context: serverError || typeof body.context !== 'object' || body.context === null ? {} : body.context,
      },
    });
  }
}
