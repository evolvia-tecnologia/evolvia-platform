/**
 * Catálogo pesquisável de eventos da Área Master (#665).
 *
 * A visão geral responde "quantos e quais", e devolve ids. Ids não são nomes:
 * um painel que mostra `cm9x8...` para uma pessoa não serve. Este arquivo é a
 * outra metade — a lista legível, com busca, ordem e página.
 *
 * **Reaproveita `selecionarEventos` da política da visão geral em vez de
 * reimplementar o filtro.** Essa decisão é o ponto principal do arquivo. As
 * duas telas recortam pelas mesmas cinco dimensões, e duas implementações
 * parecidas de "este evento entra no recorte" é como o painel passa a dizer 12
 * e a lista a mostrar 11 — divergência que ninguém nota até alguém conferir à
 * mão. Com uma função só, contagem e listagem não podem discordar.
 *
 * Isso tem um custo que vale dizer: o filtro roda em memória, então a consulta
 * traz o superconjunto e a paginação acontece aqui, não no banco. É a mesma
 * varredura que a visão geral já faz, aceitável enquanto a plataforma tem
 * poucos eventos. Quando crescer, o caminho é mover filtro E contagem para SQL
 * juntos — nunca um só, porque é a separação que cria a divergência.
 *
 * Sem dependência de framework. Roda sem build.
 */

import { selecionarEventos } from './platform-overview-policy.ts';
import { validarFiltroDaVisaoGeral } from './platform-overview-request.ts';
import type { EventoParaVisaoGeral } from './platform-overview-policy.ts';
import type { FiltroLido } from './platform-overview-request.ts';

export const LIMITE_PADRAO = 25;
export const LIMITE_MAXIMO = 100;
export const MIN_TERMO = 2;
export const MAX_TERMO = 120;

export const ORDENS = ['recentes', 'nome', 'inicio'] as const;
export type Ordem = (typeof ORDENS)[number];

export type PedidoDoCatalogo = {
  readonly filtro: FiltroLido;
  /** Texto de busca já normalizado, ou `null`. */
  readonly termo: string | null;
  readonly ordem: Ordem;
  /** Começa em 1. Página 0 não existe para quem lê. */
  readonly pagina: number;
  readonly limite: number;
  /**
   * Mostrar eventos removidos pela plataforma.
   *
   * Padrão falso. Mas tem de EXISTIR: não se restaura o que não se acha, e
   * esconder removido sempre deixaria a restauração sem caminho na interface.
   */
  readonly mostrarRemovidos: boolean;
};

export type LeituraDoPedido =
  | { ok: true; pedido: PedidoDoCatalogo }
  | { ok: false; erros: string[] };

/**
 * Normaliza para busca: minúsculas e sem acento.
 *
 * Busca com acento é busca que não acha. Quem digita "saude" espera encontrar
 * "Saúde", e quem digita "Saúde" espera encontrar "saude" — então os dois
 * lados passam por aqui, e a comparação é entre formas normalizadas.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function lerInteiro(
  bruto: unknown,
  nome: string,
  minimo: number,
  maximo: number,
  padrao: number,
  erros: string[],
): number {
  if (bruto === undefined || bruto === null) return padrao;
  if (typeof bruto !== 'number' || !Number.isInteger(bruto)) {
    erros.push(`O campo ${nome} precisa ser um número inteiro.`);
    return padrao;
  }
  if (bruto < minimo) {
    erros.push(`O campo ${nome} precisa ser pelo menos ${minimo}.`);
    return padrao;
  }
  if (bruto > maximo) {
    erros.push(`O campo ${nome} não pode passar de ${maximo}.`);
    return padrao;
  }
  return bruto;
}

/**
 * Lê o pedido do catálogo, acumulando TODOS os problemas.
 *
 * As cinco dimensões compartilhadas vão para `validarFiltroDaVisaoGeral`, que
 * já sabe recusá-las com mensagem. O que se lê aqui é só o que é do catálogo:
 * busca, ordem e página.
 */
