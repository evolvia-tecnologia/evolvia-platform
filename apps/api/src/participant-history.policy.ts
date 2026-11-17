import { ParticipantAreaPolicyError, participantHash } from './participant-area-policy';

export const HISTORY_RECOVERY_MESSAGE = 'Se este documento já tiver um histórico verificado, a confirmação segue para o e-mail comprovado. Nenhum evento, nome ou e-mail é mostrado antes dessa confirmação.';
export const HISTORY_CONFIRM_FAILURE = 'Não foi possível confirmar o histórico.';
export const HISTORY_GRANT_RECOVERY_CONSENT = 'RECOVERY_CONSENT';

export function hasRecoveryConsent(source: string | null | undefined): boolean {
  return source === HISTORY_GRANT_RECOVERY_CONSENT;
}

const PASSPORT = /^[A-Z0-9]{5,12}$/u;
const COUNTRY = /^[A-Z]{2}$/u;

export type ParticipantDocumentKind = 'CPF' | 'PASSPORT';

export type ParticipantDocumentIdentity = {
  kind: ParticipantDocumentKind;
  normalized: string;
  country: string | null;
  identityHash: string;
  masked: string;
};

export function participantDocumentIdentity(input: {
  documentKind?: unknown;
  identityDocument?: unknown;
  issuerCountry?: unknown;
}): ParticipantDocumentIdentity {
  const kind = input.documentKind === 'CPF' || input.documentKind === 'PASSPORT' ? input.documentKind : null;
  if (!kind) throw new ParticipantAreaPolicyError('Escolha CPF ou passaporte.');
  if (typeof input.identityDocument !== 'string') throw new ParticipantAreaPolicyError('Informe um documento válido.');
  const compact = input.identityDocument.trim().toUpperCase().replace(/[\s.-]/gu, '');
  if (kind === 'CPF') {
    if (!/^[0-9]{11}$/u.test(compact) || /^(\d)\1{10}$/u.test(compact)) throw new ParticipantAreaPolicyError('CPF inválido.');
    for (const size of [9, 10]) {
      const sum = Array.from(compact.slice(0, size)).reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
      const remainder = (sum * 10) % 11;
      if (Number(compact[size]) !== (remainder === 10 ? 0 : remainder)) throw new ParticipantAreaPolicyError('CPF inválido.');
    }
    return { kind, normalized: compact, country: 'BR', identityHash: participantHash(compact), masked: `*********${compact.slice(-2)}` };
  }
  const country = typeof input.issuerCountry === 'string' ? input.issuerCountry.trim().toUpperCase() : '';
  if (!COUNTRY.test(country) || !PASSPORT.test(compact)) throw new ParticipantAreaPolicyError('Informe o passaporte e o país emissor.');
  return {
    kind,
    normalized: compact,
    country,
    identityHash: participantHash(`PASSPORT:${country}:${compact}`),
    masked: `${'*'.repeat(Math.max(3, compact.length - 2))}${compact.slice(-2)}`,
  };
}

export function includeReservation(input: {
  sameAccount: boolean;
  grantorControlled: boolean;
  confirmed: boolean;
}): boolean {
  if (input.grantorControlled && input.confirmed) return true;
  return input.sameAccount;
}

export function grantorControlsReservation(input: {
  identityHash: string;
  emailHash: string;
  grants: Array<{ identityHash: string; grantorEmailHash: string | null | undefined }>;
}): boolean {
  return input.grants.some((grant) => (
    grant.identityHash === input.identityHash && Boolean(grant.grantorEmailHash) && grant.grantorEmailHash === input.emailHash
  ));
}

export function selectRecoveryTargets(input: { verifiedUserIds: string[]; linkedUserIds: string[] }): string[] {
  return [...new Set([...input.linkedUserIds, ...input.verifiedUserIds].filter(Boolean))];
}

export function accumulateGrantorHashes(existing: string[] | null | undefined, next: string): string[] {
  return [...new Set([...(existing ?? []), next].filter(Boolean))];
}

export function historyFacts(input: { confirmed: boolean; presenceRecorded: boolean; presenceReversed: boolean }) {
  return {
    confirmed: input.confirmed,
    presence: input.presenceRecorded && !input.presenceReversed,
  };
}
