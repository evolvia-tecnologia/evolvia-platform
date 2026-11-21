/**
 * Relatório da trilha de auditoria da Área Master, por escopo (#665).
 *
 * `platform-audit-transaction.ts` ESCREVE a trilha. Este arquivo a LÊ, e o
 * assunto dele é um só: quem lê não pode ver mais do que o seu alcance.
 *
 * A regra que organiza tudo aqui: **o escopo vem da rota, o filtro vem do
 * corpo, e o filtro só pode estreitar.** A rota é o que o guard autorizou — um
 * delegado com `auditar` em um evento chega por `/events/:eventId/audit`, e o
 * guard já conferiu a concessão para AQUELE evento. Se o corpo pudesse trocar o
 * evento, a autorização teria sido conferida para um recurso e aplicada a
 * outro, que é a forma mais comum de vazamento em tela administrativa.
 *
 * Por isso `dentroDoEscopo` existe e é aplicada aqui, e não só no `where` do
 * banco. O `where` é otimização; a fronteira de segurança é esta função, que é
 * pura e tem teste. Se um dia alguém esquecer a cláusula na consulta, a linha
 * fora de escopo não entra no relatório de qualquer forma.
 *
 * Sem dependência nenhuma. Roda sem build.
 */

export type ResultadoDeAuditoria = 'ALLOWED' | 'DENIED' | 'FAILED';
export const RESULTADOS = ['ALLOWED', 'DENIED', 'FAILED'] as const;

/** O alcance autorizado pela rota. Não vem do corpo, nunca. */
export type EscopoDoRelatorio =
  | { tipo: 'PLATAFORMA' }
  | { tipo: 'ORGANIZACAO'; organizationId: string }
  | { tipo: 'EVENTO'; eventId: string };

export type LinhaDaTrilha = {
  actorUserId: string;
  action: string;
  scopeKind: 'GLOBAL' | 'ORGANIZACAO' | 'EVENTO';
  organizationId: string;
  eventId: string;
  targetUserId: string;
  reason: string;
  result: ResultadoDeAuditoria;
  changes: unknown;
  correlationId: string;
  occurredAt: Date | string;
};

export const LIMITE_PADRAO = 100;
export const LIMITE_MAXIMO = 500;
export const MAX_ACOES_NO_FILTRO = 20;

export type FiltroDoRelatorio = {
  de: string | null;
  ate: string | null;
  acoes: string[];
  resultados: ResultadoDeAuditoria[];
  actorUserId: string | null;
  targetUserId: string | null;
  limite: number;
};

export type LeituraDoFiltro =
  | { ok: true; filtro: FiltroDoRelatorio }
  | { ok: false; erros: string[] };

const identificador = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return /^[A-Za-z0-9_-]{8,64}$/u.test(limpo) ? limpo : null;
};

const acao = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  // A ação gravada pode carregar o motivo da recusa depois de dois-pontos
  // (`consultar:SEM_CONCESSAO`), então o filtro aceita esse formato.
  return /^[a-z_]{3,40}(:[A-Z_]{3,40})?$/u.test(limpo) ? limpo : null;
};

function lerData(bruto: unknown, nome: string, erros: string[]): string | null {
  if (bruto === undefined || bruto === null || bruto === '') return null;
  if (typeof bruto !== 'string') {
    erros.push(`A data ${nome} não é válida.`);
    return null;
  }
  const quando = new Date(bruto).getTime();
  if (Number.isNaN(quando)) {
    erros.push(`A data ${nome} não é válida.`);
    return null;
  }
  return new Date(quando).toISOString();
}

/**
 * Lê o filtro do corpo. Acumula todos os problemas.
 *
 * O corpo NÃO carrega escopo: não há como pedir outro evento ou outra
 * organização por aqui. Se um dia alguém acrescentar esses campos, o teste de
 * escopo é o que falha primeiro.
 */