export function validarPedidoDoCatalogo(corpo: unknown): LeituraDoPedido {
  if (corpo !== undefined && corpo !== null && (typeof corpo !== 'object' || Array.isArray(corpo))) {
    return { ok: false, erros: ['Pedido inválido.'] };
  }
  const bruto = (corpo ?? {}) as Record<string, unknown>;

  const compartilhado = validarFiltroDaVisaoGeral(corpo);
  const erros: string[] = compartilhado.ok ? [] : [...compartilhado.erros];

  let termo: string | null = null;
  if (bruto.termo !== undefined && bruto.termo !== null && bruto.termo !== '') {
    if (typeof bruto.termo !== 'string') {
      erros.push('A busca precisa ser um texto.');
    } else if (bruto.termo.trim().length > MAX_TERMO) {
      erros.push(`A busca não pode passar de ${MAX_TERMO} caracteres.`);
    } else {
      const limpo = normalizar(bruto.termo);
      // Menos de dois caracteres casa com quase tudo: não é busca, é varredura
      // com aparência de busca. Melhor recusar e dizer.
      if (limpo.length < MIN_TERMO) {
        erros.push(`A busca precisa ter pelo menos ${MIN_TERMO} caracteres.`);
      } else {
        termo = limpo;
      }
    }
  }

  let ordem: Ordem = 'recentes';
  if (bruto.ordem !== undefined && bruto.ordem !== null) {
    if (typeof bruto.ordem !== 'string' || !(ORDENS as readonly string[]).includes(bruto.ordem)) {
      erros.push('A ordem pode ser por mais recentes, por nome ou por data de início.');
    } else {
      ordem = bruto.ordem as Ordem;
    }
  }

  const pagina = lerInteiro(bruto.pagina, 'pagina', 1, 10_000, 1, erros);
  const limite = lerInteiro(bruto.limite, 'limite', 1, LIMITE_MAXIMO, LIMITE_PADRAO, erros);

  let mostrarRemovidos = false;
  if (bruto.mostrarRemovidos !== undefined && bruto.mostrarRemovidos !== null) {
    if (typeof bruto.mostrarRemovidos !== 'boolean') {
      erros.push('O campo mostrarRemovidos precisa ser verdadeiro ou falso.');
    } else {
      mostrarRemovidos = bruto.mostrarRemovidos;
    }
  }

  if (erros.length > 0 || !compartilhado.ok) {
    return { ok: false, erros: erros.length > 0 ? erros : ['Pedido inválido.'] };
  }
  return { ok: true, pedido: { filtro: compartilhado.filtro, termo, ordem, pagina, limite, mostrarRemovidos } };
}

/** O que a consulta traz: o que a visão geral precisa, mais o que a pessoa lê. */
export type EventoDoCatalogo = EventoParaVisaoGeral & {
  readonly name: string;
  readonly slug: string;
  readonly eventType: string;
  readonly organizationName: string | null;
  readonly updatedAt: Date | string;
  /** Removido pela plataforma. Vem da moderação; sem a tabela, sempre falso. */
  readonly removido?: boolean;
};

export type ItemDoCatalogo = {
  id: string;
  nome: string;
  slug: string;
  tipo: string;
  organizacao: string | null;
  organizationId: string | null;
  situacao: string;
  formato: string;
  perfil: string | null;
  areas: string[];
  criadoEm: string;
  atualizadoEm: string;
  inicio: string | null;
  fim: string | null;
  removido: boolean;
};

export type Catalogo = {
  itens: ItemDoCatalogo[];
  /** Quantos atendem ao recorte, não quantos esta página mostra. */
  total: number;
  pagina: number;
  limite: number;
  paginas: number;
  ordem: Ordem;
  termo: string | null;
  mostrandoRemovidos: boolean;
};

const instante = (valor: Date | string | null | undefined): number | null => {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  const tempo = data.getTime();
  return Number.isNaN(tempo) ? null : tempo;
};

const iso = (valor: Date | string | null | undefined): string | null => {
  const tempo = instante(valor);
  return tempo === null ? null : new Date(tempo).toISOString();
};

/**
 * O termo casa com este evento?
 *
 * Procura no nome, no slug, no tipo e no nome da organização — os quatro
 * textos que a pessoa vê na linha. Buscar em campo invisível produz resultado
 * que não se explica: a linha aparece e nada nela contém o que foi digitado.
 */
function casaComTermo(evento: EventoDoCatalogo, termo: string): boolean {
  const alvos = [evento.name, evento.slug, evento.eventType, evento.organizationName ?? ''];
  return alvos.some((alvo) => normalizar(alvo).includes(termo));
}

