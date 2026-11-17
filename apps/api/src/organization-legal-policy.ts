export type LegalProfileInput = {
  kind: 'PERSON' | 'COMPANY';
  legalName: string;
  tradeName?: string;
  taxId: string;
  contactEmail: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  asaasWalletId?: string | null;
};

export class LegalProfileError extends Error {}

function required(value: string, label: string, max: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > max || /[<>\u0000-\u001f]/.test(normalized)) {
    throw new LegalProfileError(`Informe ${label} válido.`);
  }
  return normalized;
}

function optional(value: string | undefined, label: string, max: number): string | null {
  if (!value) return null;
  return required(value, label, max);
}

function cpfValid(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (let length = 9; length <= 10; length++) {
    const sum = [...value.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const check = (sum * 10) % 11 % 10;
    if (check !== Number(value[length])) return false;
  }
  return true;
}

function cnpjValid(value: string): boolean {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || /^(.)\1{13}$/.test(value)) return false;
  const weights = [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ];
  for (let index = 0; index < 2; index++) {
    const sum = [...value.slice(0, 12 + index)].reduce(
      (total, char, position) => total + (char.charCodeAt(0) - 48) * weights[index][position], 0,
    );
    const remainder = sum % 11;
    if (Number(value[12 + index]) !== (remainder < 2 ? 0 : 11 - remainder)) return false;
  }
  return true;
}

export function normalizeLegalProfile(input: LegalProfileInput) {
  if (input.kind !== 'PERSON' && input.kind !== 'COMPANY') throw new LegalProfileError('Escolha pessoa física ou jurídica.');
  const taxId = input.taxId.toUpperCase().replace(/[.\-/\s]/g, '');
  if (input.kind === 'PERSON' ? !cpfValid(taxId) : !cnpjValid(taxId)) {
    throw new LegalProfileError(input.kind === 'PERSON' ? 'CPF inválido.' : 'CNPJ inválido.');
  }
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (contactEmail.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new LegalProfileError('Informe um e-mail de contato válido.');
  }
  const postalCode = input.postalCode.replace(/[\s-]/g, '');
  if (!/^\d{8}$/.test(postalCode)) throw new LegalProfileError('Informe um CEP válido.');
  const state = input.state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new LegalProfileError('Informe a UF com duas letras.');
  const number = input.number.trim();
  if (!/^[A-Za-z0-9/ -]{1,20}$/.test(number)) throw new LegalProfileError('Informe o número do endereço.');
  return {
    kind: input.kind,
    legalName: required(input.legalName, 'o nome ou razão social', 160),
    tradeName: input.kind === 'COMPANY' ? optional(input.tradeName, 'o nome fantasia', 160) : null,
    taxId,
    contactEmail,
    postalCode,
    street: required(input.street, 'o logradouro', 160),
    number,
    complement: optional(input.complement, 'o complemento', 100),
    district: required(input.district, 'o bairro', 100),
    city: required(input.city, 'a cidade', 100),
    state,
    country: 'BR',
    asaasWalletId: organizerWallet(input.asaasWalletId),
  };
}

function organizerWallet(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value.trim())) {
    throw new LegalProfileError('Informe o identificador da carteira Asaas. Não use chave de API, token nem senha.');
  }
  return value.trim().toLowerCase();
}
