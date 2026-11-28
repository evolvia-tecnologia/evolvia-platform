import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { communicationOutboxKey } from './event-communication-batch.policy';
import { readDeliveryConfig, readRegistrationEmail } from './registration-confirmation-mail.policy';

export function bulkDeliveryConfig(env = process.env) {
  const delivery = readDeliveryConfig(env);
  const eventId = env.EVOLVIA_COMMUNICATION_EVENT_ID?.trim();
  const organizationId = env.EVOLVIA_COMMUNICATION_ORGANIZATION_ID?.trim();
  const mailbox = readRegistrationEmail({ email: env.EVOLVIA_COMMUNICATION_TEST_MAILBOX });
  if (env.EVOLVIA_COMMUNICATION_DELIVERY_ENABLED !== '1' || !organizationId || !eventId || !mailbox ||
      delivery?.publicBaseUrl !== 'https://homologacao.evolviatecnologia.com') return null;
  try {
    return { ...delivery, eventId, organizationId, mailbox, key: communicationOutboxKey(env.EVOLVIA_COMMUNICATION_OUTBOX_KEY) };
  } catch { return null; }
}

export function bulkKey(organizationId: string, eventId: string, batchId: string, recipientId: string) {
  return createHash('sha256').update(JSON.stringify(['bulk-v1', organizationId, eventId, batchId, recipientId])).digest('hex');
}

export async function postBulkMessage(request: Request): Promise<number> {
  const response = await fetch(request);
  try { return response.status; }
  finally { await response.body?.cancel().catch(() => undefined); }
}

// The mailbox verifier signs these exact fields only AFTER it has located the
// recipient-specific idempotency key in the authorized inbox. No message content
// or mailbox address is stored in the receipt or exposed by the API.
export function validBulkReceipt(key: string | undefined, signature: string | undefined, scope: {
  organizationId: string; eventId: string; batchId: string; recipientId: string;
}, evidenceHash: unknown): evidenceHash is string {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/i.test(key) ||
      typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature) ||
      typeof evidenceHash !== 'string' || !/^[a-f0-9]{64}$/.test(evidenceHash)) return false;
  const canonical = JSON.stringify(['bulk-mailbox-received-v1', scope.organizationId, scope.eventId,
    scope.batchId, scope.recipientId, evidenceHash]);
  const expected = createHmac('sha256', Buffer.from(key, 'hex')).update(canonical).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
