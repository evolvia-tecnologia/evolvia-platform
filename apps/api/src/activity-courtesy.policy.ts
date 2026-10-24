export const ACTIVITY_COURTESY_CODE = 'activity_courtesy';

export class ActivityCourtesyPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityCourtesyPolicyError';
  }
}

export type ActivityCourtesyQuota = { activityId: string; count: number };

export function normalizeCourtesyQuotas(input: unknown): ActivityCourtesyQuota[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ActivityCourtesyPolicyError('Informe as cortesias da atividade.');
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'quotas' || !Array.isArray(record.quotas)) {
    throw new ActivityCourtesyPolicyError('Informe somente as cortesias da atividade.');
  }
  if (record.quotas.length > 200) throw new ActivityCourtesyPolicyError('Informe no máximo 200 atividades.');
  const seen = new Set<string>();
  const quotas: ActivityCourtesyQuota[] = [];
  for (const item of record.quotas) {
    const quota = oneQuota(item);
    if (seen.has(quota.activityId)) throw new ActivityCourtesyPolicyError('Cada atividade aparece uma vez.');
    seen.add(quota.activityId);
    if (quota.count > 0) quotas.push(quota);
  }
  return quotas;
}

export function readCourtesyQuotas(config: unknown): ActivityCourtesyQuota[] {
  try {
    return normalizeCourtesyQuotas(config);
  } catch {
    return [];
  }
}

export function normalizeCourtesyDecision(input: unknown): boolean {
  if (input == null) return false;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ActivityCourtesyPolicyError('Informe se a confirmação usa cortesia.');
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return false;
  if (keys.length !== 1 || keys[0] !== 'courtesy' || typeof record.courtesy !== 'boolean') {
    throw new ActivityCourtesyPolicyError('Informe se a confirmação usa cortesia.');
  }
  return record.courtesy;
}

function oneQuota(item: unknown): ActivityCourtesyQuota {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new ActivityCourtesyPolicyError('Informe a atividade e a quantidade da cortesia.');
  }
  const record = item as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'activityId,count') {
    throw new ActivityCourtesyPolicyError('Informe somente a atividade e a quantidade da cortesia.');
  }
  if (typeof record.activityId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/u.test(record.activityId)) {
    throw new ActivityCourtesyPolicyError('A atividade informada não é válida.');
  }
  if (typeof record.count !== 'number' || !Number.isInteger(record.count) || record.count < 0 || record.count > 500) {
    throw new ActivityCourtesyPolicyError('A cortesia vai de 0 a 500 lugares.');
  }
  return { activityId: record.activityId, count: record.count };
}
