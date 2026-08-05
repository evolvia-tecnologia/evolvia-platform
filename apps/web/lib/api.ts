export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
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
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (payload as { message?: string | string[] }).message;
    throw new ApiError(
      Array.isArray(message)
        ? message.join(' ')
        : message || 'Não foi possível concluir a operação.',
      response.status,
    );
  }

  return payload as T;
}
