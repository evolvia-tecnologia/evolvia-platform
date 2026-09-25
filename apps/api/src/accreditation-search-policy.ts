export type AccreditationSearchKind = 'NAME' | 'DOCUMENT' | 'EMAIL' | 'CATEGORY' | 'PROTOCOL';
export type AccreditationSearchInput = { kind: AccreditationSearchKind; value: string; page: number };

export class AccreditationSearchInputError extends Error {}

const kinds = new Set<AccreditationSearchKind>(['NAME', 'DOCUMENT', 'EMAIL', 'CATEGORY', 'PROTOCOL']);
const protocol = /^EVO-[A-F0-9]{16}$/u;
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function normalizeAccreditationSearch(input: unknown): AccreditationSearchInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AccreditationSearchInputError('Busca inválida.');
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !['kind', 'value', 'page'].includes(key))
    || !kinds.has(raw.kind as AccreditationSearchKind)
    || typeof raw.value !== 'string'
    || raw.value.length > 254
    || (raw.page !== undefined && (!Number.isInteger(raw.page) || Number(raw.page) < 1 || Number(raw.page) > 20))) {
    throw new AccreditationSearchInputError('Busca inválida.');
  }
  const kind = raw.kind as AccreditationSearchKind;
  const page = raw.page === undefined ? 1 : Number(raw.page);
  const value = raw.value.trim();
  switch (kind) {
    case 'NAME': {
      const name = value.replace(/\s+/gu, ' ');
      if (!/^[\p{L}\p{M} .'-]{3,80}$/u.test(name)) throw new AccreditationSearchInputError('Informe ao menos três letras do nome.');
      return { kind, value: name, page };
    }
    case 'DOCUMENT': {
      if (!/^[A-Za-z0-9 .\/-]{5,50}$/u.test(value)) throw new AccreditationSearchInputError('Documento inválido.');
      const document = value.replace(/[ .\/-]/gu, '').toUpperCase();
      if (document.length < 5 || document.length > 40) throw new AccreditationSearchInputError('Documento inválido.');
      if (/^\d{11}$/u.test(document)) {
        if (/^(\d)\1{10}$/u.test(document) || [9, 10].some((size) => {
          const sum = Array.from(document.slice(0, size)).reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
          const remainder = (sum * 10) % 11;
          return Number(document[size]) !== (remainder === 10 ? 0 : remainder);
        })) throw new AccreditationSearchInputError('CPF inválido.');
      }
      return { kind, value: document, page };
    }
    case 'EMAIL': {
      const normalized = value.toLowerCase();
      if (normalized.length > 254 || !email.test(normalized)) throw new AccreditationSearchInputError('E-mail inválido.');
      return { kind, value: normalized, page };
    }
    case 'CATEGORY':
      if (!/^[A-Za-z0-9_-]{8,64}$/u.test(value)) throw new AccreditationSearchInputError('Categoria inválida.');
      return { kind, value, page };
    case 'PROTOCOL': {
      const normalized = value.toUpperCase();
      if (!protocol.test(normalized)) throw new AccreditationSearchInputError('Protocolo inválido.');
      return { kind, value: normalized, page };
    }
  }
}
