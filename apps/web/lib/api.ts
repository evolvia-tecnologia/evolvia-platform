import { apiFailureMessage } from './api-failure-message';

type ApiErrorField = string | { field?: string; message?: string };

type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    status?: number;
    traceId?: string;
    fields?: ApiErrorField[];
    context?: Record<string, unknown>;
  };
  message?: string | string[];
};

function fieldMessage(field: ApiErrorField): string | null {
  if (typeof field === 'string') return field.trim() || null;
  if (field && typeof field.message === 'string') return field.message.trim() || null;
  return null;
}

export class ApiError extends Error {
  readonly code?: string;
  readonly traceId?: string;
  readonly fields: ApiErrorField[];
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    public readonly status: number,
    details: {
      code?: string;
      traceId?: string;
      fields?: ApiErrorField[];
      context?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = details.code;
    this.traceId = details.traceId;
    this.fields = details.fields ?? [];
    this.context = details.context ?? {};
  }
}

export function getToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem('evolvia_token');
}

export function saveSession(token: string, user: unknown): void {
  localStorage.setItem('evolvia_token', token);
  localStorage.setItem('evolvia_user', JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem('evolvia_token');
  localStorage.removeItem('evolvia_user');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as ApiErrorEnvelope;

  if (!response.ok) {
    const envelope = payload.error;
    const fields = Array.isArray(envelope?.fields) ? envelope.fields : [];
    const detailedFieldMessages = fields
      .map(fieldMessage)
      .filter((value): value is string => Boolean(value));

    const legacyMessage = payload.message;
    const legacyText = Array.isArray(legacyMessage)
      ? legacyMessage.join(' ')
      : legacyMessage;

    const summary = envelope?.message || legacyText;
    const message = detailedFieldMessages.length > 0
      ? detailedFieldMessages.join(' ')
      : summary || 'Não foi possível concluir a operação.';

    throw new ApiError(apiFailureMessage(response.status, message, envelope?.traceId), response.status, {
      code: envelope?.code,
      traceId: envelope?.traceId,
      fields,
      context: envelope?.context,
    });
  }

  return payload as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { headers, cache: 'no-store' });
  if (!response.ok) {
    const traceId = response.headers.get('x-trace-id') ?? undefined;
    throw new ApiError(apiFailureMessage(response.status, 'Não foi possível carregar a mídia.', traceId), response.status, { traceId });
  }
  return response.blob();
}
