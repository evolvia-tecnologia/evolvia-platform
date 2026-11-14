/**
 * Transições de moderação de evento pela Área Master (#665).
 *
 * `platform-grant-policy.ts` decide **quem pode**. Este arquivo decide **se a
 * transição é legal** — e são perguntas diferentes: o proprietário pode
 * suspender, e ainda assim suspender um evento já cancelado não faz sentido.
 * Sem esta separação, a permissão viraria a única guarda e a Área Master
 * poderia levar um evento a um estado que o resto da plataforma não sabe ler.
 *
 * Sem dependência nenhuma. Roda sem build.
 *
 * ---
 *
 * **Por que existe `PlatformEventModeration`, e por que ela é necessária.**
 *
 * Li o schema aplicado antes de desenhar. `Event` tem `status EventStatus` e
 * NENHUM campo de exclusão, arquivamento ou histórico de situação. Isso torna
 * duas das quatro ações impossíveis como estão:
 *
 *  - **desbloquear** não tem para onde voltar. Suspender sobrescreve `status`,
 *    e a situação anterior desaparece. Voltar sempre para `DRAFT` despublicaria
 *    um evento que estava no ar; voltar sempre para `PUBLISHED` publicaria um
 *    que nunca esteve. As duas opções são erradas, e erradas de formas que o
 *    organizador descobre pelos participantes.
 *  - **exclusão lógica** não tem campo. Usar `CANCELLED` confundiria a remoção
 *    pela plataforma com o cancelamento feito pelo organizador — e cancelamento
 *    tem consequência visível para o participante, incluindo reembolso. São
 *    fatos diferentes e não podem compartilhar a mesma coluna.
 *
 * A tabela guarda a situação anterior e as marcas de suspensão e remoção, e
 * fica em `platform-master.prisma`, que é meu. `Event.status` continua sendo a
 * única coluna compartilhada que a moderação escreve — e ela PRECISA ser
 * escrita, porque uma suspensão que só a Área Master enxerga não é suspensão.
 *
 * **Exclusão física não é oferecida, e isso é decisão e não omissão.** `Event`
 * tem dezenas de relações, várias com `onDelete: Restrict` — inscrições,
 * certificados, pedidos, check-ins. Um `DELETE` ou falharia no banco ou
 * arrastaria consigo o histórico de pessoas que não têm nada a ver com o motivo
 * da remoção. Quem administra a plataforma não deve ter esse botão.
 */

export const SITUACOES = [
  'DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH',
  'PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED',
] as const;

export type Situacao = (typeof SITUACOES)[number];

export const ACOES_DE_MODERACAO_DE_EVENTO = ['suspender', 'desbloquear', 'excluir', 'restaurar'] as const;
export type AcaoDeModeracaoDeEvento = (typeof ACOES_DE_MODERACAO_DE_EVENTO)[number];

/** A linha de `PlatformEventModeration`, ou a ausência dela. */
export type EstadoDaModeracao = {
  readonly previousStatus: string | null;
  readonly suspendedAt: Date | string | null;
  readonly removedAt: Date | string | null;
};

export type EventoParaModeracao = {
  readonly id: string;
  readonly status: string;
  /** `null` quando o evento nunca passou por moderação. */
  readonly moderacao: EstadoDaModeracao | null;
};

/**
 * Os motivos de recusa, como lista e não como união de literais.
 *
 * O tipo é derivado dela, então há uma fonte só. E sendo valor, o teste pode
 * exigir que TODOS sejam alcançáveis: motivo declarado que nenhum cenário
 * produz é código morto numa política de autorização, que é o pior lugar para
 * ter código morto — ninguém sabe se ele não dispara porque é impossível ou
 * porque a checagem que o produziria foi removida.
 */
export const MOTIVOS_DE_RECUSA_DA_TRANSICAO = [
  'SITUACAO_DESCONHECIDA',
  'ACAO_DESCONHECIDA',
  'NAO_SUSPENSIVEL',
  'JA_SUSPENSO',
  'NAO_ESTA_SUSPENSO',
  'SITUACAO_ANTERIOR_PERDIDA',
  'JA_REMOVIDO',
  'NAO_ESTA_REMOVIDO',
  'EXIGE_SUSPENSAO_ANTES',
] as const;

export type MotivoDeRecusaDaTransicao = (typeof MOTIVOS_DE_RECUSA_DA_TRANSICAO)[number];

/** O que gravar em `Event`. Só `status`, e só quando muda. */
export type MudancaNoEvento = { readonly status: Situacao } | null;

