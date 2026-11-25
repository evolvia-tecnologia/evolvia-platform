import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { inspectSandboxPayment, readSandboxPayment } from '../dist/asaas-sandbox-refund.js';

export async function verifySandboxRefund(db, eventId, requestId) {
  const organizationId = process.env.ASAAS_REFUND_SANDBOX_ORGANIZATION_ID;
  const token = process.env.ASAAS_REFUND_SANDBOX_TOKEN;
  if (!organizationId?.trim() || process.env.ASAAS_REFUND_SANDBOX_EXECUTION_ORGANIZATION_ID !== organizationId ||
      !token?.trim() || !eventId?.trim() || !requestId?.trim()) throw new Error('Configuração de homologação incompleta.');

  const [op] = await db.$queryRaw`
    SELECT op."requestId", op."paymentId", op."amountCents", op."reconciledAt",
      COALESCE(c."providerCheckoutId", g."providerCheckoutId") AS "checkoutId",
      COALESCE(c."amountCents", g."amountCents") AS "checkoutCents"
    FROM "SandboxRefundOperation" op JOIN "RegistrationRefundRequest" r ON r.id = op."requestId"
      AND r."organizationId" = op."organizationId" AND r."eventId" = op."eventId"
      AND r."sandboxPaymentId" = op."paymentId" AND r."preparedAmountCents" = op."amountCents"
    LEFT JOIN "EventRegistrationCheckout" c ON c.id = r."preparedCheckoutId"
      AND c."organizationId" = op."organizationId" AND c."eventId" = op."eventId"
    LEFT JOIN "EventRegistrationOrderCheckout" g ON g.id = r."preparedOrderCheckoutId"
      AND g."organizationId" = op."organizationId" AND g."eventId" = op."eventId"
    WHERE op."organizationId" = ${organizationId} AND op."eventId" = ${eventId} AND op."requestId" = ${requestId}
      AND op.status = 'RECONCILED' AND op."reconciledAt" IS NOT NULL AND r.status = 'APPROVED'
      AND ((c.id IS NULL) <> (g.id IS NULL))`;
  if (!op?.checkoutId) throw new Error('Conciliação local indisponível.');
  const observed = inspectSandboxPayment(op, await readSandboxPayment(op.paymentId, token));
  if (!observed.matched || observed.status !== 'RECONCILED') throw new Error('Confirmação do provedor pendente.');

  const evidenceHash = createHash('sha256').update(JSON.stringify([
    'asaas-sandbox-refund-v1', organizationId, eventId, requestId, op.checkoutId,
    op.paymentId, op.amountCents, op.reconciledAt.toISOString(),
  ])).digest('hex');
  return { environment: 'SANDBOX', status: 'RECONCILED', amountCents: op.amountCents, evidenceHash };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient();
  try { console.log(JSON.stringify(await verifySandboxRefund(db, process.argv[2], process.argv[3]))); }
  catch { console.error('Conciliação do Pix de homologação não comprovada.'); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}
