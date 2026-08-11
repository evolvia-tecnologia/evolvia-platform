export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter pelo menos 8 caracteres, uma letra maiúscula, um número e um símbolo.';

export type PasswordRequirement =
  | 'MIN_LENGTH'
  | 'UPPERCASE'
  | 'NUMBER'
  | 'SYMBOL';

const UPPERCASE_PATTERN = /\p{Lu}/u;
const NUMBER_PATTERN = /\p{N}/u;
const SYMBOL_PATTERN = /[^\p{L}\p{N}\s]/u;

export function getPasswordPolicyViolations(password: string): PasswordRequirement[] {
  const violations: PasswordRequirement[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) violations.push('MIN_LENGTH');
  if (!UPPERCASE_PATTERN.test(password)) violations.push('UPPERCASE');
  if (!NUMBER_PATTERN.test(password)) violations.push('NUMBER');
  if (!SYMBOL_PATTERN.test(password)) violations.push('SYMBOL');

  return violations;
}

export function isPasswordStrong(password: string): boolean {
  return getPasswordPolicyViolations(password).length === 0;
}
