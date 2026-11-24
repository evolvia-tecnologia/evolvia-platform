// Operator-only, read-only JMAP mailbox access. Record evidence solely for the configured test tenant and inbox.
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { credentialUrl, readRegistrationEmail } from './registration-confirmation-mail.policy';

export async function verifyConfirmationInbox(prisma: PrismaClient, reservationId: string, messageId: string, env = process.env, transport = fetch) {
  const org = env.EVOLVIA_TEST_MAIL_ORGANIZATION_ID;
  const recipient = env.EVOLVIA_TEST_MAIL_RECIPIENT;
  const accountId = env.EVOLVIA_TEST_MAIL_ACCOUNT_ID;
  const mailboxId = env.EVOLVIA_TEST_MAIL_INBOX_ID;
  const sender = env.EVOLVIA_EMAIL_FROM?.trim();
  const publicBaseUrl = env.EVOLVIA_PUBLIC_BASE_URL?.trim();
  const url = env.EVOLVIA_TEST_MAIL_JMAP_URL?.trim();
  if (!org?.trim() || !recipient?.trim() || !accountId?.trim() || !mailboxId?.trim() || !url ||
      !env.EVOLVIA_TEST_MAIL_TOKEN?.trim() || !sender || !publicBaseUrl || !reservationId?.trim() || !messageId?.trim()) throw new Error('Configuração de homologação incompleta.');
  let endpoint: URL;
  try { endpoint = new URL(url); }
  catch { throw new Error('Endpoint de caixa inválido.'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Endpoint de caixa inválido.');
  const row = await prisma.eventRegistrationReservation.findFirst({ where: { id: reservationId, organizationId: org,
    event: { organizationId: org } }, select: { eventId: true, protocol: true, registrationData: true, event: { select: { slug: true } } } });
  if (!row || readRegistrationEmail(row.registrationData) !== recipient) throw new Error('Inscrição fora da caixa autorizada.');
  const scope = { organizationId: org, eventId: row.eventId, entityId: reservationId, entityType: 'EventRegistrationReservation' };
  const accepted = await prisma.auditLog.findFirst({ where: { ...scope, action: 'registration.confirmation_email_accepted' }, select: { id: true } });
  if (!accepted) throw new Error('Aceite do transporte pendente.');
  const properties = ['id','mailboxIds','from','to','subject','textBody','bodyValues'];
  const response = await transport(endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: { Authorization: 'Bearer ' + env.EVOLVIA_TEST_MAIL_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ using: ['urn:ietf:params:jmap:core','urn:ietf:params:jmap:mail'],
      methodCalls: [['Email/get', { accountId, ids: [messageId], properties, fetchTextBodyValues: true, maxBodyValueBytes: 8192 }, 'verify']] }) });
  if (!response.ok) throw new Error('Consulta à caixa indisponível.');
  const result = (await response.json())?.methodResponses?.[0];
  const data = result?.[1];
  const mail = data?.list?.[0];
  const link = credentialUrl(publicBaseUrl, row.event.slug, row.protocol);
  if (result?.[0] !== 'Email/get' || result?.[2] !== 'verify' || data?.accountId !== accountId ||
      data.list?.length !== 1 || mail?.id !== messageId || mail.mailboxIds?.[mailboxId] !== true ||
      mail.from?.length !== 1 || mail.from[0].email !== sender || mail.to?.length !== 1 || mail.to[0].email !== recipient ||
      mail.subject !== 'Sua inscrição foi confirmada' || !link || !Array.isArray(mail.textBody) || !mail.textBody.some((part: { partId?: string } | null) => {
        if (typeof part?.partId !== 'string') return false;
        const body = mail.bodyValues?.[part.partId];
        const lines = typeof body?.value === 'string' ? body.value.split(/\r?\n/u) : [];
        return !body?.isTruncated && !body?.isEncodingProblem && lines.includes('Protocolo: ' + row.protocol) && lines.includes('Acompanhe a inscrição: ' + link);
      })) throw new Error('A mensagem não comprova esta confirmação na caixa autorizada.');
  const id = createHash('sha256').update(JSON.stringify(['sandbox-confirmation-received-v1',org,row.eventId,reservationId])).digest('hex');
  const evidenceHash = createHash('sha256').update(JSON.stringify([endpoint.origin, accountId, mailboxId, messageId])).digest('hex');
  const inserted = await prisma.auditLog.createMany({ data: [{ id, ...scope, action: 'registration.confirmation_test_inbox_received',
    metadata: { environment: 'TEST', received: true, evidence: 'authenticated_mailbox_read', evidenceHash } }], skipDuplicates: true });
  if (inserted.count === 0) {
    const sameMessage = await prisma.auditLog.findFirst({
      where: { id, ...scope, action: 'registration.confirmation_test_inbox_received',
        metadata: { path: ['evidenceHash'], equals: evidenceHash } },
      select: { id: true },
    });
    if (!sameMessage) throw new Error('A evidência registrada corresponde a outra mensagem.');
  }
  return { environment: 'TEST', received: true, evidenceHash };
}

export async function runInboxVerification() {
  const prisma = new PrismaClient();
  try { console.log(JSON.stringify(await verifyConfirmationInbox(prisma, process.argv[2], process.argv[3]))); }
  // Não registrar erros brutos: o transporte pode incluir endpoint, tokens, SQL ou PII.
  catch { console.error('Recebimento na caixa de homologação não comprovado.'); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}

// A execução CLI fica exclusivamente no script ESM verify-confirmation-inbox.mjs.
