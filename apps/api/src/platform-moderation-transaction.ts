/**
 * Gravação transacional da moderação de eventos (#665).
 *
 * Problema
 * --------
 * `decidirModeracao` resolve SE a ação vale e O QUE deve passar a valer. Ele
 * não resolve o problema seguinte, que é onde a moderação estraga de verdade:
 * **a decisão vira três escritas em lugares diferentes** — o estado de
 * moderação, o `status` do evento e a trilha append-only — e qualquer uma
 * delas sozinha é um estado mentiroso:
 *
 *  - estado SUSPENSO gravado e `Event.status` intacto: a plataforma acha que
 *    barrou e o evento continua vendendo inscrição;
 *  - `Event.status` em SUSPENDED e moderação intacta: o evento sai do ar sem
 *    que `permite()` barre nada, e ninguém sabe por quê nem quem fez;
 *  - estado mudado e trilha ausente: a prova que a plataforma vai precisar
 *    numa disputa simplesmente não existe.
 *
 * Por isso este módulo não grava campo a campo: ele monta UM plano completo e
 * o aplica dentro de uma transação só. Ou as três escritas acontecem, ou
 * nenhuma acontece.
 *
 * O ciclo de vida encerrado não é apagado por moderação
 * ------------------------------------------------------
 * Suspensão pela plataforma não é cancelamento pelo organizador: são fatos com
 * responsáveis diferentes. Disso segue uma regra que faltava aqui: **se o
 * `Event.status` já é terminal — `FINISHED` ou `CANCELLED` — a moderação nunca
 * o escreve.** A restrição administrativa vem da linha de moderação, que é onde
 * ela sempre devia ter vivido.
 *
 * Sem essa regra, suspender um evento finalizado trocava `FINISHED` por
 * `SUSPENDED` e o devolvia só na liberação. A fotografia garantia a volta, mas
 * durante toda a investigação o evento deixava de constar como encerrado — e é
 * durante a investigação que o histórico precisa ser fiel.
 *
 * A regra vale para as quatro ações, então o estado terminal é preservado antes,
 * durante e depois. E a consequência não é efeito colateral, é o ponto: liberar
 * ou restaurar um evento terminal não reabre publicação, inscrição nem
 * cobrança, porque não há status para reabrir.
 *
 * A supressão é nomeada em `statusPreservadoPorSerTerminal`, e não silenciosa:
 * a política continua devolvendo `SUSPENDED`, e um plano que a ignorasse sem
 * dizer seria a divergência entre dois módulos que este arquivo existe para
 * evitar.
 *
 * A segunda razão de existir
 * --------------------------
 * As duas `CHECK` da migration e a política descrevem a mesma invariante em
 * linguagens diferentes. Um plano que as viole hoje só apareceria como 500 do
 * PostgreSQL, no meio de uma ação de moderação. Aqui o plano é conferido
 * **contra a linha resultante** antes de qualquer escrita, e uma violação vira
 * recusa nomeada em vez de erro de banco.
 *
 * `planejarGravacao` é puro: sem Prisma, sem Nest, sem I/O. `aplicarPlano`
 * recebe o cliente transacional por parâmetro, de modo que a ordem e a
 * atomicidade sejam testáveis sem banco.
 */

import type {
  AcaoDeModeracao,
  Classificacao,
  EstadoDeModeracao,
  Veredito,
} from './platform-moderation-policy.ts';

export const LIMITE_DA_CORRELACAO = 64;
export const LIMITE_DO_STATUS = 32;
export const LIMITE_DO_IDENTIFICADOR = 64;

/**
 * Status em que o ciclo de vida do evento já terminou.
 *
 * Terminal significa que não há mais nada a acontecer com o evento por
 * iniciativa de quem o organiza. Moderação pode restringir o acesso ao que
 * sobrou — página, catálogo, emissão — mas não pode reescrever o fato de que
 * ele terminou ou foi cancelado.
 */
export const STATUS_TERMINAIS = ['FINISHED', 'CANCELLED'] as const;

export function statusTerminal(status: string): boolean {
  return (STATUS_TERMINAIS as readonly string[]).includes(status);
}

