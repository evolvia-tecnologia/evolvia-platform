export const ACTIVITY_ENROLLMENT_LIMIT_CODE = 'activity_enrollment_limit';

export class ActivityEnrollmentLimitPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityEnrollmentLimitPolicyError';
  }
}

export type ActivityEnrollmentLimit = { max: number | null; confirmByOrganization: boolean };

export function normalizeEnrollmentLimit(input: unknown): ActivityEnrollmentLimit {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ActivityEnrollmentLimitPolicyError('Informe o limite de atividades.');
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (!keys.includes('max') || keys.some((key) => key !== 'max' && key !== 'confirmByOrganization')) {
    throw new ActivityEnrollmentLimitPolicyError('Informe somente o limite de atividades e se a organização confirma o horário.');
  }
  return { max: maxOf(record.max), confirmByOrganization: confirmationOf(record.confirmByOrganization) };
}

export function readEnrollmentLimit(config: unknown): number | null {
  return readEnrollmentRule(config).max;
}

export function readEnrollmentRule(config: unknown): ActivityEnrollmentLimit {
  try {
    return normalizeEnrollmentLimit(config);
  } catch {
    return { max: null, confirmByOrganization: false };
  }
}

function confirmationOf(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') {
    throw new ActivityEnrollmentLimitPolicyError('Informe se a organização confirma o horário.');
  }
  return value;
}

function maxOf(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
    throw new ActivityEnrollmentLimitPolicyError('O limite vai de 1 a 20 atividades, ou fica sem teto.');
  }
  return value;
}