export function validarFiltroDoRelatorio(corpo: unknown): LeituraDoFiltro {
  const erros: string[] = [];
  if (corpo !== undefined && corpo !== null && (typeof corpo !== 'object' || Array.isArray(corpo))) {
    return { ok: false, erros: ['Filtro inválido.'] };
  }
  const bruto = (corpo ?? {}) as Record<string, unknown>;

  const de = lerData(bruto.de, 'inicial', erros);
  const ate = lerData(bruto.ate, 'final', erros);
  if (de && ate && new Date(de).getTime() > new Date(ate).getTime()) {
    erros.push('A data inicial do período é posterior à final.');
  }

  let acoes: string[] = [];
  if (bruto.acoes !== undefined && bruto.acoes !== null) {
    if (!Array.isArray(bruto.acoes)) {
      erros.push('O filtro de ações precisa ser uma lista.');
    } else if (bruto.acoes.length > MAX_ACOES_NO_FILTRO) {
      erros.push(`Escolha no máximo ${MAX_ACOES_NO_FILTRO} ações.`);
    } else {
      const lidas = bruto.acoes.map(acao);
      if (lidas.some((item) => item === null)) erros.push('Há ação inválida no filtro.');
      else acoes = [...new Set(lidas as string[])];
    }
  }

  let resultados: ResultadoDeAuditoria[] = [];
  if (bruto.resultados !== undefined && bruto.resultados !== null) {
    if (!Array.isArray(bruto.resultados)) {
      erros.push('O filtro de resultados precisa ser uma lista.');
    } else {
      const conhecidos = RESULTADOS as readonly string[];
      const lidos = bruto.resultados.map((v) => (typeof v === 'string' && conhecidos.includes(v.trim()) ? v.trim() : null));
      if (lidos.some((item) => item === null)) erros.push('Há resultado inválido no filtro.');
      else resultados = [...new Set(lidos as ResultadoDeAuditoria[])];
    }
  }

  const leitorOuNulo = (campo: unknown, nome: string): string | null => {
    if (campo === undefined || campo === null || campo === '') return null;
    const lido = identificador(campo);
    if (!lido) erros.push(`O filtro de ${nome} não é um identificador válido.`);
    return lido;
  };
  const actorUserId = leitorOuNulo(bruto.actorUserId, 'autor');
  const targetUserId = leitorOuNulo(bruto.targetUserId, 'alvo');

  let limite = LIMITE_PADRAO;
  if (bruto.limite !== undefined && bruto.limite !== null) {
    if (typeof bruto.limite !== 'number' || !Number.isInteger(bruto.limite) || bruto.limite < 1) {
      erros.push('O limite precisa ser um número inteiro de pelo menos 1.');
    } else if (bruto.limite > LIMITE_MAXIMO) {
      erros.push(`O limite máximo é ${LIMITE_MAXIMO}.`);
    } else {
      limite = bruto.limite;
    }
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, filtro: { de, ate, acoes, resultados, actorUserId, targetUserId, limite } };
}

/**
 * A restrição que a consulta ao banco deve aplicar.
 *
 * Derivada do ESCOPO, nunca do corpo. É otimização: a fronteira de segurança é
 * `dentroDoEscopo`, aplicada depois sobre o que voltou.
 */
export function restricaoDoEscopo(escopo: EscopoDoRelatorio): { organizationId?: string; eventId?: string } {
  if (escopo.tipo === 'EVENTO') return { eventId: escopo.eventId };
  if (escopo.tipo === 'ORGANIZACAO') return { organizationId: escopo.organizationId };
  return {};
}

/**
 * A linha pertence ao alcance de quem está lendo?
 *
 * `PLATAFORMA` alcança tudo — só chega aqui quem tem concessão global.
 *
 * `EVENTO` alcança apenas as linhas gravadas contra aquele evento. Ações de
 * alcance global não aparecem, mesmo que tenham afetado o evento: elas foram
 * gravadas sem `eventId`, e mostrá-las a um auditor de um evento contaria o que
 * acontece no resto da plataforma. É um limite real do relatório por evento, e
 * é melhor que seja explícito do que descoberto depois.
 */
export function dentroDoEscopo(linha: LinhaDaTrilha, escopo: EscopoDoRelatorio): boolean {
  if (escopo.tipo === 'PLATAFORMA') return true;
  if (escopo.tipo === 'EVENTO') return linha.eventId === escopo.eventId && linha.eventId.length > 0;
  return linha.organizationId === escopo.organizationId && linha.organizationId.length > 0;
}

