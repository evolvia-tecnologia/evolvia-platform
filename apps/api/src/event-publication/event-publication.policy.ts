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

const MUTATING_ROLES = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
]);

const EDITABLE_EVENT_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.SETUP,
  EventStatus.HOMOLOGATION,
  EventStatus.READY_TO_PUBLISH,
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
