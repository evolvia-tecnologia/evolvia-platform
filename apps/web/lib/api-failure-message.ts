/**
 * Public failure text only. Never show raw 5xx messages, stack traces or URLs.
 * A failed POST response does not prove that its side effect did not happen.
 */
export function apiFailureTraceId(value: unknown): string | undefined {
  return typeof value === 'string'
    && value !== 'trc_unavailable'
    && /^trc_[A-Za-z0-9._:-]{1,64}$/u.test(value)
    ? value
    : undefined;
}

export function apiFailureMessage(status: number, summary: string, traceId: unknown): string {
  if (status < 500) return summary;
  const message = status === 503
    ? 'O serviço está temporariamente indisponível. A conclusão da operação não foi confirmada.'
    : 'Não foi possível confirmar a conclusão da operação.';
  const reference = apiFailureTraceId(traceId);
  return reference
    ? `${message} Referência para suporte: ${reference}.`
    : `${message} Procure o suporte se o problema persistir.`;
}

