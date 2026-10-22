// Datas relativas ao início da execução, nunca ao calendário de uma entrega.
// O smoke mantém o relógio real da API e a recusa de lotes fora do evento.
export function createSmokeTimeline(now = Date.now()) {
  const day = 24 * 60 * 60 * 1000;
  const iso = (offset) => new Date(now + offset * day).toISOString();
  return {
    eventStart: iso(-2),
    eventEnd: iso(7),
    lotStart: iso(-1),
    lotEnd: iso(7),
    afterEventEnd: iso(8),
  };
}
