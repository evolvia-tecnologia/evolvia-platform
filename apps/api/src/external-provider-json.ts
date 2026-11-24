const MAX_JSON_BYTES = 64 * 1024;

export class ExternalProviderJsonError extends Error {
  readonly code: 'provider_response_too_large' | 'provider_invalid_response';
  constructor(code: ExternalProviderJsonError['code']) {
    super(code);
    this.code = code;
  }
}

/** Bound decoded body bytes even when Content-Length is absent or compressed. */
export async function readExternalProviderJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_JSON_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new ExternalProviderJsonError('provider_response_too_large');
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ExternalProviderJsonError('provider_response_too_large');
      }
      if (value.byteLength) chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } catch {
    throw new ExternalProviderJsonError('provider_invalid_response');
  }
}
