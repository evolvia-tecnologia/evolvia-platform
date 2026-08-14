export const MODERATION_CASE_STATUSES = [
  'OPEN',
  'IN_REVIEW',
  'ACTION_REQUIRED',
  'RESOLVED',
  'DISMISSED',
] as const;

export type ModerationCaseStatus = (typeof MODERATION_CASE_STATUSES)[number];

export const MODERATION_REASONS = [
  'SUSPECTED_FRAUD',
  'IMPERSONATION',
  'MISLEADING_CONTENT',
  'PAYMENT_RISK',
  'ILLEGAL_CONTENT',
  'SPAM',
  'DUPLICATE',
  'SECURITY',
  'ABUSE',
  'PAST_EVENT',
  'OTHER',
] as const;

export type ModerationReason = (typeof MODERATION_REASONS)[number];

export const MODERATION_SIGNAL_SOURCES = [
  'STAFF',
  'USER_REPORT',
  'AUTOMATED_SIGNAL',
  'SYSTEM_LIFECYCLE',
] as const;

export type ModerationSignalSource = (typeof MODERATION_SIGNAL_SOURCES)[number];

export const MODERATION_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ModerationSeverity = (typeof MODERATION_SEVERITIES)[number];

const CASE_TRANSITIONS: Record<ModerationCaseStatus, ReadonlySet<ModerationCaseStatus>> = {
  OPEN: new Set(['IN_REVIEW', 'ACTION_REQUIRED', 'RESOLVED', 'DISMISSED']),
  IN_REVIEW: new Set(['ACTION_REQUIRED', 'RESOLVED', 'DISMISSED']),
  ACTION_REQUIRED: new Set(['IN_REVIEW', 'RESOLVED', 'DISMISSED']),
  RESOLVED: new Set(),
  DISMISSED: new Set(),
};

export function canTransitionModerationCase(
  currentStatus: ModerationCaseStatus,
  nextStatus: ModerationCaseStatus,
): boolean {
  if (currentStatus === nextStatus) return false;
  return CASE_TRANSITIONS[currentStatus].has(nextStatus);
}

export function assertModerationReason(reason: string): asserts reason is ModerationReason {
  if (!(MODERATION_REASONS as readonly string[]).includes(reason)) {
    throw new Error(`MODERATION_REASON_INVALID:${reason}`);
  }
}

export function normalizeModerationSummary(summary: string): string {
  const normalized = summary.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (normalized.length < 3 || normalized.length > 500) {
    throw new Error('MODERATION_SUMMARY_INVALID_LENGTH');
  }
  return normalized;
}

export function normalizeModerationActionReason(reason: string): string {
  const normalized = reason.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (normalized.length < 5 || normalized.length > 1000) {
    throw new Error('MODERATION_ACTION_REASON_INVALID_LENGTH');
  }
  return normalized;
}
