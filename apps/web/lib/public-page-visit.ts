/** Pedido de uma abertura. Não envia corpo, cookie, pessoa, IP, navegador nem origem. */
export function publicVisitRequest(slug: string): { url: string; init: RequestInit } {
  return {
    url: `/api/public/events/${encodeURIComponent(slug)}/visit`,
    init: { method: 'POST', cache: 'no-store', credentials: 'omit', keepalive: true },
  };
}
