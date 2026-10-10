export const ACTIVITY_ENROLLMENT_LIMIT_CODE = 'activity_enrollment_limit';

export class ActivityEnrollmentLimitPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityEnrollmentLimitPolicyError';
  }
}

export type ActivityEnrollmentLimit = { max: number | null };

export function normalizeEnrollmentLimit(input: unknown): ActivityEnrollmentLimit {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ActivityEnrollmentLimitPolicyError('Informe o limite de atividades.');
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'max') {
    throw new ActivityEnrollmentLimitPolicyError('Informe somente o limite de atividades.');
  }
  return { max: maxOf(record.max) };
}

export function readEnrollmentLimit(config: unknown): number | null {
  try {
    return normalizeEnrollmentLimit(config).max;
  } catch {
    return null;
  }
}

function maxOf(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
    throw new ActivityEnrollmentLimitPolicyError('O limite vai de 1 a 20 atividades, ou fica sem teto.');
  }
  return value;
}
