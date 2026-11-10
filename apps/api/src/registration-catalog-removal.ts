/**
 * Quais lotes um salvamento do catálogo vai REMOVER, e o que impede cada um.
 *
 * `RegistrationCommercialService.save()` reconcilia por `code`: o que não vem
 * no corpo é apagado por `deleteMany`. Isso é correto enquanto ninguém usou o
 * lote — e vira problema depois, porque TRÊS modelos o referenciam com
 * `onDelete: Restrict`:
 *
 *     EventRegistrationReservation   inscrição
 *     EventRegistrationOrderEntry    pedido
 *     EventRegistrationWaitlistEntry fila de espera
 *
 * O banco recusa nos três casos. Sem tratamento, a recusa chega ao organizador
 * como 500, no meio de um salvamento que podia ter outras alterações legítimas,
 * e sem dizer qual lote travou nem por quê.
 *
 * Estas funções existem para que a recusa seja ANTECIPADA e NOMEADA. Puras de
 * propósito: sem Prisma, sem Nest, exercitáveis sem banco.
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

/** Vínculos que impedem a remoção, em ordem de gravidade para quem lê. */
export type VinculosDoLote = {
  inscricoes?: readonly string[];
  pedidos?: readonly string[];
  fila?: readonly string[];
};

export type LoteImpedido = { code: string; motivos: string[] };

/**
 * Cruza os lotes que sairiam com os ids encontrados em cada tabela.
 *
 * Devolve ordenado por código e com os motivos em ordem fixa, para a mensagem
 * ser estável: organizador que tenta duas vezes tem de ler a mesma coisa.
 */
export function lotesImpedidos(
  removidos: readonly LoteExistente[],
  vinculos: VinculosDoLote,
): LoteImpedido[] {
  const rotulos: Array<[keyof VinculosDoLote, string]> = [
    ['inscricoes', 'inscrição'],
    ['pedidos', 'pedido'],
    ['fila', 'fila de espera'],
  ];
  const impedidos: LoteImpedido[] = [];
  for (const lote of removidos) {
    const motivos = rotulos
      .filter(([chave]) => (vinculos[chave] ?? []).includes(lote.id))
      .map(([, rotulo]) => rotulo);
    if (motivos.length > 0) impedidos.push({ code: lote.code, motivos });
  }
  return impedidos.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/** Texto único da recusa, para não divergir entre chamadas. */
export function mensagemDeLotesImpedidos(impedidos: readonly LoteImpedido[]): string {
  const lista = impedidos.map((lote) => `${lote.code} (${lote.motivos.join(', ')})`).join('; ');
  return `Não é possível remover lote que já está em uso: ${lista}. `
    + 'Desative o lote em vez de removê-lo, para preservar inscrições, pedidos, fila de espera, '
    + 'preço praticado e histórico.';
}
