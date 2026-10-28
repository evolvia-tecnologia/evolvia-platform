import { createHash } from 'node:crypto';
import type { ScientificAuthorNoticeKind } from '@prisma/client';
import { readRegistrationEmail } from './registration-confirmation-mail.policy';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const normalize = (value: string) => value.replace(/[\r\n\t]+/gu, ' ').trim().slice(0, 180);
const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));

export function scientificNoticeStart(env: NodeJS.ProcessEnv): Date | null {
  // Exclude historical notices when a specific event is explicitly authorized.
  const value = env.EVOLVIA_SCIENTIFIC_NOTICE_NOT_BEFORE?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function scientificMailEnabled(
  env: NodeJS.ProcessEnv, scope: { organizationId: string; eventId: string },
): boolean {
  // A global flag alone is never permission to email every tenant's scientific authors.
  return env.EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED === '1'
    && Boolean(env.EVOLVIA_SCIENTIFIC_NOTICE_ORGANIZATION_ID?.trim())
    && Boolean(env.EVOLVIA_SCIENTIFIC_NOTICE_EVENT_ID?.trim())
    && env.EVOLVIA_SCIENTIFIC_NOTICE_ORGANIZATION_ID?.trim() === scope.organizationId
    && env.EVOLVIA_SCIENTIFIC_NOTICE_EVENT_ID?.trim() === scope.eventId
    && scientificNoticeStart(env) !== null;
}

export function scientificNoticeRecipients(rows: ReadonlyArray<{ person?: { email: string | null } | null }>): string[] {
  const contacts = new Set<string>();
  for (const row of rows) {
    const email = readRegistrationEmail({ email: row.person?.email });
    if (email) contacts.add(email);
  }
  return [...contacts].slice(0, 30);
}

export function scientificNoticeKey(input: {
  organizationId: string; eventId: string; submissionId: string; versionNumber: number; recipient: string;
}): string {
  // Stable across retries. The provider must honor this idempotency key.
  return createHash('sha256').update([
    'scientific-author-notice-v1', input.organizationId, input.eventId,
    input.submissionId, String(input.versionNumber), input.recipient,
  ].join(':')).digest('hex');
}

export function scientificNoticeMessage(input: {
  eventName: string; title: string; submitterName: string; kind: ScientificAuthorNoticeKind;
  versionNumber: number; recipient: string; sender: string; publicBaseUrl: string; slug: string;
}) {
  if (!SAFE_SLUG.test(input.slug) || input.slug.length > 80) throw new Error('Evento inválido para o aviso.');
  if (!Number.isSafeInteger(input.versionNumber) || input.versionNumber < 1) throw new Error('Versão científica inválida.');
  if (input.kind !== 'SUBMITTED' && input.kind !== 'CORRECTED') throw new Error('Tipo de aviso inválido.');
  const recipient = readRegistrationEmail({ email: input.recipient });
  const sender = readRegistrationEmail({ email: input.sender });
  if (!recipient || !sender) throw new Error('Endereço de e-mail inválido.');
  const url = new URL(`/evento/${input.slug}`, input.publicBaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a URL pública HTTPS.');
  const event = normalize(input.eventName);
  const title = normalize(input.title);
  const submitter = normalize(input.submitterName);
  const action = input.kind === 'SUBMITTED' ? 'submetido' : 'corrigido';
  const subject = input.kind === 'SUBMITTED' ? 'Trabalho científico submetido' : 'Trabalho científico corrigido';
  const lines = [
    `O trabalho científico "${title}" foi ${action} por ${submitter} no evento ${event}.`,
    `Versão: ${input.versionNumber}.`,
    'Acompanhe as informações entrando na sua área do participante.',
    `Evento: ${url.toString()}`,
    'Esta mensagem não contém pareceres, notas, CPF ou dados de outros autores.',
  ];
  return {
    schema: 'evolvia.transactional-email.v1',
    message: {
      from: sender,
      to: [recipient],
      subject,
      text: lines.join('\n'),
      html: `<p>O trabalho científico <strong>${escapeHtml(title)}</strong> foi ${action} por ${escapeHtml(submitter)} no evento ${escapeHtml(event)}.</p><p>Versão: ${input.versionNumber}.</p><p>Consulte sua área do participante. <a href="${escapeHtml(url.toString())}">Abrir evento</a>.</p><p>Esta mensagem não contém pareceres, notas, CPF ou dados de outros autores.</p>`,
    },
    metadata: { purpose: 'scientific_author_notice', version: input.versionNumber, kind: input.kind },
  };
}
