/** Normalize new submissions; historical answers are never rewritten in place. */
export function normalizeRegistrationPhone(value: string): string {
  if (!/^(?:\+)?[\d\s().-]+$/u.test(value.trim())) throw new Error('Informe um telefone válido com DDI, DDD e número.');
  let digits = value.replace(/\D/gu, '');
  if (!value.trim().startsWith('+')) {
    if (/^55\d{10,11}$/u.test(digits)) digits = digits.slice(2);
    if (!/^\d{10,11}$/u.test(digits)) throw new Error('Informe o DDD e o número ou use +DDI para outro país.');
    digits = `55${digits}`;
  }
  if (!/^[1-9]\d{6,14}$/u.test(digits)) throw new Error('Informe um telefone internacional com até 15 dígitos.');
  if (digits.startsWith('55') && !/^55[1-9][1-9](?:[2-5]\d{7}|9\d{8})$/u.test(digits)) {
    throw new Error('Informe o DDD com 2 dígitos e o número com 8 ou 9 dígitos.');
  }
  return `+${digits}`;
}
