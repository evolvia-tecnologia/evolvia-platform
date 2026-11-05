/**
 * Política de capacidades do operador por evento (G10.10).
 *
 * Problema que este módulo resolve
 * --------------------------------
 * Hoje a autorização do balcão (`EventDeskService`) tem dois filtros e nenhum
 * deles responde "esta pessoa pode esta ação neste evento":
 *
 *   1. `requireRole(userId, event.organizationId, STAFF_ROLES)` — papel na
 *      ORGANIZAÇÃO (OWNER/ADMIN/MANAGER/OPERATOR). Vale para todos os eventos
 *      da organização.
 *   2. `deskAllows(codes, capability)` — capacidades ativas do EVENTO
 *      (`EventCapability`). É feature toggle do evento, não permissão de pessoa.
 *
 * O único recorte por pessoa é `requireOrganizer(role)`, que bloqueia apenas
 * OPERATOR. Resultado: todo OPERATOR da organização pode reverter check-in,
 * reverter entrega de material e corrigir inscrição em QUALQUER evento dela.
 *
 * O que este módulo faz
 * ---------------------
 * Acrescenta um terceiro filtro, `deny-by-default`, que só sabe NEGAR: ele
 * nunca concede nada que os dois filtros atuais já não concedessem. Isso o torna
 * aditivo com segurança (expandir -> migrar -> validar -> restringir).
 *
 * Ativação por evento: o filtro só vale quando o evento tem a capacidade
 * `operator_scoped_access` ativa. Evento sem ela mantém exatamente o
 * comportamento de hoje — nenhuma operação em produção quebra na migração.
 * Evento com ela exige concessão explícita por ação.
 *
 * Organizadores (OWNER/ADMIN/MANAGER) não são estreitados por concessões: são
 * eles que concedem, e estreitá-los permitiria auto-bloqueio sem via de volta.
 *
 * Módulo puro de propósito: sem Prisma, sem Nest, sem I/O. Isso o torna
 * executável e testável sem banco e sem `node_modules`.
 */

/** Capacidades operacionais do evento, espelhando `OPERATIONAL` em
 *  `apps/api/src/event-desk-policy.ts` (lido em develop @ 01932c88). */
export const CAPACIDADES_DE_EVENTO = ['credential', 'access_control', 'material_delivery', 'registration'] as const;
export type CapacidadeDeEvento = (typeof CAPACIDADES_DE_EVENTO)[number];

/** Código da capacidade de evento que LIGA este filtro. Enquanto ausente, o
 *  evento se comporta como hoje. */
export const CODIGO_ESCOPO_OPERADOR = 'operator_scoped_access';

/**
 * Ações do balcão que podem ser concedidas a um operador, uma por método
 * público de `EventDeskService` que hoje aceita OPERATOR.
 *
 * `capacidade: null` = o método atual não chama `requireCapability`.
 * `reverte`           = a ação direta que esta desfaz, nomeada explicitamente.
 *                       Separada de propósito, para que conceder check-in não
 *                       conceda reverter check-in: é este o ganho de
 *                       granularidade. O par é dado, não inferido do nome —
 *                       inferir por sufixo já falhou em `material_reverter`.
 * `sensivel: true`    = desfaz ou altera registro já gravado. A interface deve
 *                       confirmar antes; a concessão é sempre separada.
 */
export const ACOES_DE_OPERADOR = {
  buscar: { metodo: 'search', capacidade: null, reverte: null, sensivel: false },
  checkin: { metodo: 'checkInReservation', capacidade: 'access_control', reverte: null, sensivel: false },
  checkin_reverter: { metodo: 'reverseCheckIn', capacidade: 'access_control', reverte: 'checkin', sensivel: true },
  credencial_imprimir: { metodo: 'badge', capacidade: 'credential', reverte: null, sensivel: false },
  material_entregar: { metodo: 'deliverMaterial', capacidade: 'material_delivery', reverte: null, sensivel: false },
  material_reverter: { metodo: 'reverseMaterial', capacidade: 'material_delivery', reverte: 'material_entregar', sensivel: true },
  presenca_dia: { metodo: 'markDayPresence', capacidade: 'access_control', reverte: null, sensivel: false },
  presenca_dia_reverter: { metodo: 'reverseDayPresence', capacidade: 'access_control', reverte: 'presenca_dia', sensivel: true },
  atividade_acesso: { metodo: 'recordActivityAccess', capacidade: 'access_control', reverte: null, sensivel: false },
  inscricao_criar: { metodo: 'registrationTarget', capacidade: 'registration', reverte: null, sensivel: false },
  inscricao_ler: { metodo: 'registrationRecord', capacidade: null, reverte: null, sensivel: false },
  inscricao_corrigir: { metodo: 'correctRegistration', capacidade: null, reverte: null, sensivel: true },
  kit_ler: { metodo: 'kit', capacidade: 'material_delivery', reverte: null, sensivel: false },
  kit_relatorio: { metodo: 'kitReport', capacidade: 'material_delivery', reverte: null, sensivel: false },
  relatorio: { metodo: 'report', capacidade: null, reverte: null, sensivel: false },
  sorteio: { metodo: 'draw', capacidade: null, reverte: null, sensivel: false },
} as const satisfies Record<
  string,
  { metodo: string; capacidade: CapacidadeDeEvento | null; reverte: string | null; sensivel: boolean }
