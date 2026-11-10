/**
 * Decisão de autorização da Área Master (#665), em módulo sem dependências.
 *
 * Este arquivo responde UMA pergunta: "esta pessoa, nesta sessão, pode esta
 * ação neste alvo?". Ele não lê banco, não fala HTTP e não sabe o que é Nest —
 * por isso roda no harness de testes sem build, e por isso a regra pode ser
 * exercitada e mutada sem subir aplicação nenhuma.
 *
 * O que vive aqui é a política aprovada em #665 (inventário 6776449918 e
 * decisão Work 6777367560):
 *
 *  - Negar por padrão. Sem concessão vigente, sem segundo fator ou com ação
 *    fora do catálogo, a resposta é recusa. Nada é liberado por omissão.
 *  - Ação e escopo são INDEPENDENTES. Concessão global não dá todos os
 *    poderes: quem tem alcance global só de consulta não modera nada.
 *  - Escopo é REGRA, não lista. `GLOBAL` é avaliado no momento do pedido, então
 *    alcança evento criado depois da concessão, sem materializar id nenhum.
 *  - Só o proprietário administra equipe e poderes. Quem recebe concessão não
 *    concede, não amplia a própria e não delega.
 *  - Revogação e expiração valem na operação seguinte: aqui, concessão
 *    revogada ou expirada é concessão AUSENTE.
 *
 * O que NÃO vive aqui, de propósito: o código HTTP da recusa. A política diz o
 * motivo; o guard traduz. Isso mantém o contrato de não-enumeração (quem não é
 * Master recebe 404, não 403) sem espalhar a decisão por duas camadas.
 */

/** Ações que PODEM ser concedidas a um colaborador. Catálogo fechado. */
export const ACOES_CONCEDIVEIS = [
  'consultar',
  'auditar',
  'relatorios',
  'suporte',
  'suspender',
  'desbloquear',
  'excluir',
  'restaurar',
] as const;

export type AcaoConcedivel = (typeof ACOES_CONCEDIVEIS)[number];

/**
 * Ações que NUNCA são concedíveis: pertencem ao proprietário e a mais ninguém.
 *
 * Estão fora de `ACOES_CONCEDIVEIS` de propósito, não por esquecimento. É isso
 * que torna a autoelevação impossível por construção em vez de por checagem:
 * não existe concessão que case com `conceder`, porque `conceder` não está no
 * catálogo do que se concede.
 */
export const ACOES_DO_PROPRIETARIO = [
  'administrar_equipe',
  'conceder',
  'ampliar',
  'revogar',
] as const;

export type AcaoDoProprietario = (typeof ACOES_DO_PROPRIETARIO)[number];

/**
 * Moderação. Exige motivo escrito e verificação reforçada recente.
 *
 * Inclui `desbloquear` e `restaurar`, e não só o que destrói: desfazer uma
 * suspensão aplicada por infração é decisão de mesmo peso que aplicá-la. A
 * ordem pede "autenticação reforçada para ações sensíveis" e esta é a leitura
 * conservadora — exigir mais, nunca menos. Afrouxar depois é uma decisão de
 * uma linha; ter liberado sem exigir não se desfaz.
 */
export const ACOES_DE_MODERACAO = ['suspender', 'desbloquear', 'excluir', 'restaurar'] as const;

/** Quanto tempo uma sessão Master vale depois do segundo fator. */
export const JANELA_SEGUNDO_FATOR_MS = 12 * 60 * 60 * 1000;

/** Quanto tempo uma verificação reforçada autoriza ação sensível. */
export const JANELA_VERIFICACAO_REFORCADA_MS = 5 * 60 * 1000;

/** O que o pedido quer alcançar. */
export type Alvo =
  | { tipo: 'PLATAFORMA' }
  | { tipo: 'ORGANIZACAO'; organizationId: string }
  | { tipo: 'EVENTO'; eventId: string; organizationId: string };

/** O alcance de uma concessão. `GLOBAL` inclui o que ainda não existe. */
export type EscopoConcedido =
  | { tipo: 'GLOBAL' }
  | { tipo: 'ORGANIZACAO'; organizationId: string }
  | { tipo: 'EVENTO'; eventId: string };

