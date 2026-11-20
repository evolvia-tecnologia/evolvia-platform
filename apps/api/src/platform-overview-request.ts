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
 * Nomes dos campos do corpo, numa fonte só, iguais aos do `VisaoGeralDto`.
 *
 * Como constante, um nome digitado errado não compila. Espalhado em literais,
 * produziria `field` que a tela tenta destacar e não encontra — destaque que
 * cai no vazio, em silêncio.
 */
export const CAMPOS = {
  corpo: '',
  de: 'de',
  ate: 'ate',
  campoDoPeriodo: 'campoDoPeriodo',
  organizationIds: 'organizationIds',
  profileCodes: 'profileCodes',
  areas: 'areas',
  formatos: 'formatos',
  situacoes: 'situacoes',
} as const;

/** Problema com o campo que o formulário deve destacar. */
export type ProblemaDoFiltro = {
  readonly campo: string;
  readonly mensagem: string;
};

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
  | {
    ok: false;
    /** Problemas com o campo recusado. Fonte única. */
    problemas: ProblemaDoFiltro[];
    /** As mesmas mensagens, sem o campo. Derivado de `problemas`, nunca mantido em paralelo. */
    erros: string[];
  };

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

/** Dimensão: `campo` é o que a tela destaca, `nome` é o que a pessoa lê. */
type Dimensao = { readonly campo: string; readonly nome: string };

function lerLista(
  bruto: unknown,
  dimensao: Dimensao,
  ler: (valor: unknown) => string | null,
  problemas: ProblemaDoFiltro[],
): string[] {
  if (bruto === undefined || bruto === null) return [];
  if (!Array.isArray(bruto)) {
    problemas.push({ campo: dimensao.campo, mensagem: `O filtro de ${dimensao.nome} precisa ser uma lista.` });
    return [];
  }
  if (bruto.length > MAX_POR_DIMENSAO) {
    problemas.push({ campo: dimensao.campo, mensagem: `Escolha no máximo ${MAX_POR_DIMENSAO} itens em ${dimensao.nome}.` });
    return [];
  }
  const lidos = bruto.map(ler);
  if (lidos.some((item) => item === null)) {
    problemas.push({ campo: dimensao.campo, mensagem: `Há valor inválido no filtro de ${dimensao.nome}.` });
    return [];
  }
  return unicos(lidos as string[]);
}

function lerCatalogo<T extends string>(
  bruto: unknown,
  dimensao: Dimensao,
  catalogo: readonly T[],
  problemas: ProblemaDoFiltro[],
): T[] {
  return lerLista(
    bruto, dimensao,
    (valor) => (typeof valor === 'string' && (catalogo as readonly string[]).includes(valor.trim()) ? valor.trim() : null),
    problemas,
  ) as T[];
}

function lerData(bruto: unknown, campo: string, nome: string, problemas: ProblemaDoFiltro[]): string | null {
  if (bruto === undefined || bruto === null || bruto === '') return null;
  if (typeof bruto !== 'string') {
    problemas.push({ campo, mensagem: `A data ${nome} não é válida.` });
    return null;
  }
  const quando = new Date(bruto).getTime();
  if (Number.isNaN(quando)) {
    problemas.push({ campo, mensagem: `A data ${nome} não é válida.` });
    return null;
  }
  return new Date(quando).toISOString();
}

/** Uma recusa, com `erros` derivado de `problemas` em vez de repetido. */
const recusar = (problemas: readonly ProblemaDoFiltro[]): LeituraDoFiltro => ({
  ok: false,
  problemas: [...problemas],
  erros: problemas.map((problema) => problema.mensagem),
});

/**
 * Lê o filtro e acumula TODOS os problemas.
 *
 * Acumular em vez de parar no primeiro: quem monta um recorte com período,
 * organização, perfil, área e formato quer saber dos cinco de uma vez.
 *
 * Cada problema sai com o CAMPO a que pertence. Antes saía só a frase, e o
 * contrato de erro ia com `field` vazio: num recorte com cinco problemas, a
 * pessoa tinha de deduzir sozinha a qual dimensão cada frase se referia.
 */
export function validarFiltroDaVisaoGeral(corpo: unknown): LeituraDoFiltro {
  const problemas: ProblemaDoFiltro[] = [];
  if (corpo !== undefined && corpo !== null && (typeof corpo !== 'object' || Array.isArray(corpo))) {
    // Corpo inteiro inválido não tem campo: o problema não é de uma dimensão.
    return recusar([{ campo: CAMPOS.corpo, mensagem: 'Filtro inválido.' }]);
  }
  const bruto = (corpo ?? {}) as Record<string, unknown>;

  const de = lerData(bruto.de, CAMPOS.de, 'inicial', problemas);
  const ate = lerData(bruto.ate, CAMPOS.ate, 'final', problemas);
  if (de && ate && new Date(de).getTime() > new Date(ate).getTime()) {
    // Atribuído à data inicial, e não ao par: é ela que a mensagem acusa de
    // estar depois da final, e destacar os dois campos faria a pessoa procurar
    // o erro em dois lugares quando só um precisa mudar.
    problemas.push({ campo: CAMPOS.de, mensagem: 'A data inicial do período é posterior à final.' });
  }

  let campoDoPeriodo: CampoDoPeriodo = 'createdAt';
  if (bruto.campoDoPeriodo !== undefined && bruto.campoDoPeriodo !== null) {
    if (typeof bruto.campoDoPeriodo !== 'string' || !(CAMPOS_DO_PERIODO as readonly string[]).includes(bruto.campoDoPeriodo)) {
      problemas.push({
        campo: CAMPOS.campoDoPeriodo,
        mensagem: 'O período pode ser contado pela criação ou pela data de início do evento.',
      });
    } else {
      campoDoPeriodo = bruto.campoDoPeriodo as CampoDoPeriodo;
    }
  }

  const organizationIds = lerLista(bruto.organizationIds, { campo: CAMPOS.organizationIds, nome: 'organizações' }, identificador, problemas);
  const areas = lerLista(bruto.areas, { campo: CAMPOS.areas, nome: 'áreas' }, area, problemas);
  const profileCodes = lerCatalogo(bruto.profileCodes, { campo: CAMPOS.profileCodes, nome: 'perfis' }, PERFIS, problemas);
  const formatos = lerCatalogo(bruto.formatos, { campo: CAMPOS.formatos, nome: 'formatos' }, FORMATOS, problemas);
  const situacoes = lerCatalogo(bruto.situacoes, { campo: CAMPOS.situacoes, nome: 'situações' }, SITUACOES, problemas);

  if (problemas.length > 0) return recusar(problemas);
  return { ok: true, filtro: { de, ate, campoDoPeriodo, organizationIds, profileCodes, areas, formatos, situacoes } };
}
