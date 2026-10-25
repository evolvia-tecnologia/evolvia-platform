import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { assertCommunicationDraftId, normalizeCommunicationDraft } from './event-communication.policy';

const summarySelect = { id: true, subject: true, revision: true, updatedAt: true } as const;
const draftSelect = { ...summarySelect, body: true } as const;

@Injectable()
export class EventCommunicationService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  private async scope(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { eventId: event.id, organizationId: event.organizationId };
  }

  private checkId(id: string) {
    try { assertCommunicationDraftId(id); }
    catch (error) { throw new BadRequestException((error as Error).message); }
  }

  async list(userId: string, eventId: string) {
    const scope = await this.scope(userId, eventId);
    const drafts = await this.prisma.eventCommunicationDraft.findMany({ where: scope, select: summarySelect, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 100 });
    return { eventId, drafts, sendingAvailable: false };
  }

  async get(userId: string, eventId: string, id: string) {
    const scope = await this.scope(userId, eventId);
    this.checkId(id);
    const draft = await this.prisma.eventCommunicationDraft.findUnique({ where: { id_eventId_organizationId: { id, ...scope } }, select: draftSelect });
    if (!draft) throw new NotFoundException('Rascunho não encontrado neste evento.');
    return draft;
  }

  async save(userId: string, eventId: string, id: string, raw: unknown) {
    const scope = await this.scope(userId, eventId);
    this.checkId(id);
    let input;
    try { input = normalizeCommunicationDraft(raw); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serializes first creation and the per-event limit, including separate API instances.
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${scope.eventId} AND "organizationId" = ${scope.organizationId} FOR UPDATE`;
        const previous = await tx.eventCommunicationDraft.findUnique({ where: { id_eventId_organizationId: { id, ...scope } } });
        if (previous && previous.revision === input.expectedRevision + 1 && previous.subject === input.subject && previous.body === input.body) {
          return { id: previous.id, subject: previous.subject, body: previous.body, revision: previous.revision, updatedAt: previous.updatedAt };
        }
        if ((previous?.revision ?? 0) !== input.expectedRevision) throw new ConflictException('O rascunho foi alterado em outra tela. Preserve seu texto e reabra a versão salva antes de editar.');
        if (!previous && await tx.eventCommunicationDraft.count({ where: scope }) >= 100) throw new ConflictException('Este evento já tem 100 rascunhos. Reutilize um dos existentes.');
        const data = { subject: input.subject, body: input.body };
        const draft = previous
          ? await tx.eventCommunicationDraft.update({ where: { id_eventId_organizationId: { id, ...scope } }, data: { ...data, revision: { increment: 1 } }, select: draftSelect })
          : await tx.eventCommunicationDraft.create({ data: { id, ...scope, ...data }, select: draftSelect });
        await tx.auditLog.create({ data: { ...scope, actorUserId: userId, action: 'event.communication_draft_saved', entityType: 'EventCommunicationDraft', entityId: id, metadata: { revision: draft.revision } } });
        return draft;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('O rascunho recebeu outra alteração. Preserve seu texto e confira a versão salva.');
      throw error;
    }
  }
}
