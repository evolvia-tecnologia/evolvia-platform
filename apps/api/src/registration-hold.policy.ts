export const REGISTRATION_HOLD_CAPABILITY = 'registration_hold';
export const HOLD_MINUTE_OPTIONS = [15, 20, 30, 45, 60] as const;
export const DEFAULT_HOLD_MINUTES = 20;
export const SUGGESTED_HOLD_MINUTES = 15;

export type HoldMinutes = (typeof HOLD_MINUTE_OPTIONS)[number];

export class RegistrationHoldPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationHoldPolicyError';
  }
}

export function isHoldMinutes(value: unknown): value is HoldMinutes {
  return typeof value === 'number' && Number.isInteger(value) && HOLD_MINUTE_OPTIONS.some((option) => option === value);
}

export function readHoldMinutes(status: string | null | undefined, config: unknown): number {
  if (status !== 'ACTIVE' || !config || typeof config !== 'object' || Array.isArray(config)) return DEFAULT_HOLD_MINUTES;
  const minutes = (config as { minutes?: unknown }).minutes;
  return isHoldMinutes(minutes) ? minutes : DEFAULT_HOLD_MINUTES;
}

export function normalizeHoldMinutes(input: unknown): HoldMinutes {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RegistrationHoldPolicyError('Informe os minutos da reserva.');
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 1 || keys[0] !== 'minutes' || !isHoldMinutes(record.minutes)) {
    throw new RegistrationHoldPolicyError('Escolha 15, 20, 30, 45 ou 60 minutos.');
  }
  return record.minutes;
}
