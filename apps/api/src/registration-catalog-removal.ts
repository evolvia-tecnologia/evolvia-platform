/**
 * Quais lotes um salvamento do catálogo vai REMOVER.
 *
 * `RegistrationCommercialService.save()` reconcilia por `code`: o que não vem
 * no corpo é apagado por `deleteMany`. Isso é correto enquanto ninguém se
 * inscreveu — e vira problema quando alguém já se inscreveu, porque
 * `EventRegistrationReservation` referencia categoria e lote com
 * `onDelete: Restrict`. O banco recusa, o PostgreSQL devolve violação de
 * chave estrangeira, e sem tratamento isso chega ao organizador como 500.
 *
 * Esta função existe para que a recusa seja ANTECIPADA e nomeada: saber quais
 * lotes sairiam permite responder 409 dizendo exatamente qual lote tem
 * inscrição, em vez de um erro opaco no meio de um salvamento com doze
 * alterações legítimas.
 *
 * Pura de propósito: sem Prisma, sem Nest. Dá para exercitar sem banco.
 */

export type LoteExistente = { id: string; code: string };
export type CategoriaExistente = { code: string; lots: readonly LoteExistente[] };
export type CategoriaPedida = { code: string; lots: readonly { code: string }[] };

export function lotesRemovidos(
  existentes: readonly CategoriaExistente[],
  pedidas: readonly CategoriaPedida[],
): LoteExistente[] {
  const removidos: LoteExistente[] = [];
  for (const categoria of existentes) {
    const mantida = pedidas.find((pedida) => pedida.code === categoria.code);
    if (!mantida) {
      // Categoria inteira sai: todos os lotes dela saem junto.
      removidos.push(...categoria.lots);
      continue;
    }
    for (const lote of categoria.lots) {
      if (!mantida.lots.some((pedido) => pedido.code === lote.code)) removidos.push(lote);
    }
  }
  return removidos;
}
