/**
 * A jornada do operador restrito, montada a partir do que o SERVIDOR respondeu
 * em `GET /events/:eventId/operators/me/capabilities` (CL02 / CL-R2.2).
 *
 * Fica em arquivo próprio, sem React, porque um `.tsx` não pode ser importado
 * por teste neste ambiente — e porque é aqui que uma mentira de interface se
 * esconderia: dizer que a pessoa pode algo que o servidor recusa, ou esconder
 * algo que ela pode.
 *
 * NÃO É CONTROLE DE ACESSO. Cada operação continua autorizada no servidor
 * quando for executada. Esconder botão nunca foi autorização; o que esta
 * camada faz é não mentir para quem está no balcão.
 *
 * A tabela de rótulos entra por PARÂMETRO, em vez de ser importada. Duas
 * razões: o módulo fica sem dependência nenhuma, portanto executável em teste
 * sem resolver caminho de irmão; e a interface segue com uma única fonte de
 * rótulo, `operator-capability-diff`, em vez de uma cópia aqui.
 */


/** Forma exata da resposta da rota de autoatendimento. */
export interface ItemPermitido {
  readonly acao: string;
  readonly capacidade: string | null;
  readonly sensivel: boolean;
}

export interface RespostaDeCapacidades {
  readonly escopado: boolean;
  readonly papel: string;
  readonly acoes: readonly ItemPermitido[];
}

export interface EntradaDaJornada {
  readonly acao: string;
  readonly rotulo: string;
  readonly permitida: boolean;
  /** Desfaz ou altera registro já gravado. Só vem do servidor, nunca inferido. */
  readonly sensivel: boolean;
}

export interface GrupoDaJornada {
  readonly area: AreaDoBalcao;
  readonly titulo: string;
  readonly entradas: readonly EntradaDaJornada[];
}

export interface Jornada {
  readonly grupos: readonly GrupoDaJornada[];
  readonly permitidas: number;
  readonly total: number;
  /** Há pelo menos uma ação permitida, logo abrir o posto faz sentido. */
  readonly podeAbrirPosto: boolean;
  /**
   * Único aviso a exibir, ou null. Ordem de precedência deliberada: o aviso de
   * evento não escopado vem ANTES do de lista vazia, porque num evento não
   * escopado a lista nunca está vazia e dizer "você não tem permissão" ali
   * seria falso.
   */
  readonly aviso: Aviso | null;
}

export type Aviso =
  | { readonly tipo: 'evento_sem_escopo'; readonly texto: string }
  | { readonly tipo: 'sem_permissao'; readonly texto: string }
  | { readonly tipo: 'papel_sem_balcao'; readonly texto: string };

/**
 * Papéis que chegam ao balcão. Serve só para a tela explicar POR QUE a lista
 * está vazia — a decisão continua sendo do servidor, que é quem nega.
 */
const PAPEIS_DE_BALCAO = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'];

export const AREAS = ['credenciamento', 'acesso', 'material', 'inscricao', 'relatorios', 'outras'] as const;
export type AreaDoBalcao = (typeof AREAS)[number];

const TITULOS: Record<AreaDoBalcao, string> = {
  credenciamento: 'Credenciamento',
  acesso: 'Controle de acesso',
  material: 'Material e kits',
  inscricao: 'Inscrições',
  relatorios: 'Relatórios',
  outras: 'Outras ações',
};

/**
 * Em que parte do balcão cada ação acontece. É organização de TELA, não regra:
 * a regra é do servidor. Toda ação com rótulo tem de ter área — há teste —, e
 * ação desconhecida cai em `outras` em vez de desaparecer, pela mesma razão
 * que `rotulo()` mostra o código quando não há texto: some do olho é pior que
 * aparecer feio.
 */