/** O que gravar em `PlatformEventModeration`. */
export type MudancaNaModeracao = {
  readonly previousStatus: Situacao | null;
  readonly suspendedAt: string | null;
  readonly removedAt: string | null;
};

export type Transicao =
  | {
    readonly ok: true;
    readonly acao: AcaoDeModeracaoDeEvento;
    readonly de: Situacao;
    readonly para: Situacao;
    readonly evento: MudancaNoEvento;
    readonly moderacao: MudancaNaModeracao;
    /** O que a trilha registra. O `de`/`para` é o que torna a ação auditável. */
    readonly alteracoes: { readonly de: Situacao; readonly para: Situacao; readonly removido: boolean };
  }
  | {
    readonly ok: false;
    readonly recusa: MotivoDeRecusaDaTransicao;
    readonly porque: string;
  };

/**
 * Situações em que suspender significa alguma coisa.
 *
 * `FINISHED` e `CANCELLED` ficam fora porque não há nada em curso para
 * interromper — suspender ali só embaralharia o registro do que aconteceu. Um
 * evento encerrado com problema se investiga pela trilha, não se suspende.
 */
const SUSPENSIVEIS: readonly Situacao[] = [
  'DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED',
];

const conhecida = (valor: string): valor is Situacao => (SITUACOES as readonly string[]).includes(valor);

/**
 * A marca como texto ISO, ou `null` se ela não existe ou não dá data.
 *
 * Uma fonte só para "esta marca é usável". `marcado` deriva dela, e os valores
 * gravados também — assim não há lugar nenhum onde eu afirme com cast que a
 * coluna tem data porque uma checagem anterior disse que tinha.
 */
const emIso = (valor: Date | string | null | undefined): string | null => {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
};

const marcado = (valor: Date | string | null | undefined): boolean => emIso(valor) !== null;

const vazio: EstadoDaModeracao = { previousStatus: null, suspendedAt: null, removedAt: null };

const recusar = (recusa: MotivoDeRecusaDaTransicao, porque: string): Transicao => ({ ok: false, recusa, porque });

/**
 * Planeja a transição. Não escreve nada: devolve o que escrever.
 *
 * `agora` é parâmetro para que o teste não dependa do relógio — e para que as
 * duas marcas de uma mesma ação tenham o MESMO instante, em vez de dois
 * `Date.now()` separados por microssegundos que depois não casam na trilha.
 */
