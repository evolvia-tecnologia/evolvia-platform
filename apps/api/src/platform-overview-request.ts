/**
 * Leitura do filtro da visão geral da Área Master (#665).
 *
 * `platform-overview-policy.ts` responde "quantos e quais". Este arquivo
 * responde antes: o recorte pedido é um recorte válido?
 *
 * Existe separado pelo mesmo motivo que `platform-grant-request.ts`: filtro
 * vem da tela, a tela erra, e a pessoa precisa saber O QUE errou. Deixar valor
 * desconhecido passar daria zero resultado sem explicação — e zero por filtro
 * errado é indistinguível de zero de verdade, que é justamente a confusão que
 * a visão geral não pode criar.
 *
 * Os catálogos abaixo espelham os enums do schema. Se um enum ganhar valor
 * novo e este arquivo não, o filtro novo é recusado com mensagem clara, que é
 * melhor do que ser aceito e não filtrar nada.
 *
 * Sem dependência nenhuma. Roda sem build.
 */

export const FORMATOS = ['IN_PERSON', 'ONLINE', 'HYBRID'] as const;

export const SITUACOES = [
  'DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH',
  'PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED',
] as const;

export const PERFIS = [
  'SCIENTIFIC_EVENT', 'CORPORATE_TRAINING', 'FAIR_EXHIBITION',
  'ENTERTAINMENT', 'SOCIAL_COMMUNITY', 'OTHER',
] as const;

export const CAMPOS_DO_PERIODO = ['createdAt', 'startDate'] as const;

/** Teto por dimensão. Lista enorme vinda da tela é defeito, não recorte. */
export const MAX_POR_DIMENSAO = 200;

export type Formato = (typeof FORMATOS)[number];
export type Situacao = (typeof SITUACOES)[number];
export type Perfil = (typeof PERFIS)[number];
export type CampoDoPeriodo = (typeof CAMPOS_DO_PERIODO)[number];

/**
 * O filtro já lido.
 *
 * Os campos de catálogo carregam a união derivada do próprio catálogo, e não
 * `string[]`. Isso faz o valor sair daqui já no tipo que a política consome,
 * sem cast no meio — e cast é onde um valor fora do catálogo passaria sem
 * ninguém ver.
 */
export type FiltroLido = {
  de: string | null;
  ate: string | null;
  campoDoPeriodo: CampoDoPeriodo;
  organizationIds: string[];
  profileCodes: Perfil[];
  areas: string[];
  formatos: Formato[];
  situacoes: Situacao[];
};

export type LeituraDoFiltro =
  | { ok: true; filtro: FiltroLido }
  | { ok: false; erros: string[] };

const identificador = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return /^[A-Za-z0-9_-]{8,64}$/u.test(limpo) ? limpo : null;
};

/** Área é texto curto escolhido pela tela, não id. */
const area = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim().toLowerCase();
  return /^[a-z0-9_-]{2,40}$/u.test(limpo) ? limpo : null;
};

function unicos(valores: readonly string[]): string[] {
  return [...new Set(valores)];
}

function lerLista(
  bruto: unknown,
  nome: string,
  ler: (valor: unknown) => string | null,
  erros: string[],
): string[] {
  if (bruto === undefined || bruto === null) return [];
  if (!Array.isArray(bruto)) {
    erros.push(`O filtro de ${nome} precisa ser uma lista.`);
    return [];
  }
  if (bruto.length > MAX_POR_DIMENSAO) {
    erros.push(`Escolha no máximo ${MAX_POR_DIMENSAO} itens em ${nome}.`);
    return [];
  }
  const lidos = bruto.map(ler);
  if (lidos.some((item) => item === null)) {
    erros.push(`Há valor inválido no filtro de ${nome}.`);
    return [];
  }
  return unicos(lidos as string[]);
}

function lerCatalogo<T extends string>(
  bruto: unknown,
  nome: string,
  catalogo: readonly T[],
  erros: string[],
): T[] {
  return lerLista(
    bruto, nome,
    (valor) => (typeof valor === 'string' && (catalogo as readonly string[]).includes(valor.trim()) ? valor.trim() : null),
    erros,
  ) as T[];
}

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
 * Lê o filtro e acumula TODOS os problemas.
 *
 * Acumular em vez de parar no primeiro: quem monta um recorte com período,
 * organização, perfil, área e formato quer saber dos cinco de uma vez.
 */
export function validarFiltroDaVisaoGeral(corpo: unknown): LeituraDoFiltro {
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

  let campoDoPeriodo: CampoDoPeriodo = 'createdAt';
  if (bruto.campoDoPeriodo !== undefined && bruto.campoDoPeriodo !== null) {
    if (typeof bruto.campoDoPeriodo !== 'string' || !(CAMPOS_DO_PERIODO as readonly string[]).includes(bruto.campoDoPeriodo)) {
      erros.push('O período pode ser contado pela criação ou pela data de início do evento.');
    } else {
      campoDoPeriodo = bruto.campoDoPeriodo as CampoDoPeriodo;
    }
  }

  const organizationIds = lerLista(bruto.organizationIds, 'organizações', identificador, erros);
  const areas = lerLista(bruto.areas, 'áreas', area, erros);
  const profileCodes = lerCatalogo(bruto.profileCodes, 'perfis', PERFIS, erros);
  const formatos = lerCatalogo(bruto.formatos, 'formatos', FORMATOS, erros);
  const situacoes = lerCatalogo(bruto.situacoes, 'situações', SITUACOES, erros);

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, filtro: { de, ate, campoDoPeriodo, organizationIds, profileCodes, areas, formatos, situacoes } };
}