const AREA_DA_ACAO: Record<string, AreaDoBalcao> = {
  buscar: 'credenciamento',
  checkin: 'credenciamento',
  checkin_reverter: 'credenciamento',
  credencial_imprimir: 'credenciamento',
  credencial_reimprimir: 'credenciamento',
  presenca_dia: 'acesso',
  presenca_dia_reverter: 'acesso',
  atividade_acesso: 'acesso',
  material_entregar: 'material',
  material_reverter: 'material',
  kit_ler: 'material',
  kit_relatorio: 'material',
  inscricao_criar: 'inscricao',
  inscricao_ler: 'inscricao',
  inscricao_corrigir: 'inscricao',
  relatorio: 'relatorios',
  sorteio: 'relatorios',
};

export function areaDaAcao(acao: string): AreaDoBalcao {
  return AREA_DA_ACAO[acao] ?? 'outras';
}

/**
 * Rota relativa do posto, onde estas ações são executadas de fato.
 *
 * Uma só, de propósito: é a única publicada hoje. Inventar uma rota por ação
 * seria prometer tela que não existe, e a ordem é explícita em não fazer isso.
 */
export function rotaDoPosto(eventId: string): string {
  return `/eventos/${encodeURIComponent(eventId)}/painel/check-in`;
}

/**
 * Monta a jornada. `permitidas` sai do servidor; o resto do catálogo entra
 * como indisponível, para a pessoa ver que a ação existe e que não é dela —
 * em vez de descobrir com um 403 no meio do atendimento.
 */
export function jornadaDoOperador(
  resposta: RespostaDeCapacidades,
  rotulos: Readonly<Record<string, string>>,
): Jornada {
  const permitidasPorAcao = new Map<string, ItemPermitido>();
  for (const item of resposta.acoes ?? []) {
    if (item && typeof item.acao === 'string' && item.acao !== '') permitidasPorAcao.set(item.acao, item);
  }

  // O universo é o catálogo de rótulos da interface MAIS o que o servidor
  // mandou. A segunda parte importa: se o servidor conhecer ação que esta
  // interface ainda não rotula, ela aparece pelo código, permitida, em vez de
  // ficar invisível para quem a tem.
  const universo = new Set<string>([...Object.keys(rotulos), ...permitidasPorAcao.keys()]);

  const porArea = new Map<AreaDoBalcao, EntradaDaJornada[]>();
  for (const acao of [...universo].sort()) {
    const permitida = permitidasPorAcao.get(acao);
    const entrada: EntradaDaJornada = {
      acao,
      rotulo: rotulos[acao] ?? acao,
      permitida: Boolean(permitida),
      sensivel: permitida ? permitida.sensivel === true : false,
    };
    const area = areaDaAcao(acao);
    porArea.set(area, [...(porArea.get(area) ?? []), entrada]);
  }

  const grupos: GrupoDaJornada[] = AREAS.filter((area) => (porArea.get(area) ?? []).length > 0).map((area) => ({
    area,
    titulo: TITULOS[area],
    entradas: porArea.get(area) ?? [],
  }));

  const permitidas = permitidasPorAcao.size;
  return {
    grupos,
    permitidas,
    total: universo.size,
    podeAbrirPosto: permitidas > 0,
    aviso: avisoDa(resposta, permitidas),
  };
}

function avisoDa(resposta: RespostaDeCapacidades, permitidas: number): Aviso | null {
  if (!resposta.escopado) {
    return {
      tipo: 'evento_sem_escopo',
      texto:
        'Este evento ainda não exige permissão por pessoa. A lista abaixo é o que o balcão libera hoje para '
        + 'qualquer operador da organização, não uma permissão concedida a você.',
    };
  }
  if (permitidas > 0) return null;
  if (!PAPEIS_DE_BALCAO.includes(resposta.papel)) {
    return {
      tipo: 'papel_sem_balcao',
      texto:
        'Seu papel na organização não dá acesso ao balcão deste evento. Conceder permissões não mudaria isso: '
        + 'quem precisa ajustar é quem administra a organização.',
    };
  }
  return {
    tipo: 'sem_permissao',
    texto:
      'Você ainda não tem nenhuma permissão neste evento. Peça ao organizador do evento as ações de que precisa; '
      + 'cada uma vale só aqui.',
  };
}
