const DEFAULT_PUBLIC_API_BASE = 'http://api:4000';
export const PUBLIC_API_FETCH_TIMEOUT_MS = 5_000;

export type PublicEventProfile = {
  profileCode: string | null;
  eventType: string | null;
};

export const EMPTY_PUBLIC_EVENT_PROFILE: PublicEventProfile = { profileCode: null, eventType: null };

export function publicApiBaseUrl(raw = process.env.EVOLVIA_API_INTERNAL_URL): string {
  return (raw ?? DEFAULT_PUBLIC_API_BASE).replace(/\/+$/u, '');
}

export function publicApiUrl(path: string, rawBase?: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${publicApiBaseUrl(rawBase)}${suffix}`;
}

export function publicApiSignal(timeoutMs = PUBLIC_API_FETCH_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function readPublicEventProfile(payload: unknown): PublicEventProfile {
  if (!payload || typeof payload !== 'object') return EMPTY_PUBLIC_EVENT_PROFILE;
  const event = (payload as { event?: { profileCode?: unknown; eventType?: unknown } }).event;
  return {
    profileCode: typeof event?.profileCode === 'string' ? event.profileCode : null,
    eventType: typeof event?.eventType === 'string' ? event.eventType : null,
  };
}

export async function fetchPublicJson(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  try {
    const { timeoutMs, signal, ...rest } = init ?? {};
    const response = await fetch(publicApiUrl(path), {
      ...rest,
      signal: signal ?? publicApiSignal(timeoutMs),
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { ok: response.ok, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, payload: null };
  }
}

export async function fetchPublicEventProfile(slug: string): Promise<PublicEventProfile> {
  const result = await fetchPublicJson(`/public/events/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (!result.ok) return EMPTY_PUBLIC_EVENT_PROFILE;
  return readPublicEventProfile(result.payload);
}