>;

export type AcaoDeOperador = keyof typeof ACOES_DE_OPERADOR;

/**
 * Métodos do balcão que hoje chamam `requireOrganizer` e portanto NUNCA podem
 * ser concedidos a um operador. Lista explícita para que um teste detecte se
 * alguém mover um deles para o catálogo concedível.
 */
export const METODOS_SO_DE_ORGANIZADOR = [
  'updateCategoryLabel',
  'updateLabel',
  'updateSelfService',
  'issueTotemLink',
  'revokeTotemLink',
  'saveKit',
  'exportKitReport',
] as const;

/**
 * `context` fica fora do catálogo de propósito: é a própria leitura do painel,
 * já guardada por `requireRole`. Sem ela o operador receberia 404 e não teria
 * como ver que está sem concessões. A resposta de `context` deve devolver as
 * ações concedidas, para que a interface mostre só o que é permitido —
 * lembrando que esconder botão não é controle de acesso: o backend nega.
 */
export const ACAO_SEMPRE_LIBERADA_PARA_STAFF = 'context' as const;

export function ehAcaoDeOperador(valor: unknown): valor is AcaoDeOperador {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(ACOES_DE_OPERADOR, valor);
}

export type PapelNaOrganizacao = 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';

const PAPEIS_DE_ORGANIZADOR: readonly PapelNaOrganizacao[] = ['OWNER', 'ADMIN', 'MANAGER'];
const PAPEIS_DE_STAFF: readonly PapelNaOrganizacao[] = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'];

/** Concessão já lida do banco. `revogadaEm` não nulo = sem efeito. */
export interface Concessao {
  readonly organizationId: string;
  readonly eventId: string;
  readonly userId: string;
  readonly acao: string;
  readonly revogadaEm?: Date | string | null;
}

export interface Pedido {
  readonly papel: PapelNaOrganizacao;
  readonly acao: string;
  /** Organização do EVENTO, não a do token. */
  readonly organizationId: string;
  readonly eventId: string;
  readonly userId: string;
  /** Códigos de `EventCapability` ATIVAS do evento. */
  readonly capacidadesDoEvento: readonly string[];
  readonly concessoes: readonly Concessao[];
}

export type MotivoDeNegativa =
  | 'acao_desconhecida'
  | 'papel_sem_acesso_ao_balcao'
  | 'acao_exclusiva_de_organizador'
  | 'capacidade_do_evento_inativa'
  | 'sem_concessao_para_a_acao';

export interface Decisao {
  readonly permitido: boolean;
  readonly motivo: MotivoDeNegativa | null;
  /** true = o evento tem `operator_scoped_access`; a decisão passou pelo novo filtro. */
  readonly escopado: boolean;
}

const nega = (motivo: MotivoDeNegativa, escopado: boolean): Decisao => ({ permitido: false, motivo, escopado });

/**
 * Decide uma ação do balcão. `deny-by-default`: só devolve `permitido: true`
 * por um caminho explícito; qualquer entrada inesperada nega.
 *
 * Os três filtros compõem com E, não com OU: a ação precisa do papel, da
 * capacidade do evento E — em evento escopado — da concessão.
 */
