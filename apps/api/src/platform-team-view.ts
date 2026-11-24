/**
 * Modelo de leitura da equipe da Área Master (#665).
 *
 * Responde "quem tem o quê nesta plataforma", que é a pergunta que a área não
 * sabia responder. Há rota para conceder, revisar e revogar; não havia nenhuma
 * para LER o estado das delegações — e um sistema em que se concede e revoga
 * sem poder ver não é operável: o proprietário não sabe o que revogar, e o
 * colaborador não sabe o que pode.
 *
 * Módulo puro: sem Prisma, sem Nest, sem I/O. Recebe linhas e devolve a visão.
 *
 * A diferença entre AUTORIZAR e MOSTRAR organiza o arquivo inteiro
 * -----------------------------------------------------------------
 * `platform-grant-policy.decidir` responde se uma ação pode acontecer, e para
 * isso trata concessão expirada como AUSENTE — está certo, e é o que faz uma
 * expiração valer na operação seguinte sem ninguém limpar nada.
 *
 * Aqui a pergunta é outra. Quem lê precisa entender o estado, e para isso o
 * que está ausente é pior que o que está vencido: uma lista que esconde a
 * concessão expirada mostra uma pessoa sem acesso e não diz por quê, e a
 * conclusão natural de quem olha é "o sistema perdeu a concessão".
 *
 * Então a regra deste módulo é o oposto da regra do autorizador, de propósito:
 * **nada é escondido; tudo é rótulado.** O que não dá para rótular é contado,
 * nunca descartado em silêncio — ver `linhasDescartadas`.
 */

/** Alcance como a leitura o apresenta. */
export type Alcance =
  | { readonly tipo: 'GLOBAL' }
  | { readonly tipo: 'ORGANIZACAO'; readonly organizationId: string }
  | { readonly tipo: 'EVENTO'; readonly eventId: string }
  /**
   * Valor de `scopeKind` que este modelo não reconhece.
   *
   * Existe por uma razão de segurança, e não por completude de tipo. O
   * repositório hoje converte qualquer `scopeKind` desconhecido em `GLOBAL` —
   * o alcance mais largo —, o que é fail-open num campo de alcance: basta
   * alguem acrescentar um valor ao enum para toda concessão daquele tipo passar
   * a valer na plataforma inteira, em silêncio.
   *
   * A separação correta tem dois lados, e nenhum deles é converter: quem
   * AUTORIZA descarta o que não entende, e quem LÊ mostra como desconhecido,
   * para que a linha estranha apareça para um humano em vez de virar poder.
   */
  | { readonly tipo: 'DESCONHECIDO'; readonly bruto: string };

/** Uma linha de `PlatformGrant`, como o banco a devolve. */
export interface ConcessaoAtual {
  readonly targetUserId: unknown;
  readonly action: unknown;
  readonly scopeKind: unknown;
  readonly organizationId?: unknown;
  readonly eventId?: unknown;
  readonly grantedByUserId?: unknown;
  readonly grantedAt?: unknown;
  readonly expiresAt?: unknown;
}

/** Uma linha de `PlatformGrantEvent`: o histórico de mudanças de acesso. */
export interface MudancaDeAcesso {
  readonly targetUserId: unknown;
  readonly kind: unknown;
  readonly action: unknown;
  readonly actorUserId?: unknown;
  readonly occurredAt?: unknown;
}

/** Pessoa, para que a lista mostre nome em vez de id. */
export interface Pessoa {
  readonly id: unknown;
  readonly name?: unknown;
  readonly email?: unknown;
}

export type SituacaoDoAcesso = 'VIGENTE' | 'EXPIRADA';

export interface AcessoDaPessoa {
  readonly acao: string;
  readonly alcance: Alcance;
  readonly concedidoEm: string | null;
  readonly expiraEm: string | null;
  readonly situacao: SituacaoDoAcesso;
}

export interface UltimaMudanca {
  readonly acao: string;
  readonly tipo: 'CONCEDIDA' | 'REVOGADA' | 'DESCONHECIDA';
  readonly quando: string | null;
  readonly porQuem: string;
}

export interface LinhaDaEquipe {
  readonly userId: string;
  /** `null` quando não há registro de usuário para o id. */
  readonly nome: string | null;
  readonly email: string | null;
  readonly acessos: readonly AcessoDaPessoa[];
  readonly vigentes: number;
  readonly expiradas: number;
  /** Tem histórico e nenhuma concessão vigente agora. */
  readonly semAcessoAgora: boolean;
  readonly ultimaMudanca: UltimaMudanca | null;
}