export function planejarModeracao(
  evento: EventoParaModeracao,
  acao: string,
  agora: number = Date.now(),
): Transicao {
  if (!conhecida(evento.status)) {
    // Situação que o código não conhece: nega. Presumir seria decidir sobre um
    // estado que alguém acrescentou sem revisar esta política.
    return recusar('SITUACAO_DESCONHECIDA', 'A situação atual do evento não é reconhecida pela Área Master.');
  }
  if (!(ACOES_DE_MODERACAO_DE_EVENTO as readonly string[]).includes(acao)) {
    return recusar('ACAO_DESCONHECIDA', `A ação "${acao}" não é uma ação de moderação de evento.`);
  }

  const atual: Situacao = evento.status;
  const estado = evento.moderacao ?? vazio;
  const suspensoEm = emIso(estado.suspendedAt);
  const suspenso = suspensoEm !== null;
  const removido = marcado(estado.removedAt);
  const instante = new Date(agora).toISOString();

  // A situação anterior gravada, CONFERIDA contra o catálogo em vez de
  // afirmada com cast. A coluna é texto e pode conter valor de um catálogo
  // antigo ou escrito à mão; `as Situacao` diria ao compilador que isso não
  // acontece e o valor passaria adiante sem ninguém olhar. Fora do catálogo
  // vira ausência, que é o que `desbloquear` já trata — e trata recusando.
  const anteriorGuardado: Situacao | null =
    estado.previousStatus !== null && conhecida(estado.previousStatus) ? estado.previousStatus : null;

  if (acao === 'suspender') {
    // A ordem desta checagem importa: `JA_SUSPENSO` vem antes de
    // `NAO_SUSPENSIVEL` porque `SUSPENDED` também não está em SUSPENSIVEIS, e
    // responder "não é suspensível" a um evento já suspenso seria enganoso.
    if (suspenso) {
      return recusar(
        'JA_SUSPENSO',
        'O evento já está suspenso. Suspender de novo apagaria a situação para a qual ele deve voltar.',
      );
    }
    if (!SUSPENSIVEIS.includes(atual)) {
      return recusar('NAO_SUSPENSIVEL', `Um evento em "${atual}" não pode ser suspenso.`);
    }
    return {
      ok: true,
      acao,
      de: atual,
      para: 'SUSPENDED',
      evento: { status: 'SUSPENDED' },
      // `previousStatus` é o ponto inteiro da tabela: sem ele não há volta.
      //
      // `removedAt: null` sem condicional, de propósito: remover exige
      // suspensão antes, então um evento removido está suspenso, e teria saído
      // em `JA_SUSPENSO` acima. Escrever um ternário aqui seria guardar um
      // caso que não acontece, e guarda que não dispara é guarda que ninguém
      // testa.
      moderacao: { previousStatus: atual, suspendedAt: instante, removedAt: null },
      alteracoes: { de: atual, para: 'SUSPENDED', removido },
    };
  }

  if (acao === 'desbloquear') {
    if (!suspenso) {
      return recusar('NAO_ESTA_SUSPENSO', 'O evento não está suspenso.');
    }
    if (removido) {
      // Desbloquear um evento removido o devolveria ao ar sem desfazer a
      // remoção, e é a restauração que responde por isso.
      return recusar('JA_REMOVIDO', 'O evento foi removido pela plataforma. Restaure-o antes de desbloquear.');
    }
    const anterior = anteriorGuardado;
    if (anterior === null) {
      // Adivinhar aqui é o erro caro: `DRAFT` despublicaria um evento que
      // estava no ar, `PUBLISHED` publicaria um que nunca esteve. Recusar e
      // dizer qual situação informar é a única resposta honesta.
      return recusar(
        'SITUACAO_ANTERIOR_PERDIDA',
        'A situação anterior do evento não está registrada. Informe explicitamente para onde ele deve voltar.',
      );
    }
    return {
      ok: true,
      acao,
      de: atual,
      para: anterior,
      evento: { status: anterior },
      moderacao: { previousStatus: null, suspendedAt: null, removedAt: null },
      alteracoes: { de: atual, para: anterior, removido: false },
    };
  }

  if (acao === 'excluir') {
    if (removido) {
      return recusar('JA_REMOVIDO', 'O evento já foi removido pela plataforma.');
    }
    if (!suspenso) {
      // Dois passos deliberados, com duas entradas na trilha. Remover um
      // evento no ar de uma vez é a operação que mais precisa de um momento
      // entre a decisão e o efeito.
      return recusar(
        'EXIGE_SUSPENSAO_ANTES',
        'Suspenda o evento antes de removê-lo, para que a interrupção e a remoção sejam decisões separadas.',
      );
    }
    return {
      ok: true,
      acao,
      de: atual,
      para: atual,
      // Nada muda em `Event`: ele já está suspenso, e a remoção é uma
      // classificação da plataforma, não uma situação do evento.
      evento: null,
      // `suspendedAt` é PRESERVADO, não reescrito: ele diz quando a
      // interrupção começou, e a remoção é um fato posterior com a sua própria
      // marca. Sobrescrever perderia a duração da suspensão, que é justamente
      // o que alguém revisando a decisão vai querer saber.
      moderacao: {
        previousStatus: anteriorGuardado,
        suspendedAt: suspensoEm,
        removedAt: instante,
      },
      alteracoes: { de: atual, para: atual, removido: true },
    };
  }

  // restaurar
  if (!removido) {
    return recusar('NAO_ESTA_REMOVIDO', 'O evento não foi removido pela plataforma.');
  }
  return {
    ok: true,
    acao: 'restaurar',
    de: atual,
    para: atual,
    // A restauração desfaz a REMOÇÃO e deixa o evento suspenso. Devolvê-lo ao
    // ar no mesmo passo juntaria duas decisões que foram tomadas separadas.
    evento: null,
    moderacao: {
      previousStatus: anteriorGuardado,
      suspendedAt: suspensoEm,
      removedAt: null,
    },
    alteracoes: { de: atual, para: atual, removido: false },
  };
}

/**
 * O evento aparece em listagem?
 *
 * Removido não aparece. É a função que a consulta do catálogo e a do painel
 * precisam compartilhar — duas regras parecidas de visibilidade é como um
 * evento removido reaparece em um lugar e não em outro.
 */
export function visivelNoCatalogo(evento: EventoParaModeracao): boolean {
  return !marcado((evento.moderacao ?? vazio).removedAt);
}
