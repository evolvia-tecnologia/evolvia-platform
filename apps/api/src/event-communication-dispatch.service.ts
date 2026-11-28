import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EventCommunicationAudienceService } from './event-communication-audience.service';
import { openCommunicationRecipient } from './event-communication-batch.policy';
import { bulkDeliveryConfig, bulkKey, postBulkMessage, validBulkReceipt } from './event-communication-delivery';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';

type Scope = { organizationId: string; eventId: string };
type Config = NonNullable<ReturnType<typeof bulkDeliveryConfig>>;
type Outcome = 'ACCEPTED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED' | 'PENDING';
type Post = (request: Request) => Promise<number>;

@Injectable()
export class EventCommunicationDispatchService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(EventCommunicationDispatchService.name);
  constructor(private readonly prisma: PrismaService, private readonly audience: EventCommunicationAudienceService) {}

  onModuleInit() {
    if (!bulkDeliveryConfig()) return;
    const poll = () => { void this.drain().catch(() => this.logger.warn('communication_dispatch_poll_failed')); };
    this.timer = setInterval(poll, 15_000);
    this.timer.unref();
    poll();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async start(userId: string, eventId: string, batchId: string) {
    const config = bulkDeliveryConfig();
    if (!config || eventId !== config.eventId) throw new ServiceUnavailableException('Envio controlado indisponível.');
    const where = { id: batchId, eventId, organizationId: config.organizationId };
    return this.prisma.$transaction(async tx => {
      const authorized = await tx.organizationMembership.findFirst({ where: {
        organizationId: config.organizationId, organization: { status: 'ACTIVE' }, userId,
        status: 'ACTIVE', role: { in: [...EVENT_EDITOR_ROLES] },
      }, select: { id: true } });
      if (!authorized) throw new NotFoundException('Lote não encontrado.');
      const changed = await tx.eventCommunicationBatch.updateMany({ where: { ...where, status: 'PREPARED' },
        data: { status: 'SENDING', startedByUserId: userId } });
      const batch = await tx.eventCommunicationBatch.findFirst({ where, select: {
        id: true, draftId: true, draftRevision: true, recipientCount: true, status: true, createdAt: true, startedByUserId: true,
      } });
      if (!batch) throw new NotFoundException('Lote não encontrado.');
      if (!batch.startedByUserId) throw new ConflictException('O lote já foi cancelado.');
      if (changed.count) await tx.auditLog.create({ data: { eventId, organizationId: config.organizationId,
        actorUserId: userId, action: 'event.communication_batch_started', entityId: batchId, entityType: 'EventCommunicationBatch' } });
      const { startedByUserId: _actor, ...summary } = batch;
      return summary;
    });
  }

  private async refresh(tx: Prisma.TransactionClient, scope: Scope, batchId: string) {
    // Serialize aggregation across replica completions, including mailbox reconciliation.
    await tx.$queryRaw`SELECT id FROM "EventCommunicationBatch" WHERE id = ${batchId}::uuid
      AND "eventId" = ${scope.eventId} AND "organizationId" = ${scope.organizationId} FOR UPDATE`;
    const rows = await tx.eventCommunicationRecipient.groupBy({ by: ['status'],
      where: { eventId: scope.eventId, organizationId: scope.organizationId, batchId } });
    const states = new Set(rows.map(row => row.status));
    const status = states.has('CLAIMED') || states.has('PENDING') ? 'SENDING' :
      states.size === 1 ? rows[0].status : 'PARTIAL';
    await tx.eventCommunicationBatch.updateMany({ where: { id: batchId, eventId: scope.eventId, organizationId: scope.organizationId },
      data: { status } });
  }

  private async claim(config: Config) {
    const scope = { eventId: config.eventId, organizationId: config.organizationId };
    const claimToken = randomUUID();
    return this.prisma.$transaction(async tx => {
      // A dead process might have handed a message to the gateway before it died.
      // Never reclaim an expired attempt for automatic transport.
      const expired = await tx.$queryRaw<{ batchId: string }[]>`UPDATE "EventCommunicationRecipient"
        SET status = 'UNKNOWN', "claimToken" = NULL, "claimUntil" = NULL
        WHERE "eventId" = ${scope.eventId} AND "organizationId" = ${scope.organizationId}
          AND status = 'CLAIMED' AND "claimUntil" <= CURRENT_TIMESTAMP RETURNING "batchId"`;
      for (const id of [...new Set(expired.map(row => row.batchId))].sort()) await this.refresh(tx, scope, id);
      const acquired = await tx.$queryRaw<{ id: string }[]>`WITH candidate AS (
        SELECT r.id FROM "EventCommunicationRecipient" r JOIN "EventCommunicationBatch" b
        ON b.id = r."batchId" AND b."organizationId" = r."organizationId" AND b."eventId" = r."eventId"
        WHERE r."organizationId" = ${scope.organizationId} AND r."eventId" = ${scope.eventId}
          AND b.status = 'SENDING' AND b."startedByUserId" IS NOT NULL AND r.status = 'PENDING'
          AND (r."nextAttemptAt" IS NULL OR r."nextAttemptAt" <= CURRENT_TIMESTAMP)
        ORDER BY b."createdAt", r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED
      ) UPDATE "EventCommunicationRecipient" r SET status = 'CLAIMED', "claimToken" = ${claimToken}::uuid,
        "claimUntil" = CURRENT_TIMESTAMP + INTERVAL '2 minutes', "attemptCount" = "attemptCount" + 1
        FROM candidate WHERE r.id = candidate.id RETURNING r.id`;
      if (!acquired.length) return null;
      return tx.eventCommunicationRecipient.findFirstOrThrow({ where: { ...scope, id: acquired[0].id, claimToken },
        include: { batch: { select: { startedByUserId: true, audienceFilters: true, subject: true, body: true } } } });
    });
  }

  private async deliver(row: NonNullable<Awaited<ReturnType<EventCommunicationDispatchService['claim']>>>,
    config: Config, post: Post): Promise<Outcome> {
    const { eventId, organizationId, batchId } = row;
    const email = openCommunicationRecipient(row.emailEnvelope, { eventId, organizationId, batchId }, config.key);
    if (email !== config.mailbox || !row.batch.startedByUserId) return 'CANCELLED';
    const eligible = await this.audience.snapshot(row.batch.startedByUserId, eventId, row.batch.audienceFilters, true);
    if (!eligible.contacts.some(contact => contact.email === email)) return 'CANCELLED';
    const org = await this.prisma.organization.findFirst({ where: { id: organizationId, status: 'ACTIVE' }, select: { id: true } });
    if (!org) return 'CANCELLED';
    const key = bulkKey(organizationId, eventId, batchId, row.id);
    const req = new Request(config.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.token, 'Idempotency-Key': key },
      body: JSON.stringify({ schema: 'evolvia.transactional-email.v1', message: {
        from: config.sender, to: [email], subject: row.batch.subject.replace(/[\r\n]/g, ' '), text: row.batch.body,
      }, metadata: { purpose: 'event-communication', correlationKey: key } }) });
    // Recheck ownership after the potentially slow audience read, before the only network call.
    if (!await this.prisma.eventCommunicationRecipient.count({ where: { id: row.id, eventId, organizationId,
      claimToken: row.claimToken, status: 'CLAIMED', claimUntil: { gt: new Date(Date.now() + 15_000) } } })) return 'UNKNOWN';
    try {
      const status = await post(req);
      if (status >= 200 && status < 300) return 'ACCEPTED';
      if ([400, 401, 403, 404, 422].includes(status)) return 'FAILED';
      return 'UNKNOWN';
    } catch { return 'UNKNOWN'; }
  }

  async drain(post: Post = postBulkMessage) {
    const config = bulkDeliveryConfig();
    if (!config || this.running) return 0;
    this.running = true;
    let count = 0;
    try {
      for (; count < 25; count++) {
        const row = await this.claim(config);
        if (!row) break;
        let status: Outcome;
        try { status = await this.deliver(row, config, post); }
        catch { status = row.attemptCount < 3 ? 'PENDING' : 'FAILED'; } // pre-transport failures only
        await this.prisma.$transaction(async tx => {
          const result = await tx.eventCommunicationRecipient.updateMany({ where: { id: row.id,
            organizationId: config.organizationId, eventId: config.eventId, claimToken: row.claimToken, status: 'CLAIMED' },
            data: { status, claimToken: null, claimUntil: null,
              nextAttemptAt: status === 'PENDING' ? new Date(Date.now() + row.attemptCount * 60_000) : null } });
          if (!result.count) return;
          await tx.auditLog.create({ data: { eventId: row.eventId, organizationId: row.organizationId,
            entityType: 'EventCommunicationRecipient', entityId: row.id, action: 'event.communication_recipient_attempt',
            metadata: { batchId: row.batchId, attempt: row.attemptCount, status } } });
          await this.refresh(tx, config, row.batchId);
        });
      }
      return count;
    } finally { this.running = false; }
  }

  async reconcile(eventId: string, batchId: string, recipientId: string, evidenceHash: unknown, signature?: string) {
    const config = bulkDeliveryConfig();
    if (!config || config.eventId !== eventId || !validBulkReceipt(process.env.EVOLVIA_COMMUNICATION_RECEIPT_KEY,
      signature, { eventId, organizationId: config.organizationId, batchId, recipientId }, evidenceHash)) {
      throw new NotFoundException('Comprovante não encontrado.');
    }
    const where = { eventId, organizationId: config.organizationId, batchId, id: recipientId };
    return this.prisma.$transaction(async tx => {
      const changed = await tx.eventCommunicationRecipient.updateMany({ where: { ...where, status: { in: ['ACCEPTED','UNKNOWN'] } },
        data: { status: 'RECEIVED', receiptHash: evidenceHash } });
      if (!changed.count) {
        const stored = await tx.eventCommunicationRecipient.findFirst({ where: { ...where, status: 'RECEIVED', receiptHash: evidenceHash } });
        if (!stored) throw new ConflictException('A entrega ainda não pode ser conciliada.');
      } else {
        await tx.auditLog.create({ data: { eventId, organizationId: config.organizationId, entityType: 'EventCommunicationRecipient',
          entityId: recipientId, action: 'event.communication_mailbox_received', metadata: { batchId, evidenceHash } } });
        await this.refresh(tx, config, batchId);
      }
      return { status: 'RECEIVED' };
    });
  }
}