export type ItemDoRelatorio = {
  quando: string;
  acao: string;
  resultado: ResultadoDeAuditoria;
  autor: string;
  alvo: string | null;
  organizationId: string | null;
  eventId: string | null;
  motivo: string;
  alteracoes: unknown;
  correlacao: string;
};

export type Relatorio = {
  escopo: EscopoDoRelatorio;
  mostrados: number;
  truncado: boolean;
  /** Sobre o que os agregados foram calculados. Nunca mentir sobre isso. */
  agregadosSobre: 'tudo' | 'pagina';
  itens: ItemDoRelatorio[];
  porResultado: Record<ResultadoDeAuditoria, number>;
  porAcao: { chave: string; total: number }[];
};

const instante = (valor: Date | string): number => {
  const data = valor instanceof Date ? valor : new Date(valor);
  const tempo = data.getTime();
  return Number.isNaN(tempo) ? 0 : tempo;
};

const iso = (valor: Date | string): string => new Date(instante(valor)).toISOString();

/** `''` é a sentinela de coluna vazia do schema; no relatório vira ausência. */
const ouNulo = (valor: string): string | null => (valor.length > 0 ? valor : null);

function passaNoFiltro(linha: LinhaDaTrilha, filtro: FiltroDoRelatorio): boolean {
  const quando = instante(linha.occurredAt);
  if (filtro.de && quando < new Date(filtro.de).getTime()) return false;
  if (filtro.ate && quando > new Date(filtro.ate).getTime()) return false;
  if (filtro.acoes.length > 0 && !filtro.acoes.includes(linha.action)) return false;
  if (filtro.resultados.length > 0 && !filtro.resultados.includes(linha.result)) return false;
  if (filtro.actorUserId && linha.actorUserId !== filtro.actorUserId) return false;
  if (filtro.targetUserId && linha.targetUserId !== filtro.targetUserId) return false;
  return true;
}

/**
 * Monta o relatório.
 *
 * O escopo é aplicado ANTES do filtro, e é o filtro que pode ser vazio — nunca
 * o escopo. Mais recente primeiro, que é a ordem que um auditor lê.
 *
 * Truncamento nunca é silencioso: quando a lista é cortada, `truncado` fica
 * verdadeiro e `agregadosSobre` passa a `'pagina'`. Um relatório que corta e
 * diz um total como se fosse tudo é pior que um relatório que não existe,
 * porque alguém decide com base nele.
 */
export function montarRelatorio(
  linhas: readonly LinhaDaTrilha[],
  escopo: EscopoDoRelatorio,
  filtro: FiltroDoRelatorio,
): Relatorio {
  const noEscopo = linhas.filter((linha) => dentroDoEscopo(linha, escopo));
  const selecionadas = noEscopo
    .filter((linha) => passaNoFiltro(linha, filtro))
    .sort((a, b) => instante(b.occurredAt) - instante(a.occurredAt));

  const truncado = selecionadas.length > filtro.limite;
  const pagina = truncado ? selecionadas.slice(0, filtro.limite) : selecionadas;

  const porResultado: Record<ResultadoDeAuditoria, number> = { ALLOWED: 0, DENIED: 0, FAILED: 0 };
  const contagemPorAcao = new Map<string, number>();
  for (const linha of pagina) {
    porResultado[linha.result] += 1;
    contagemPorAcao.set(linha.action, (contagemPorAcao.get(linha.action) ?? 0) + 1);
  }

  return {
    escopo,
    mostrados: pagina.length,
    truncado,
    agregadosSobre: truncado ? 'pagina' : 'tudo',
    itens: pagina.map((linha) => ({
      quando: iso(linha.occurredAt),
      acao: linha.action,
      resultado: linha.result,
      autor: linha.actorUserId,
      alvo: ouNulo(linha.targetUserId),
      organizationId: ouNulo(linha.organizationId),
      eventId: ouNulo(linha.eventId),
      motivo: linha.reason,
      alteracoes: linha.changes ?? null,
      correlacao: linha.correlationId,
    })),
    porResultado,
    porAcao: [...contagemPorAcao.entries()]
      .map(([chave, total]) => ({ chave, total }))
      .sort((a, b) => (b.total - a.total) || a.chave.localeCompare(b.chave)),
  };
}
