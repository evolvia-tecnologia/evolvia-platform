import { Buffer } from 'node:buffer';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BCRYPT_BYTES = 72;

export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter pelo menos 8 caracteres, uma letra maiúscula, um número e um símbolo, sem ultrapassar o limite seguro de tamanho.';

export type PasswordRequirement =
  | 'MIN_LENGTH'
  | 'UPPERCASE'
  | 'NUMBER'
  | 'SYMBOL'
  | 'MAX_BYTES';

const UPPERCASE_PATTERN = /\p{Lu}/u;
const NUMBER_PATTERN = /\p{N}/u;
const SYMBOL_PATTERN = /[^\p{L}\p{N}\s]/u;

export function getPasswordCharacterLength(password: string): number {
  return Array.from(password).length;
}

export function getPasswordUtf8ByteLength(password: string): number {
  return Buffer.byteLength(password, 'utf8');
}

export function getPasswordPolicyViolations(password: string): PasswordRequirement[] {
  const violations: PasswordRequirement[] = [];

  if (getPasswordCharacterLength(password) < PASSWORD_MIN_LENGTH) violations.push('MIN_LENGTH');
  if (!UPPERCASE_PATTERN.test(password)) violations.push('UPPERCASE');
  if (!NUMBER_PATTERN.test(password)) violations.push('NUMBER');
  if (!SYMBOL_PATTERN.test(password)) violations.push('SYMBOL');
  if (getPasswordUtf8ByteLength(password) > PASSWORD_MAX_BCRYPT_BYTES) violations.push('MAX_BYTES');

  return violations;
}

export function isPasswordStrong(password: string): boolean {
  return getPasswordPolicyViolations(password).length === 0;
}