function comparar(ordem: Ordem): (a: EventoDoCatalogo, b: EventoDoCatalogo) => number {
  if (ordem === 'nome') {
    return (a, b) => a.name.localeCompare(b.name, 'pt-BR');
  }
  if (ordem === 'inicio') {
    return (a, b) => {
      const ia = instante(a.startDate);
      const ib = instante(b.startDate);
      // Sem data vai para o FIM. No começo, enterraria os próximos eventos
      // atrás de uma pilha de rascunhos sem data — e a ordem por início existe
      // justamente para ver o que vem aí.
      if (ia === null && ib === null) return a.name.localeCompare(b.name, 'pt-BR');
      if (ia === null) return 1;
      if (ib === null) return -1;
      return ia - ib;
    };
  }
  return (a, b) => {
    const diferenca = (instante(b.createdAt) ?? 0) - (instante(a.createdAt) ?? 0);
    // Desempate estável pelo nome: sem ele, dois eventos criados no mesmo
    // instante trocam de lugar entre páginas e a pessoa vê o mesmo item duas
    // vezes, ou nenhuma.
    return diferenca !== 0 ? diferenca : a.name.localeCompare(b.name, 'pt-BR');
  };
}

function paraItem(evento: EventoDoCatalogo): ItemDoCatalogo {
  return {
    id: evento.id,
    nome: evento.name,
    slug: evento.slug,
    tipo: evento.eventType,
    organizacao: evento.organizationName,
    organizationId: evento.organizationId,
    situacao: evento.status,
    formato: evento.format,
    perfil: evento.profileCode,
    areas: [...new Set(evento.subjectAreas)],
    criadoEm: iso(evento.createdAt) ?? '',
    atualizadoEm: iso(evento.updatedAt) ?? '',
    inicio: iso(evento.startDate),
    fim: iso(evento.endDate),
    removido: evento.removido === true,
  };
}

/**
 * Monta o catálogo.
 *
 * A ordem das etapas é deliberada: remoção, depois recorte compartilhado,
 * depois busca, depois ordenação, depois página. A remoção vem primeiro porque
 * é a única que muda o que a pessoa PODE ver; as outras mudam o que ela pediu
 * para ver.
 *
 * `total` é contado DEPOIS de tudo e antes da página, então ele responde
 * "quantos atendem" e não "quantos esta página mostra". A diferença importa:
 * um catálogo que mostra 25 e diz total 25 quando existem 300 faz quem lê
 * concluir que acabou.
 */
export function montarCatalogo(
  eventos: readonly EventoDoCatalogo[],
  pedido: PedidoDoCatalogo,
): Catalogo {
  const visiveis = pedido.mostrarRemovidos
    ? eventos
    : eventos.filter((evento) => evento.removido !== true);

  // A MESMA função que a visão geral usa. É isto que impede o painel de dizer
  // um número e a lista de mostrar outro.
  //
  // Pelos ids em vez de um cast no retorno: `selecionarEventos` devolve
  // `EventoParaVisaoGeral[]`, e afirmar com `as` que são os do catálogo seria
  // o compilador acreditando em mim sem razão. Reconsultar por id custa um
  // `Set` e não pede confiança nenhuma.
  const idsNoRecorte = new Set(selecionarEventos(visiveis, pedido.filtro).map((evento) => evento.id));
  const noRecorte = visiveis.filter((evento) => idsNoRecorte.has(evento.id));

  const encontrados = pedido.termo === null
    ? noRecorte
    : noRecorte.filter((evento) => casaComTermo(evento, pedido.termo as string));

  const ordenados = [...encontrados].sort(comparar(pedido.ordem));

  const total = ordenados.length;
  const paginas = total === 0 ? 0 : Math.ceil(total / pedido.limite);
  const inicio = (pedido.pagina - 1) * pedido.limite;

  return {
    itens: ordenados.slice(inicio, inicio + pedido.limite).map(paraItem),
    total,
    pagina: pedido.pagina,
    limite: pedido.limite,
    paginas,
    ordem: pedido.ordem,
    termo: pedido.termo,
    mostrandoRemovidos: pedido.mostrarRemovidos,
  };
}