export interface VisaoDaEquipe {
  readonly pessoas: readonly LinhaDaEquipe[];
  /** Quantas linhas carregam id sem registro de usuário correspondente. */
  readonly semIdentificacao: number;
  /** Quantas concessões trazem alcance que o modelo não reconhece. */
  readonly comAlcanceDesconhecido: number;
  /**
   * Linhas que não deu para ler — sem pessoa ou sem ação utilizável.
   *
   * Elas são descartadas, e isso é deliberado: um identificador que não é texto
   * não pode ser coagido com `String(v)`, porque `String({})` devolve
   * `'[object Object]'` e uma linha estragada viraria uma PESSOA FANTASMA com
   * identificador plausível numa lista administrativa. Fabricar identidade é
   * pior que descartar.
   *
   * Mas descartar em SILÊNCIO seria o defeito que este módulo existe para não
   * ter. Por isso são contadas: quem lê vê que havia linhas ilegíveis e pode ir
   * ao banco olhar, em vez de concluir que a lista está completa.
   */
  readonly linhasDescartadas: number;
}

/**
 * Só texto é texto.
 *
 * Não coage com `String(v)` de propósito — ver `linhasDescartadas`. Os
 * identificadores deste domínio são `String` no schema; não há id numérico
 * autoincremental neste banco, e se um dia houver, o reparo é no mapeamento do
 * repositório, não numa coerção que aceita qualquer coisa.
 */
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Instante a partir de `Date`, número (epoch em milissegundos) ou texto ISO.
 *
 * O ramo numérico veio da revisão: `new Date("1700000000000")` é `Invalid Date`,
 * então epoch em número viraria ilegível.
 *
 * String puramente numérica NÃO é tratada como epoch, e a recusa é deliberada:
 * `'20261120'` é ambigua — como epoch em milissegundos dá 20 de janeiro de
 * 1970, e como data dá 20 de novembro de 2026. Para texto, a interpretação ISO
 * é a única que não adivinha. Quem tiver epoch, passe número.
 */
function instante(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const data = valor instanceof Date ? valor : new Date(String(valor));
  const tempo = data.getTime();
  return Number.isNaN(tempo) ? null : tempo;
}

const iso = (valor: unknown): string | null => {
  const tempo = instante(valor);
  return tempo === null ? null : new Date(tempo).toISOString();
};

/**
 * Traduz `scopeKind` para alcance, SEM conversão de conveniência.
 *
 * O valor desconhecido vira `DESCONHECIDO` e carrega o bruto, para que quem
 * olhar saiba o que apareceu no banco. Converter para GLOBAL seria dar o
 * alcance mais largo a uma linha que ninguém entende.
 */
export function alcanceDaLinha(linha: ConcessaoAtual): Alcance {
  const tipo = texto(linha.scopeKind);
  if (tipo === 'GLOBAL') return { tipo: 'GLOBAL' };
  if (tipo === 'ORGANIZACAO') return { tipo: 'ORGANIZACAO', organizationId: texto(linha.organizationId) };
  if (tipo === 'EVENTO') return { tipo: 'EVENTO', eventId: texto(linha.eventId) };
  return { tipo: 'DESCONHECIDO', bruto: tipo };
}

/**
 * Vigente ou expirada — e nunca omitida.
 *
 * Sem prazo significa "vale até revogar", e por isso é vigente. Prazo
 * ilegível é tratado como vencido: na dúvida, a leitura mostra o estado menos
 * favorável, para que ninguém conte com um acesso que o autorizador pode
 * recusar.
 */
export function situacaoDoAcesso(expiresAt: unknown, agora: number): SituacaoDoAcesso {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') return 'VIGENTE';
  const expira = instante(expiresAt);
  if (expira === null) return 'EXPIRADA';
  return expira > agora ? 'VIGENTE' : 'EXPIRADA';
}

const TIPO_DA_MUDANCA: Record<string, UltimaMudanca['tipo']> = {
  GRANTED: 'CONCEDIDA',
  REVOKED: 'REVOGADA',
};

/**
 * Monta a visão da equipe.
 *
 * As pessoas que aparecem são a UNIÃO de quem tem concessão agora e de quem
 * aparece no histórico. A segunda metade é o que torna a lista honesta:
 * `PlatformGrant` não tem coluna de revogação, então revogar APAGA a linha, e
 * sem o histórico quem perdeu acesso simplesmente desaparece — indistinguível
 * de quem nunca teve.
 *
 * Pessoa sem registro de usuário também aparece, com nome e e-mail nulos. Pode
 * acontecer se a conta foi apagada e a concessão ficou; omitir esconderia um
 * acesso que o autorizador ainda honra.
 */