/**
 * Uma linha de concessão como ela sai do banco.
 *
 * `acao` é `string` e não `AcaoConcedivel` de propósito: o banco pode conter
 * uma ação que o código não conhece mais — catálogo antigo, migração parcial,
 * linha escrita à mão. Tipar como união faria o compilador presumir que isso
 * não acontece, e o valor desconhecido passaria sem ninguém olhar. Aqui ele é
 * comparado contra o catálogo em tempo de execução e nega.
 */
export type Concessao = {
  acao: string;
  escopo: EscopoConcedido;
  revogadaEm?: Date | string | null;
  expiraEm?: Date | string | null;
};

/** Estado da sessão de quem pede. */
export type SessaoMaster = {
  proprietario: boolean;
  segundoFatorVerificadoEm?: Date | string | null;
  verificacaoReforcadaEm?: Date | string | null;
};

export type Pedido = {
  acao: string;
  alvo: Alvo;
  motivo?: string | null;
};

export type MotivoDeRecusa =
  | 'SEM_SEGUNDO_FATOR'
  | 'ACAO_DESCONHECIDA'
  | 'SOMENTE_PROPRIETARIO'
  | 'MOTIVO_OBRIGATORIO'
  | 'EXIGE_VERIFICACAO_RECENTE'
  | 'SEM_CONCESSAO'
  | 'FORA_DO_ESCOPO';

export type Decisao =
  | { permitido: true; porque: string }
  | { permitido: false; recusa: MotivoDeRecusa; porque: string };

const MOTIVO_MINIMO = 10;

function instante(valor: Date | string | null | undefined): number | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  const tempo = data.getTime();
  return Number.isNaN(tempo) ? null : tempo;
}

/** Recente = existe e está dentro da janela. Data inválida ou futura não serve. */
function recente(valor: Date | string | null | undefined, janelaMs: number, agora: number): boolean {
  const quando = instante(valor);
  if (quando === null) return false;
  if (quando > agora) return false;
  return agora - quando <= janelaMs;
}

export function ehAcaoConcedivel(acao: string): acao is AcaoConcedivel {
  return (ACOES_CONCEDIVEIS as readonly string[]).includes(acao);
}

export function ehAcaoDoProprietario(acao: string): acao is AcaoDoProprietario {
  return (ACOES_DO_PROPRIETARIO as readonly string[]).includes(acao);
}

export function ehModeracao(acao: string): boolean {
  return (ACOES_DE_MODERACAO as readonly string[]).includes(acao);
}

/**
 * Uma concessão vale agora?
 *
 * Revogada ou expirada é tratada como ausente, e não como "presente mas
 * inválida": o resto da decisão nunca precisa se lembrar de checar de novo.
 */
export function concessaoVigente(concessao: Concessao, agora: number): boolean {
  if (instante(concessao.revogadaEm) !== null) return false;
  const expira = instante(concessao.expiraEm);
  if (expira !== null && expira <= agora) return false;
  return true;
}

/**
 * O escopo concedido alcança este alvo?
 *
 * `GLOBAL` alcança qualquer alvo, inclusive evento que não existia quando a
 * concessão foi gravada — é exatamente por isso que escopo é regra avaliada
 * aqui, e não lista de ids materializada na escrita.
 *
 * Escopo de organização alcança os eventos DELA, e escopo de evento alcança só
 * aquele evento. Nenhum dos dois alcança o alvo `PLATAFORMA`: a visão geral da
 * plataforma não é consequência de cuidar de um evento.
 */
export function escopoAlcanca(escopo: EscopoConcedido, alvo: Alvo): boolean {
  if (escopo.tipo === 'GLOBAL') return true;

  if (escopo.tipo === 'ORGANIZACAO') {
    if (alvo.tipo === 'ORGANIZACAO') return alvo.organizationId === escopo.organizationId;
    if (alvo.tipo === 'EVENTO') return alvo.organizationId === escopo.organizationId;
    return false;
  }

  return alvo.tipo === 'EVENTO' && alvo.eventId === escopo.eventId;
}

/**
 * A decisão.
 *
 * A ordem das checagens é deliberada: o segundo fator vem antes de tudo,
 * inclusive antes de saber se a ação existe. Responder "ação desconhecida" a
 * quem nem passou pelo segundo fator entregaria o catálogo da Área Master a
 * quem não deveria sequer saber que ela existe.
 */
