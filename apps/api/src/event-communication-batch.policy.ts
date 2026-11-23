import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { communicationAudienceInput } from './event-communication-audience.policy';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

export function normalizeCommunicationBatch(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Informe os dados do lote.');
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).some(key => !['id', 'draftId', 'draftRevision', 'filters'].includes(key))) {
    throw new Error('Parâmetro desconhecido no lote.');
  }
  if (typeof row.id !== 'string' || !UUID.test(row.id) ||
      typeof row.draftId !== 'string' || !UUID.test(row.draftId)) throw new Error('Identificador ou rascunho inválido.');
  if (typeof row.draftRevision !== 'number' || !Number.isSafeInteger(row.draftRevision) || row.draftRevision < 1) {
    throw new Error('Informe a revisão salva do rascunho.');
  }
  const filters = communicationAudienceInput(row.filters ?? {});
  if (filters.audience !== 'CONFIRMED_REGISTRATIONS' || filters.page !== 1) {
    throw new Error('Este lote exige inscritos confirmados e uma audiência sem paginação.');
  }
  return { id: row.id, draftId: row.draftId, draftRevision: row.draftRevision, filters };
}

export function communicationBatchPayloadHash(organizationId: string, eventId: string,
  input: ReturnType<typeof normalizeCommunicationBatch>): string {
  return createHash('sha256').update(JSON.stringify([
    'evolvia-communication-prepared-v1', organizationId, eventId, input.draftId, input.draftRevision, input.filters,
  ])).digest('hex');
}

export type RecipientScope = { organizationId: string; eventId: string; batchId: string };

export function communicationOutboxKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/_=-]+$/u.test(value)) throw new Error('Cofre de destinatários não configurado.');
  const raw = Buffer.from(value, 'base64');
  if (raw.length !== 32) throw new Error('Cofre de destinatários não configurado.');
  return raw;
}

function derivedKey(key: Buffer, purpose: string): Buffer {
  return createHmac('sha256', key).update('evolvia-communication/' + purpose).digest();
}

function aad(scope: RecipientScope): Buffer {
  return Buffer.from(JSON.stringify(['evolvia-communication-aad-v1', scope.organizationId, scope.eventId, scope.batchId]));
}

export function sealCommunicationRecipient(email: string, scope: RecipientScope, key: Buffer) {
  const canonical = email.trim().toLowerCase();
  if (!canonical || canonical.length > 254 || /[\u0000-\u001f<>]/u.test(canonical)) throw new Error('Destinatário inválido.');
  const emailFingerprint = createHmac('sha256', derivedKey(key, 'email-index-v1'))
    .update(JSON.stringify([scope.organizationId, scope.eventId, scope.batchId, canonical])).digest('hex');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derivedKey(key, 'aes-gcm-v1'), nonce);
  cipher.setAAD(aad(scope));
  const encrypted = Buffer.concat([cipher.update(canonical, 'utf8'), cipher.final()]);
  const emailEnvelope = [nonce, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
  return { emailFingerprint, emailEnvelope };
}

export function openCommunicationRecipient(envelope: string, scope: RecipientScope, key: Buffer): string {
  const parts = envelope.split('.');
  if (parts.length !== 3) throw new Error('Envelope inválido.');
  const [nonce, tag, payload] = parts.map(part => Buffer.from(part, 'base64url'));
  if (nonce.length !== 12 || tag.length !== 16) throw new Error('Envelope inválido.');
  const decipher = createDecipheriv('aes-256-gcm', derivedKey(key, 'aes-gcm-v1'), nonce);
  decipher.setAAD(aad(scope));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
}