export function decidirAcaoDeOperador(pedido: Pedido): Decisao {
  const escopado = pedido.capacidadesDoEvento.includes(CODIGO_ESCOPO_OPERADOR);

  if (!ehAcaoDeOperador(pedido.acao)) {
    return nega(
      (METODOS_SO_DE_ORGANIZADOR as readonly string[]).includes(pedido.acao)
        ? 'acao_exclusiva_de_organizador'
        : 'acao_desconhecida',
      escopado,
    );
  }
  const acao = ACOES_DE_OPERADOR[pedido.acao];

  if (!PAPEIS_DE_STAFF.includes(pedido.papel)) return nega('papel_sem_acesso_ao_balcao', escopado);

  if (acao.capacidade !== null && !pedido.capacidadesDoEvento.includes(acao.capacidade)) {
    return nega('capacidade_do_evento_inativa', escopado);
  }

  // Organizador não é estreitado por concessão: ele é quem concede.
  if (PAPEIS_DE_ORGANIZADOR.includes(pedido.papel)) return { permitido: true, motivo: null, escopado };

  // Evento não escopado: comportamento de hoje, preservado na íntegra.
  if (!escopado) return { permitido: true, motivo: null, escopado };

  const concedida = pedido.concessoes.some(
    (c) =>
      c.acao === pedido.acao &&
      c.userId === pedido.userId &&
      c.eventId === pedido.eventId &&
      c.organizationId === pedido.organizationId &&
      !c.revogadaEm,
  );
  return concedida ? { permitido: true, motivo: null, escopado } : nega('sem_concessao_para_a_acao', escopado);
}

/** Ações concedidas de fato, para a interface limitada do operador. */
export function acoesPermitidas(pedido: Omit<Pedido, 'acao'>): AcaoDeOperador[] {
  return (Object.keys(ACOES_DE_OPERADOR) as AcaoDeOperador[]).filter(
    (acao) => decidirAcaoDeOperador({ ...pedido, acao }).permitido,
  );
}

export class EntradaInvalida extends Error {}

export interface PedidoDeConcessao {
  readonly organizationId: string;
  readonly eventId: string;
  readonly userId: string;
  readonly acoes: readonly string[];
}

/**
 * Normaliza um pedido de concessão vindo da borda. Rejeita ação desconhecida
 * em vez de ignorar em silêncio: ignorar faria o organizador acreditar que
 * concedeu algo que não concedeu.
 */
export function normalizarConcessao(entrada: unknown): {
  organizationId: string;
  eventId: string;
  userId: string;
  acoes: AcaoDeOperador[];
} {
  if (typeof entrada !== 'object' || entrada === null) throw new EntradaInvalida('Pedido inválido.');
  const bruto = entrada as Record<string, unknown>;

  const texto = (campo: string): string => {
    const v = bruto[campo];
    if (typeof v !== 'string' || v.trim() === '') throw new EntradaInvalida(`Campo "${campo}" é obrigatório.`);
    return v.trim();
  };

  const organizationId = texto('organizationId');
  const eventId = texto('eventId');
  const userId = texto('userId');

  if (!Array.isArray(bruto.acoes)) throw new EntradaInvalida('Campo "acoes" deve ser uma lista.');
  const acoes: AcaoDeOperador[] = [];
  for (const item of bruto.acoes) {
    if (!ehAcaoDeOperador(item)) {
      throw new EntradaInvalida(
        (METODOS_SO_DE_ORGANIZADOR as readonly string[]).includes(String(item))
          ? `Ação "${String(item)}" é exclusiva de organizador e não pode ser concedida.`
          : `Ação "${String(item)}" não existe.`,
      );
    }
    if (!acoes.includes(item)) acoes.push(item);
  }
  if (acoes.length === 0) throw new EntradaInvalida('Informe ao menos uma ação.');

  return { organizationId, eventId, userId, acoes };
}

/** Registro de auditoria de concessão/revogação. Sem dado pessoal: só ids. */
export interface RegistroDeAuditoria {
  readonly ocorridoEm: Date;
  readonly tipo: 'concedida' | 'revogada';
  readonly organizationId: string;
  readonly eventId: string;
  readonly alvoUserId: string;
  readonly atorUserId: string;
  readonly acao: AcaoDeOperador;
}

export function montarAuditoria(
  tipo: 'concedida' | 'revogada',
  dados: { organizationId: string; eventId: string; alvoUserId: string; atorUserId: string; acao: AcaoDeOperador },
  agora: Date = new Date(),
): RegistroDeAuditoria {
  return { ocorridoEm: agora, tipo, ...dados };
}
