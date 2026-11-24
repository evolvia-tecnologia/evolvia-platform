import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { bulkDeliveryConfig } from './event-communication-delivery';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { EventCommunicationAudienceService } from './event-communication-audience.service';
import {
  communicationBatchPayloadHash, communicationOutboxKey, normalizeCommunicationBatch, sealCommunicationRecipient,
} from './event-communication-batch.policy';

// PREPARED is an immutable recipient snapshot, never a promise of sending.
@Injectable()
export class EventCommunicationBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audience: EventCommunicationAudienceService,
  ) {}

  private async scope(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId },
      select: { id: true, organizationId: true, organization: { select: { status: true } } } });
    if (!event?.organizationId || event.organization?.status !== 'ACTIVE') {
      throw new NotFoundException('Evento não encontrado.');
    }
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { organizationId: event.organizationId, eventId: event.id };
  }

  private summary(batch: { id: string; draftId: string; draftRevision: number; recipientCount: number; status: string; createdAt: Date }) {
    return { id: batch.id, draftId: batch.draftId, draftRevision: batch.draftRevision,
      recipientCount: batch.recipientCount, status: batch.status, createdAt: batch.createdAt,
      sendingAvailable: false, receivedCount: 0 };
  }

  async list(userId: string, eventId: string) {
    const scope = await this.scope(userId, eventId);
    const batches = await this.prisma.eventCommunicationBatch.findMany({ where: scope,
      select: { id: true, draftId: true, draftRevision: true, recipientCount: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 100 });
    const config = bulkDeliveryConfig();
    const sendingAvailable = config?.eventId === eventId && config.organizationId === scope.organizationId;
    const groups = await this.prisma.eventCommunicationRecipient.groupBy({ by: ['batchId', 'status'],
      where: { ...scope, batchId: { in: batches.map(batch => batch.id) } }, _count: { _all: true } });
    const counts = new Map(groups.map(group => [group.batchId + '/' + group.status, group._count._all]));
    return { sendingAvailable, batches: batches.map(batch => {
      const count = (status: string) => counts.get(batch.id + '/' + status) ?? 0;
      return { ...this.summary(batch), sendingAvailable, acceptedCount: count('ACCEPTED'),
        receivedCount: count('RECEIVED'), pendingCount: count('PENDING'), claimedCount: count('CLAIMED'),
        unknownCount: count('UNKNOWN'), failedCount: count('FAILED'), cancelledCount: count('CANCELLED') };
    }) };
  }

  async cancel(userId: string, eventId: string, batchId: string) {
    const scope = await this.scope(userId, eventId);
    return this.prisma.$transaction(async tx => {
      const member = await tx.organizationMembership.findFirst({ where: {
        organizationId: scope.organizationId, organization: { status: 'ACTIVE' },
        userId, status: 'ACTIVE', role: { in: [...EVENT_EDITOR_ROLES] },
      }, select: { id: true } });
      if (!member) throw new NotFoundException('Evento não encontrado.');

      const where = { id: batchId, ...scope };
      const changed = await tx.eventCommunicationBatch.updateMany({
        where: { ...where, status: 'PREPARED' }, data: { status: 'CANCELLED' },
      });
      const batch = await tx.eventCommunicationBatch.findFirst({ where });
      if (!batch) throw new NotFoundException('Lote não encontrado.');
      if (batch.status !== 'CANCELLED') throw new ConflictException('O lote já iniciou o processamento.');
      if (changed.count) {
        const recipients = await tx.eventCommunicationRecipient.updateMany({
          where: { ...scope, batchId, status: 'PENDING' }, data: { status: 'CANCELLED' },
        });
        if (recipients.count !== batch.recipientCount) {
          throw new ConflictException('Há destinatários em processamento. Consulte o histórico.');
        }
        await tx.auditLog.create({ data: { ...scope, actorUserId: userId,
          action: 'event.communication_batch_cancelled', entityType: 'EventCommunicationBatch',
          entityId: batchId, metadata: { recipientCount: recipients.count },
        } });
      }
      return this.summary(batch);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async prepare(userId: string, eventId: string, raw: unknown) {
    const scope = await this.scope(userId, eventId);
    let input: ReturnType<typeof normalizeCommunicationBatch>;
    try { input = normalizeCommunicationBatch(raw); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    const payloadHash = communicationBatchPayloadHash(scope.organizationId, scope.eventId, input);
    const replay = async () => this.prisma.eventCommunicationBatch.findUnique({ where: { id: input.id },
      select: { id: true, eventId: true, organizationId: true, payloadHash: true,
        draftId: true, draftRevision: true, recipientCount: true, status: true, createdAt: true } });
    const stored = await replay();
    if (stored) {
      if (stored.organizationId !== scope.organizationId || stored.eventId !== eventId || stored.payloadHash !== payloadHash) {
        throw new ConflictException('Chave de lote já utilizada para outra preparação.');
      }
      return this.summary(stored);
    }
    let key: Buffer;
    try { key = communicationOutboxKey(process.env.EVOLVIA_COMMUNICATION_OUTBOX_KEY); }
    catch { throw new ServiceUnavailableException('Cofre de destinatários indisponível.'); }
    const snapshot = await this.audience.snapshot(userId, eventId, input.filters, true);
    if (snapshot.contacts.length === 0) throw new ConflictException('Nenhum destinatário elegível com consentimento expresso.');
    if (snapshot.contacts.length > 5000) throw new ConflictException('Restrinja a audiência para até 5000 destinatários.');
    const encrypted = snapshot.contacts.map(contact => sealCommunicationRecipient(contact.email,
      { ...scope, batchId: input.id }, key));
    try {
      return await this.prisma.$transaction(async tx => {
        // Recheck membership inside the same transaction that freezes the snapshot.
        const member = await tx.organizationMembership.findFirst({ where: {
          organizationId: scope.organizationId, userId, status: 'ACTIVE', role: { in: [...EVENT_EDITOR_ROLES] },
        }, select: { id: true } });
        if (!member) throw new NotFoundException('Evento não encontrado.');
        const draft = await tx.eventCommunicationDraft.findUnique({
          where: { id_eventId_organizationId: { id: input.draftId, ...scope } },
          select: { revision: true, subject: true, body: true },
        });
        if (!draft) throw new NotFoundException('Rascunho do evento não encontrado.');
        if (draft.revision !== input.draftRevision) {
          throw new ConflictException('O rascunho mudou. Reabra a revisão salva antes de preparar o lote.');
        }
        const batch = await tx.eventCommunicationBatch.create({ data: {
          id: input.id, ...scope, draftId: input.draftId, draftRevision: draft.revision,
          payloadHash, subject: draft.subject, body: draft.body,
          audienceFilters: input.filters as Prisma.InputJsonValue, recipientCount: encrypted.length,
          requestedByUserId: userId,
        }, select: { id: true, draftId: true, draftRevision: true, recipientCount: true, status: true, createdAt: true } });
        await tx.eventCommunicationRecipient.createMany({ data: encrypted.map(recipient => ({
          id: randomUUID(), ...scope, batchId: input.id, ...recipient,
        })) });
        await tx.auditLog.create({ data: { ...scope, actorUserId: userId,
          action: 'event.communication_batch_prepared', entityType: 'EventCommunicationBatch', entityId: input.id,
          metadata: { recipientCount: encrypted.length, draftRevision: draft.revision, sent: false },
        } });
        return this.summary(batch);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await replay();
        if (duplicate && duplicate.organizationId === scope.organizationId && duplicate.eventId === eventId &&
          duplicate.payloadHash === payloadHash) return this.summary(duplicate);
        throw new ConflictException('Chave de lote em uso por outra preparação.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Preparação concorrente. Confirme o lote salvo antes de tentar novamente.');
      }
      throw error;
    }
  }
}
