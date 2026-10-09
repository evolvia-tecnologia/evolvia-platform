/**
 * Pedido de uma abertura. Não envia corpo nem cookie.
 * `referrerPolicy: no-referrer` pede ao navegador para omitir a página de origem.
 * Cabeçalhos e metadados de rede ainda podem seguir no transporte; a tabela da visita não os guarda.
 */
export function publicVisitRequest(slug: string): { url: string; init: RequestInit } {
  return {
    url: `/api/public/events/${encodeURIComponent(slug)}/visit`,
    init: {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      keepalive: true,
      referrerPolicy: 'no-referrer',
    },
  };
}
