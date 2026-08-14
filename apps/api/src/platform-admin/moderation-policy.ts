import { EventStatus } from '@prisma/client';

export const PLATFORM_STAFF_ROLES = [
  'SUPER_ADMIN',
  'TRUST_SAFETY',
  'SUPPORT',
  'ANALYST',
] as const;

export type PlatformStaffRole = (typeof PLATFORM_STAFF_ROLES)[number];

export const MODERATION_ACTIONS = [
  'OPEN_CASE',
  'ASSIGN_CASE',
  'ADD_NOTE',
  'ESCALATE',
  'SUSPEND_EVENT',
  'RESTORE_EVENT',
  'MARK_FINISHED',
  'CANCEL_EVENT',
  'DISMISS_CASE',
  'RESOLVE_CASE',
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

const ROLE_ACTIONS: Record<PlatformStaffRole, ReadonlySet<ModerationAction>> = {
  SUPER_ADMIN: new Set(MODERATION_ACTIONS),
  TRUST_SAFETY: new Set([
    'OPEN_CASE',
    'ASSIGN_CASE',
    'ADD_NOTE',
    'ESCALATE',
    'SUSPEND_EVENT',
    'RESTORE_EVENT',
    'MARK_FINISHED',
    'DISMISS_CASE',
    'RESOLVE_CASE',
  ]),
  SUPPORT: new Set(['OPEN_CASE', 'ADD_NOTE', 'ESCALATE']),
  ANALYST: new Set(),
};

const SUSPENDABLE_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.SETUP,
  EventStatus.HOMOLOGATION,
  EventStatus.READY_TO_PUBLISH,
  EventStatus.PUBLISHED,
]);

const RESTORABLE_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.SETUP,
  EventStatus.HOMOLOGATION,
  EventStatus.READY_TO_PUBLISH,
  EventStatus.PUBLISHED,
]);

const CANCELLABLE_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.SETUP,
  EventStatus.HOMOLOGATION,
  EventStatus.READY_TO_PUBLISH,
  EventStatus.PUBLISHED,
  EventStatus.SUSPENDED,
]);

export function canPerformModerationAction(role: PlatformStaffRole, action: ModerationAction): boolean {
  return ROLE_ACTIONS[role].has(action);
}

export function targetStatusForModerationAction(
  action: Extract<ModerationAction, 'SUSPEND_EVENT' | 'RESTORE_EVENT' | 'MARK_FINISHED' | 'CANCEL_EVENT'>,
  currentStatus: EventStatus,
  restoreStatus?: EventStatus,
): EventStatus {
  if (action === 'SUSPEND_EVENT') {
    if (!SUSPENDABLE_STATUSES.has(currentStatus)) {
      throw new Error(`EVENT_STATUS_NOT_SUSPENDABLE:${currentStatus}`);
    }
    return EventStatus.SUSPENDED;
  }

  if (action === 'RESTORE_EVENT') {
    if (currentStatus !== EventStatus.SUSPENDED) {
      throw new Error(`EVENT_STATUS_NOT_SUSPENDED:${currentStatus}`);
    }
    if (!restoreStatus || !RESTORABLE_STATUSES.has(restoreStatus)) {
      throw new Error(`EVENT_RESTORE_STATUS_INVALID:${restoreStatus ?? 'missing'}`);
    }
    return restoreStatus;
  }

  if (action === 'MARK_FINISHED') {
    if (currentStatus !== EventStatus.PUBLISHED) {
      throw new Error(`EVENT_STATUS_NOT_FINISHABLE:${currentStatus}`);
    }
    return EventStatus.FINISHED;
  }

  if (!CANCELLABLE_STATUSES.has(currentStatus)) {
    throw new Error(`EVENT_STATUS_NOT_CANCELLABLE:${currentStatus}`);
  }
  return EventStatus.CANCELLED;
}