export function decidir(
  sessao: SessaoMaster,
  concessoes: readonly Concessao[],
  pedido: Pedido,
  agora: number = Date.now(),
): Decisao {
  if (!recente(sessao.segundoFatorVerificadoEm, JANELA_SEGUNDO_FATOR_MS, agora)) {
    return {
      permitido: false,
      recusa: 'SEM_SEGUNDO_FATOR',
      porque: 'A Área Master exige sessão com segundo fator verificado.',
    };
  }

  const concedivel = ehAcaoConcedivel(pedido.acao);
  const doProprietario = ehAcaoDoProprietario(pedido.acao);

  if (!concedivel && !doProprietario) {
    return {
      permitido: false,
      recusa: 'ACAO_DESCONHECIDA',
      porque: `A ação "${pedido.acao}" não existe no catálogo da Área Master.`,
    };
  }

  if (doProprietario && !sessao.proprietario) {
    return {
      permitido: false,
      recusa: 'SOMENTE_PROPRIETARIO',
      porque: 'Administrar equipe e poderes é exclusivo do proprietário.',
    };
  }

  const sensivel = doProprietario || ehModeracao(pedido.acao);

  if (ehModeracao(pedido.acao) && (pedido.motivo ?? '').trim().length < MOTIVO_MINIMO) {
    return {
      permitido: false,
      recusa: 'MOTIVO_OBRIGATORIO',
      porque: `Moderar exige motivo escrito com ao menos ${MOTIVO_MINIMO} caracteres.`,
    };
  }

  if (sensivel && !recente(sessao.verificacaoReforcadaEm, JANELA_VERIFICACAO_REFORCADA_MS, agora)) {
    return {
      permitido: false,
      recusa: 'EXIGE_VERIFICACAO_RECENTE',
      porque: 'Esta ação exige verificação reforçada recente.',
    };
  }

  // O proprietário não depende de concessão: ele é a origem delas.
  if (sessao.proprietario) {
    return { permitido: true, porque: 'Proprietário da plataforma.' };
  }

  const vigentes = concessoes.filter((concessao) => concessaoVigente(concessao, agora));
  const daAcao = vigentes.filter((concessao) => concessao.acao === pedido.acao);

  if (daAcao.length === 0) {
    return {
      permitido: false,
      recusa: 'SEM_CONCESSAO',
      porque: `Nenhuma concessão vigente de "${pedido.acao}".`,
    };
  }

  if (!daAcao.some((concessao) => escopoAlcanca(concessao.escopo, pedido.alvo))) {
    return {
      permitido: false,
      recusa: 'FORA_DO_ESCOPO',
      porque: `A concessão de "${pedido.acao}" não alcança este alvo.`,
    };
  }

  return { permitido: true, porque: `Concessão vigente de "${pedido.acao}" alcança o alvo.` };
}

/**
 * Os poderes efetivos de alguém, para a tela de revisão que a ordem pede.
 *
 * Deriva do MESMO `decidir`, com um alvo de prova, em vez de reimplementar a
 * regra para exibição. Resumo que calcula a permissão por conta própria é
 * resumo que um dia discorda da permissão real — e aí a tela promete o que o
 * servidor nega, ou esconde o que ele permite.
 */
export function poderesEfetivos(
  sessao: SessaoMaster,
  concessoes: readonly Concessao[],
  alvo: Alvo,
  agora: number = Date.now(),
): AcaoConcedivel[] {
  return ACOES_CONCEDIVEIS.filter((acao) => decidir(
    {
      ...sessao,
      // A revisão de poderes responde "o que esta pessoa pode", não "o que ela
      // poderia agora mesmo nesta sessão": sem neutralizar as janelas, toda
      // ação sensível apareceria como negada só porque ninguém acabou de
      // reverificar, e o proprietário leria a lista errada.
      segundoFatorVerificadoEm: new Date(agora),
      verificacaoReforcadaEm: new Date(agora),
    },
    concessoes,
    { acao, alvo, motivo: 'revisao de poderes efetivos' },
    agora,
  ).permitido);
}