export function montarVisaoDaEquipe(
  concessoes: readonly ConcessaoAtual[],
  historico: readonly MudancaDeAcesso[],
  pessoas: readonly Pessoa[],
  agora: number = Date.now(),
): VisaoDaEquipe {
  const porId = new Map<string, Pessoa>();
  for (const pessoa of pessoas) {
    const id = texto(pessoa.id);
    if (id !== '') porId.set(id, pessoa);
  }

  const acessosPorPessoa = new Map<string, AcessoDaPessoa[]>();
  let comAlcanceDesconhecido = 0;
  let linhasDescartadas = 0;

  for (const linha of concessoes) {
    const userId = texto(linha.targetUserId);
    const acao = texto(linha.action);
    if (userId === '' || acao === '') {
      linhasDescartadas += 1;
      continue;
    }
    const alcance = alcanceDaLinha(linha);
    if (alcance.tipo === 'DESCONHECIDO') comAlcanceDesconhecido += 1;
    const lista = acessosPorPessoa.get(userId) ?? [];
    lista.push({
      acao,
      alcance,
      concedidoEm: iso(linha.grantedAt),
      expiraEm: iso(linha.expiresAt),
      situacao: situacaoDoAcesso(linha.expiresAt, agora),
    });
    acessosPorPessoa.set(userId, lista);
  }

  // A mudança mais recente por pessoa. O histórico pode vir em qualquer ordem,
  // então a comparação é por instante e não por posição na lista.
  const ultimaPorPessoa = new Map<string, { quando: number; mudanca: UltimaMudanca }>();
  for (const linha of historico) {
    const userId = texto(linha.targetUserId);
    if (userId === '') {
      linhasDescartadas += 1;
      continue;
    }
    const quando = instante(linha.occurredAt) ?? 0;
    const atual = ultimaPorPessoa.get(userId);
    if (atual !== undefined && atual.quando >= quando) continue;
    ultimaPorPessoa.set(userId, {
      quando,
      mudanca: {
        acao: texto(linha.action),
        tipo: TIPO_DA_MUDANCA[texto(linha.kind)] ?? 'DESCONHECIDA',
        quando: iso(linha.occurredAt),
        porQuem: texto(linha.actorUserId),
      },
    });
  }

  const ids = new Set<string>([...acessosPorPessoa.keys(), ...ultimaPorPessoa.keys()]);
  let semIdentificacao = 0;

  const linhas: LinhaDaEquipe[] = [];
  for (const userId of ids) {
    const pessoa = porId.get(userId);
    if (pessoa === undefined) semIdentificacao += 1;
    const acessos = acessosPorPessoa.get(userId) ?? [];
    const vigentes = acessos.filter((acesso) => acesso.situacao === 'VIGENTE').length;
    linhas.push({
      userId,
      nome: pessoa === undefined ? null : (texto(pessoa.name) || null),
      email: pessoa === undefined ? null : (texto(pessoa.email) || null),
      acessos: ordenarAcessos(acessos),
      vigentes,
      expiradas: acessos.length - vigentes,
      semAcessoAgora: vigentes === 0,
      ultimaMudanca: ultimaPorPessoa.get(userId)?.mudanca ?? null,
    });
  }

  return {
    pessoas: ordenarPessoas(linhas),
    semIdentificacao,
    comAlcanceDesconhecido,
    linhasDescartadas,
  };
}

/**
 * Ordem determinística: nome, e-mail, id.
 *
 * Lista administrativa que muda de ordem entre duas leituras impede comparar —
 * e comparar é o que quem audita faz. O id entra como último critério porque
 * é o único sempre presente, então o desempate nunca fica a cargo da ordem em
 * que o banco devolveu.
 *
 * `localeCompare` e não `<`, por apontamento da revisão: comparação por code
 * point coloca `Ávila` depois de `Bruno`, porque `Á` é 193 e `B` é 66. Em
 * português isso é simplesmente errado.
 *
 * `sensitivity: 'accent'` é escolha, não padrão. O padrão `variant` distingue
 * caixa, e aí `ana` e `Ana` ficam em posições diferentes numa lista de pessoas.
 * `base` iria ao outro extremo e trataria `a` e `á` como iguais — e a ordem
 * entre Ana e Ána passaria a depender da ordem de entrada, quebrando o
 * determinismo que esta função existe para garantir. `accent` é o único dos
 * três que dá insensível a caixa e sensível a acento.
 */
function ordenarPessoas(linhas: readonly LinhaDaEquipe[]): LinhaDaEquipe[] {
  return [...linhas].sort((a, b) => {
    const chaveA = a.nome ?? a.email ?? a.userId;
    const chaveB = b.nome ?? b.email ?? b.userId;
    const comparacao = chaveA.localeCompare(chaveB, 'pt-BR', { sensitivity: 'accent' });
    if (comparacao !== 0) return comparacao;
    // Desempate pelo id: é ASCII e sempre presente, então aqui `<` basta e não
    // depende de ICU.
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
}

/**
 * Vigentes antes das expiradas, e dentro de cada grupo por ação.
 *
 * Aqui `<` basta: as ações vêm de `ACOES_CONCEDIVEIS`, que é catálogo fechado e
 * só tem ASCII minúsculo. Não há acento para colar errado.
 */
function ordenarAcessos(acessos: readonly AcessoDaPessoa[]): AcessoDaPessoa[] {
  return [...acessos].sort((a, b) => {
    if (a.situacao !== b.situacao) return a.situacao === 'VIGENTE' ? -1 : 1;
    if (a.acao !== b.acao) return a.acao < b.acao ? -1 : 1;
    return a.alcance.tipo < b.alcance.tipo ? -1 : a.alcance.tipo > b.alcance.tipo ? 1 : 0;
  });
}