/** Ação em minúsculas na política, maiúscula no enum do banco. */
const ACAO_NO_BANCO: Record<AcaoDeModeracao, string> = {
  suspender: 'SUSPENDER',
  liberar: 'LIBERAR',
  remover: 'REMOVER',
  restaurar: 'RESTAURAR',
};

/** Nomeia a ação do banco sem permitir que uma ação nova passe em silêncio. */
export function acaoNoBanco(acao: unknown): string | null {
  if (typeof acao !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(ACAO_NO_BANCO, acao)
    ? ACAO_NO_BANCO[acao as AcaoDeModeracao]
    : null;
}

export type MotivoDeRecusaDaGravacao =
  | 'veredito_nao_permitido'
  | 'nada_a_fazer'
  | 'acao_sem_equivalente_no_banco'
  | 'evento_obrigatorio'
  | 'organizacao_obrigatoria'
  | 'correlacao_obrigatoria'
  | 'correlacao_muito_longa'
  | 'status_anterior_obrigatorio'
  | 'status_muito_longo'
  | 'identificador_muito_longo'
  | 'fotografia_ausente_fora_de_ativo'
  | 'fotografia_residual_em_ativo';

export interface LinhaDeModeracao {
  readonly state: EstadoDeModeracao;
  readonly previousState?: EstadoDeModeracao | null;
  readonly originalEventStatus?: string | null;
}

export interface EntradaDaGravacao {
  readonly eventId: unknown;
  readonly organizationId: unknown;
  readonly acao: unknown;
  readonly veredito: Veredito;
  readonly classificacao: Classificacao;
  /** Linha existente, ou `null` quando o evento nunca foi moderado. */
  readonly linhaAtual: LinhaDeModeracao | null;
  /** `Event.status` AGORA, lido na mesma transação. */
  readonly statusDoEvento: unknown;
  readonly atorUserId: unknown;
  readonly segundaAprovacaoPor?: unknown;
  readonly correlationId: unknown;
}

export interface EscritaDaModeracao {
  readonly state: EstadoDeModeracao;
  readonly previousState: EstadoDeModeracao | null;
  /** Ausente quando a fotografia deve ser preservada como está. */
  readonly originalEventStatus?: string | null;
  readonly lastAction: string;
  readonly lastClassification: Classificacao;
  readonly lastReason: string;
  readonly lastCaseRef: string;
  readonly lastActorUserId: string;
  readonly lastApproverUserId: string;
}

export interface EscritaDaTrilha {
  readonly eventId: string;
  readonly organizationId: string;
  readonly action: string;
  readonly fromState: EstadoDeModeracao;
  readonly toState: EstadoDeModeracao;
  readonly eventStatusBefore: string;
  readonly eventStatusAfter: string;
  readonly originalEventStatus: string | null;
  readonly classification: Classificacao;
  readonly reason: string;
  readonly caseRef: string;
  readonly actorUserId: string;
  readonly approverUserId: string;
  readonly correlationId: string;
}

export interface Plano {
  readonly gravar: boolean;
  readonly motivo: MotivoDeRecusaDaGravacao | null;
  readonly eventId: string;
  readonly moderacao: EscritaDaModeracao | null;
  readonly trilha: EscritaDaTrilha | null;
  /** `null` = não mexer no `Event.status`. */
  readonly statusDoEventoNovo: string | null;
  /**
   * A política pediu mudança de `Event.status` e a regra do estado terminal a
   * suprimiu.
   *
   * Existe para que a supressão seja afirmada e auditável em vez de inferida de
   * um `null`. Só liga quando havia mudança pretendida: se a política já não
   * queria mexer, nada foi preservado por esta regra, e dizer que foi seria
   * mentir num campo que alguém vai usar para reconstituir o caso.
   */
  readonly statusPreservadoPorSerTerminal: boolean;
  /** Linha que a moderação terá depois da escrita, para conferência. */
  readonly linhaResultante: LinhaDeModeracao | null;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const naoGravar = (motivo: MotivoDeRecusaDaGravacao, eventId = ''): Plano => ({
  gravar: false,
  motivo,
  eventId,
  moderacao: null,
  trilha: null,
  statusDoEventoNovo: null,
  statusPreservadoPorSerTerminal: false,
  linhaResultante: null,
});

/**
 * Monta o plano completo de uma ação já aprovada pela política.
 *
 * Nada aqui reabre a decisão: um veredito recusado não vira escrita, e um
 * veredito idempotente não vira escrita nenhuma — inclusive nenhuma linha de
 * trilha, porque a trilha registra MUDANÇA de estado, e não tentativa. Recusa
 * e tentativa pertencem ao log de auditoria da plataforma, que é outro lugar.
 */
export function planejarGravacao(entrada: EntradaDaGravacao): Plano {
  const { veredito } = entrada;
  if (!veredito.permitido) {
    return naoGravar(veredito.idempotente ? 'nada_a_fazer' : 'veredito_nao_permitido');
  }

  const eventId = texto(entrada.eventId);
  if (eventId === '') return naoGravar('evento_obrigatorio');
  const organizationId = texto(entrada.organizationId);
  if (organizationId === '') return naoGravar('organizacao_obrigatoria', eventId);
  if (organizationId.length > LIMITE_DO_IDENTIFICADOR) return naoGravar('identificador_muito_longo', eventId);

  const correlationId = texto(entrada.correlationId);
  if (correlationId === '') return naoGravar('correlacao_obrigatoria', eventId);
  if (correlationId.length > LIMITE_DA_CORRELACAO) return naoGravar('correlacao_muito_longa', eventId);

  const action = acaoNoBanco(entrada.acao);
  if (action === null) return naoGravar('acao_sem_equivalente_no_banco', eventId);

  const ator = texto(entrada.atorUserId);
  const aprovador = texto(entrada.segundaAprovacaoPor);
  if (ator.length > LIMITE_DO_IDENTIFICADOR || aprovador.length > LIMITE_DO_IDENTIFICADOR) {
    return naoGravar('identificador_muito_longo', eventId);
  }

  // Evento nunca moderado é ATIVO: mesma decisão da porta de consumo, e o
  // único lugar em que ausência significa permitir.
  const estadoAtual: EstadoDeModeracao = entrada.linhaAtual?.state ?? 'ATIVO';
  const fotografiaAtual = typeof entrada.linhaAtual?.originalEventStatus === 'string'
    ? entrada.linhaAtual.originalEventStatus
    : null;

  const statusAntes = texto(entrada.statusDoEvento);
  if (statusAntes === '') return naoGravar('status_anterior_obrigatorio', eventId);

  // A regra do ciclo de vida encerrado. Vem ANTES de `statusDepois` porque a
  // trilha tem de registrar que nada mudou, e não o que teria mudado.
  const terminal = statusTerminal(statusAntes);
  const statusDoEventoNovo = terminal ? null : veredito.statusDoEventoNovo;
  const statusPreservadoPorSerTerminal = terminal && veredito.statusDoEventoNovo !== null;

  const statusDepois = statusDoEventoNovo ?? statusAntes;
  if (statusAntes.length > LIMITE_DO_STATUS || statusDepois.length > LIMITE_DO_STATUS) {
    return naoGravar('status_muito_longo', eventId);
  }

  const estadoNovo = veredito.estadoNovo ?? estadoAtual;

  // `undefined` preserva a fotografia; `null` a apaga; texto a substitui.
  const fotografiaResultante = veredito.statusOriginalNovo === undefined
    ? fotografiaAtual
    : veredito.statusOriginalNovo;

  // As duas CHECK da migration, conferidas sobre a linha RESULTANTE. Violá-las
  // seria um 500 do PostgreSQL no meio de uma ação de moderação.
  if (estadoNovo !== 'ATIVO' && fotografiaResultante === null) {
    return naoGravar('fotografia_ausente_fora_de_ativo', eventId);
  }
  if (estadoNovo === 'ATIVO' && fotografiaResultante !== null) {
    return naoGravar('fotografia_residual_em_ativo', eventId);
  }
  if (fotografiaResultante !== null && fotografiaResultante.length > LIMITE_DO_STATUS) {
    return naoGravar('status_muito_longo', eventId);
  }

  // Guardado só ao ENTRAR em REMOVIDO: é o que a restauração lê para saber se
  // devolve o evento ao ar ou o deixa suspenso. Sair de REMOVIDO o limpa, para
  // que uma remoção futura não herde o anterior de outra.
  const previousState: EstadoDeModeracao | null = estadoNovo === 'REMOVIDO'
    ? estadoAtual
    : null;

  const moderacao: EscritaDaModeracao = {
    state: estadoNovo,
    previousState,
    ...(veredito.statusOriginalNovo === undefined ? {} : { originalEventStatus: veredito.statusOriginalNovo }),
    lastAction: action,
    lastClassification: entrada.classificacao,
    lastReason: veredito.motivoTexto,
    lastCaseRef: veredito.referencia,
    lastActorUserId: ator,
    lastApproverUserId: aprovador,
  };

  const trilha: EscritaDaTrilha = {
    eventId,
    organizationId,
    action,
    fromState: estadoAtual,
    toState: estadoNovo,
    eventStatusBefore: statusAntes,
    eventStatusAfter: statusDepois,
    originalEventStatus: fotografiaResultante,
    classification: entrada.classificacao,
    reason: veredito.motivoTexto,
    caseRef: veredito.referencia,
    actorUserId: ator,
    approverUserId: aprovador,
    correlationId,
  };

  return {
    gravar: true,
    motivo: null,
    eventId,
    moderacao,
    trilha,
    statusDoEventoNovo,
    statusPreservadoPorSerTerminal,
    linhaResultante: { state: estadoNovo, previousState, originalEventStatus: fotografiaResultante },
  };
}

/** Mínimo que a transação precisa expor. Mantém o módulo testável sem banco. */
export interface ClienteTransacional {
  platformEventModeration: {
    upsert(args: unknown): Promise<unknown>;
  };
  platformEventModerationEvent: {
    create(args: unknown): Promise<unknown>;
  };
  event: {
    update(args: unknown): Promise<unknown>;
  };
}

export class ModeracaoNaoGravavelError extends Error {
  // Campo declarado em vez de parameter property: o repositório roda os testes
  // com type stripping do Node, que recusa `constructor(readonly x)`.
  readonly motivo: MotivoDeRecusaDaGravacao;

  constructor(motivo: MotivoDeRecusaDaGravacao) {
    super(`Gravação de moderação recusada: ${motivo}`);
    this.name = 'ModeracaoNaoGravavelError';
    this.motivo = motivo;
  }
}

/**
 * Aplica o plano. Deve ser chamado DENTRO de `prisma.$transaction`.
 *
 * A ordem importa e é deliberada: estado, depois `Event.status`, depois
 * trilha. A trilha por último porque ela descreve o que as duas primeiras
 * fizeram; se qualquer uma falhar, a transação desfaz tudo e a trilha não
 * registra um fato que não aconteceu.
 *
 * Em evento de status terminal, `statusDoEventoNovo` é `null` e o `Event.status`
 * não é tocado: são duas escritas, não três.
 */
export async function aplicarPlano(tx: ClienteTransacional, plano: Plano): Promise<void> {
  if (!plano.gravar || plano.moderacao === null || plano.trilha === null) {
    throw new ModeracaoNaoGravavelError(plano.motivo ?? 'veredito_nao_permitido');
  }

  await tx.platformEventModeration.upsert({
    where: { eventId: plano.eventId },
    create: {
      eventId: plano.eventId,
      organizationId: plano.trilha.organizationId,
      ...plano.moderacao,
      // Na criação a fotografia não pode ficar implícita: sem linha anterior
      // não há o que preservar, e a CHECK exige valor fora de ATIVO.
      originalEventStatus: plano.linhaResultante?.originalEventStatus ?? null,
    },
    update: { ...plano.moderacao },
  });

  if (plano.statusDoEventoNovo !== null) {
    await tx.event.update({
      where: { id: plano.eventId },
      data: { status: plano.statusDoEventoNovo },
    });
  }

  await tx.platformEventModerationEvent.create({ data: { ...plano.trilha } });
}
