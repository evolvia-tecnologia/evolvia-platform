import { EventStatus, MembershipRole } from '@prisma/client';

export type EventPublicationMutation =
  | 'UPDATE_EDITORIAL'
  | 'UPDATE_SECTIONS'
  | 'UPDATE_THEME'
  | 'PREPARE_PREVIEW';

export type EventPublicationPolicyInput = {
  role: MembershipRole;
  eventStatus: EventStatus;
  mutation: EventPublicationMutation;
};

export type EventPublicationTransitionInput = {
  role: MembershipRole;
  fromStatus: EventStatus;
  toStatus: EventStatus;
};

export type EventPublicationRepeatTransitionInput = {
  role: MembershipRole;
  status: EventStatus;
};

const MUTATING_ROLES = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
]);

const APPROVER_ROLES = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
]);

const EDITABLE_EVENT_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.SETUP,
]);

const PREVIEWABLE_EVENT_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.SETUP,
  EventStatus.HOMOLOGATION,
  EventStatus.READY_TO_PUBLISH,
  EventStatus.PUBLISHED,
  EventStatus.SUSPENDED,
  EventStatus.FINISHED,
]);

/**
 * Policy deliberadamente deny-by-default para o agregado editorial da Divulgação.
 *
 * Regras importantes:
 * - VIEWER e OPERATOR não recebem mutação editorial por inferência de papel;
 * - somente DRAFT e SETUP são editáveis neste Gate;
 * - HOMOLOGATION congela o conteúdo para revisão e READY_TO_PUBLISH congela o
 *   conteúdo aprovado; correções exigem regressão explícita de estado pelo fluxo
 *   administrativo, evitando alteração silenciosa depois do Gate;
 * - eventos publicados, suspensos, finalizados ou cancelados não podem ter o
 *   conteúdo editorial alterado por este Lote 2;
 * - preview é leitura derivada e pode ser preparado em estados não editáveis,
 *   mas nunca em evento cancelado;
 * - autorização de tenant/evento continua obrigatória antes desta policy;
 * - mutações desconhecidas são sempre negadas, mesmo em papel/estado permitidos.
 */
export function canMutateEventPublication(input: EventPublicationPolicyInput): boolean {
  if (!MUTATING_ROLES.has(input.role)) return false;

  switch (input.mutation) {
    case 'PREPARE_PREVIEW':
      return PREVIEWABLE_EVENT_STATUSES.has(input.eventStatus);
    case 'UPDATE_EDITORIAL':
    case 'UPDATE_SECTIONS':
    case 'UPDATE_THEME':
      return EDITABLE_EVENT_STATUSES.has(input.eventStatus);
    default:
      return false;
  }
}

/**
 * Uma repetição da mesma intenção já concluída é uma leitura idempotente:
 * não altera estado, não incrementa revisão e não duplica auditoria.
 *
 * A autorização permanece equivalente à ação que alcança cada destino.
 */
export function canRepeatEventPublicationTransition(
  input: EventPublicationRepeatTransitionInput,
): boolean {
  if (input.status === EventStatus.SETUP || input.status === EventStatus.HOMOLOGATION) {
    return MUTATING_ROLES.has(input.role);
  }
  if (input.status === EventStatus.READY_TO_PUBLISH || input.status === EventStatus.PUBLISHED) {
    return APPROVER_ROLES.has(input.role);
  }
  return false;
}

/**
 * Máquina de estados explícita da Divulgação.
 *
 * MANAGER pode preparar e devolver a homologação. Somente OWNER/ADMIN aprovam
 * o Gate e publicam. Qualquer transição não declarada permanece negada.
 */
export function canTransitionEventPublication(input: EventPublicationTransitionInput): boolean {
  const { role, fromStatus, toStatus } = input;

  if (fromStatus === EventStatus.SETUP && toStatus === EventStatus.HOMOLOGATION) {
    return MUTATING_ROLES.has(role);
  }
  if (fromStatus === EventStatus.HOMOLOGATION && toStatus === EventStatus.SETUP) {
    return MUTATING_ROLES.has(role);
  }
  if (fromStatus === EventStatus.HOMOLOGATION && toStatus === EventStatus.READY_TO_PUBLISH) {
    return APPROVER_ROLES.has(role);
  }
  if (fromStatus === EventStatus.READY_TO_PUBLISH && toStatus === EventStatus.SETUP) {
    return APPROVER_ROLES.has(role);
  }
  if (fromStatus === EventStatus.READY_TO_PUBLISH && toStatus === EventStatus.PUBLISHED) {
    return APPROVER_ROLES.has(role);
  }
  return false;
}
