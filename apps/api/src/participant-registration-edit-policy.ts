import { createHash } from 'node:crypto';

export type RegistrationAnswer = string | number | boolean | string[];
export type ParticipantRegistrationPatch = {
  expectedRevision: number;
  updates: Record<string, RegistrationAnswer>;
};

type StoredField = {
  code?: unknown;
  label?: unknown;
  type?: unknown;
  enabled?: unknown;
  required?: unknown;
  options?: unknown;
};

export type EditableRegistrationField = {
  code: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'PHONE' | 'DATE' | 'NUMBER' | 'SELECT' | 'RADIO' | 'CHECKBOX' | 'CONSENT';
  required: boolean;
  options: Array<{ id: string; label: string }>;
  value: RegistrationAnswer | null;
};

export class ParticipantRegistrationEditPolicyError extends Error {}

const LOCKED_CODES = new Set([
  'identity_document', 'email', 'registration_type', 'terms_acceptance',
  'category', 'category_id', 'lot', 'lot_id', 'benefit_code',
  'payment', 'payment_status', 'billing', 'payer', 'recipient',
]);
const EDITABLE_TYPES = new Set(['TEXT', 'TEXTAREA', 'PHONE', 'DATE', 'NUMBER', 'SELECT', 'RADIO', 'CHECKBOX', 'CONSENT']);
const SAFE_KEY = /^[A-Za-z0-9._:-]{16,128}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{1,63}$/u;

function formTextHasInjection(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value) || /[<>`]|\$\{|javascript\s*:/iu.test(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function options(value: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    const item = record(option);
    return typeof item.id === 'string' && typeof item.label === 'string'
      ? [{ id: item.id, label: item.label }]
      : [];
  });
}

export function editableRegistrationFields(formValue: unknown, registrationValue: unknown): EditableRegistrationField[] {
  if (!Array.isArray(formValue)) throw new ParticipantRegistrationEditPolicyError('A ficha publicada está indisponível.');
  const registration = record(registrationValue);
  return formValue.flatMap((raw) => {
    const field = record(raw) as StoredField;
    const code = typeof field.code === 'string' ? field.code : '';
    const label = typeof field.label === 'string' ? field.label : '';
    const type = typeof field.type === 'string' ? field.type : '';
    if (!SAFE_CODE.test(code) || !label || field.enabled === false || LOCKED_CODES.has(code) || !EDITABLE_TYPES.has(type)) return [];
    return [{
      code,
      label,
      type: type as EditableRegistrationField['type'],
      required: field.required === true,
      options: options(field.options),
      value: normalizeStoredValue(registration[code]),
    }];
  });
}

function normalizeStoredValue(value: unknown): RegistrationAnswer | null {
  if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  return null;
}

function normalizeValue(field: EditableRegistrationField, value: unknown): RegistrationAnswer {
  if (field.type === 'CONSENT') {
    if (typeof value !== 'boolean') throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
    return value;
  }
  if (field.type === 'NUMBER') {
    if (value === '' || value === null || value === undefined) {
      if (field.required) throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
      return '';
    }
    if (typeof value !== 'number' && typeof value !== 'string') throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1_000_000) throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
    return number;
  }
  if (field.type === 'CHECKBOX') {
    if (!Array.isArray(value) || value.length > 50 || value.some((item) => typeof item !== 'string' || item.length > 200)) {
      throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
    }
    const allowed = new Set(field.options.map((item) => item.id));
    const normalized = [...new Set(value.map((item) => item.trim()))];
    if (field.required && normalized.length < 1) throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
    if (normalized.some((item) => formTextHasInjection(item)) || (allowed.size && normalized.some((item) => !allowed.has(item)))) {
      throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
    }
    return normalized;
  }
  if (typeof value !== 'string') throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  const max = field.type === 'TEXTAREA' ? 2_000 : 240;
  if ((field.required && normalized.length < 1) || normalized.length > max || formTextHasInjection(normalized)) {
    throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
  }
  if ((field.type === 'SELECT' || field.type === 'RADIO') && normalized !== '' && !field.options.some((item) => item.id === normalized)) {
    throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
  }
  if (field.type === 'DATE' && normalized && !/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new ParticipantRegistrationEditPolicyError(`Revise o campo “${field.label}”.`);
  }
  return normalized;
}

export function normalizeParticipantRegistrationPatch(
  inputValue: unknown,
  fields: EditableRegistrationField[],
): ParticipantRegistrationPatch {
  const input = record(inputValue);
  if (!Number.isInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) {
    throw new ParticipantRegistrationEditPolicyError('Atualize a ficha antes de salvar novamente.');
  }
  const rawUpdates = record(input.updates);
  const entries = Object.entries(rawUpdates);
  if (entries.length < 1 || entries.length > 30) throw new ParticipantRegistrationEditPolicyError('Altere ao menos um campo da inscrição.');
  const byCode = new Map(fields.map((field) => [field.code, field]));
  const updates: Record<string, RegistrationAnswer> = {};
  for (const [code, value] of entries) {
    const field = byCode.get(code);
    if (!field || LOCKED_CODES.has(code)) throw new ParticipantRegistrationEditPolicyError('A tentativa inclui um campo protegido da inscrição.');
    updates[code] = normalizeValue(field, value);
  }
  return { expectedRevision: Number(input.expectedRevision), updates };
}

export function normalizeParticipantEditIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim() ?? '';
  if (!SAFE_KEY.test(normalized)) throw new ParticipantRegistrationEditPolicyError('Envie uma Idempotency-Key válida.');
  return normalized;
}

export function participantEditHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function participantEditPayloadHash(patch: ParticipantRegistrationPatch): string {
  const ordered = Object.fromEntries(Object.entries(patch.updates).sort(([left], [right]) => left.localeCompare(right)));
  return participantEditHash(JSON.stringify({ expectedRevision: patch.expectedRevision, updates: ordered }));
}
