import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, MembershipRole, Prisma } from '@prisma/client';
import { AuthorizationService } from '../authorization.service';
import { EVENT_EDITOR_ROLES } from '../membership-policy';
import { PrismaService } from '../prisma.service';
import {
  CreateEventPublicationSectionDto,
  ReorderEventPublicationSectionsDto,
  RemoveEventPublicationSectionDto,
  UpdateEventPublicationSectionDto,
} from './event-publication.dto';
import { canMutateEventPublication } from './event-publication.policy';
import {
  EventPublicationRepository,
  EventPublicationSectionEditable,
  EventPublicationSectionRow,
} from './event-publication.repository';

type EventSectionScope = {
  id: string;
  organizationId: string;
  status: EventStatus;
};

@Injectable()
export class EventPublicationSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly repository: EventPublicationRepository,
  ) {}

  async create(userId: string, eventId: string, dto: CreateEventPublicationSectionDto) {
    const { event, role } = await this.requireEditableScope(userId, eventId);
    const editable = this.normalizeCreate(dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireLockedEditableEvent(tx, event, role);
        const publication = await this.repository.findByScope(tx, event.organizationId, event.id);
        if (!publication) throw new ConflictException('Salve a Divulgação antes de adicionar seções.');

        const saved = await this.repository.createSection(
          tx,
          event.organizationId,
          event.id,
          publication.id,
          editable,
        );

        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: userId,
            eventId: event.id,
            action: 'event.publication.section.created',
            entityType: 'EventPublicationSection',
            entityId: saved.id,
            metadata: {
              publicationId: publication.id,
              kind: saved.kind,
              revision: saved.revision,
              sortOrder: saved.sortOrder,
            },
          },
        });

        return this.payload(saved);
      });
    } catch (error) {
      this.rethrowKnownWriteConflict(error);
    }
  }

  async update(
    userId: string,
    eventId: string,
    sectionId: string,
    dto: UpdateEventPublicationSectionDto,
  ) {
    const { event, role } = await this.requireEditableScope(userId, eventId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireLockedEditableEvent(tx, event, role);
        const publication = await this.repository.findByScope(tx, event.organizationId, event.id);
        if (!publication) throw new NotFoundException('Seção não encontrada.');

        const current = await this.repository.findSectionByScope(
          tx,
          event.organizationId,
          event.id,
          publication.id,
          sectionId,
        );
        if (!current) throw new NotFoundException('Seção não encontrada.');
        if (current.revision !== dto.revision) {
          throw new ConflictException('A seção foi alterada em outra sessão. Recarregue antes de salvar.');
        }

        const editable = this.mergeUpdate(current, dto);
        const saved = await this.repository.updateSectionIfRevision(tx, current, dto.revision, editable);
        if (!saved) {
          throw new ConflictException('A seção foi alterada em outra sessão. Recarregue antes de salvar.');
        }

        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: userId,
            eventId: event.id,
            action: 'event.publication.section.updated',
            entityType: 'EventPublicationSection',
            entityId: saved.id,
            metadata: {
              publicationId: publication.id,
              fromRevision: current.revision,
              toRevision: saved.revision,
              changedFields: this.changedFields(dto),
            },
          },
        });

        return this.payload(saved);
      });
    } catch (error) {
      this.rethrowKnownWriteConflict(error);
    }
  }

  async reorder(userId: string, eventId: string, dto: ReorderEventPublicationSectionsDto) {
    const { event, role } = await this.requireEditableScope(userId, eventId);
    const uniqueIds = new Set(dto.sectionIds);
    if (uniqueIds.size !== dto.sectionIds.length) {
      throw new BadRequestException('A ordem das seções contém IDs duplicados.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.requireLockedEditableEvent(tx, event, role);
      const publication = await this.repository.findByScope(tx, event.organizationId, event.id);
      if (!publication) throw new NotFoundException('Divulgação não encontrada.');

      const current = await this.repository.findSectionsByScope(
        tx,
        event.organizationId,
        event.id,
        publication.id,
      );
      const currentIds = new Set(current.map((section) => section.id));
      if (
        current.length !== dto.sectionIds.length ||
        dto.sectionIds.some((sectionId) => !currentIds.has(sectionId))
      ) {
        throw new ConflictException('A lista de seções mudou. Recarregue antes de reordenar.');
      }

      await this.repository.reorderSections(
        tx,
        event.organizationId,
        event.id,
        publication.id,
        dto.sectionIds,
      );

      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'event.publication.section.reordered',
          entityType: 'EventPublication',
          entityId: publication.id,
          metadata: {
            sectionIds: dto.sectionIds,
            sectionCount: dto.sectionIds.length,
          },
        },
      });

      const reordered = await this.repository.findSectionsByScope(
        tx,
        event.organizationId,
        event.id,
        publication.id,
      );
      return reordered.map((section) => this.payload(section));
    });
  }

  async remove(
    userId: string,
    eventId: string,
    sectionId: string,
    dto: RemoveEventPublicationSectionDto,
  ) {
    const { event, role } = await this.requireEditableScope(userId, eventId);

    return this.prisma.$transaction(async (tx) => {
      await this.requireLockedEditableEvent(tx, event, role);
      const publication = await this.repository.findByScope(tx, event.organizationId, event.id);
      if (!publication) throw new NotFoundException('Seção não encontrada.');

      const current = await this.repository.findSectionByScope(
        tx,
        event.organizationId,
        event.id,
        publication.id,
        sectionId,
      );
      if (!current) throw new NotFoundException('Seção não encontrada.');
      if (current.revision !== dto.revision) {
        throw new ConflictException('A seção foi alterada em outra sessão. Recarregue antes de remover.');
      }

      const removed = await this.repository.removeSectionIfRevision(tx, current, dto.revision);
      if (!removed) {
        throw new ConflictException('A seção foi alterada em outra sessão. Recarregue antes de remover.');
      }

      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          actorUserId: userId,
          eventId: event.id,
          action: 'event.publication.section.removed',
          entityType: 'EventPublicationSection',
          entityId: current.id,
          metadata: {
            publicationId: publication.id,
            kind: current.kind,
            revision: current.revision,
            sortOrder: current.sortOrder,
          },
        },
      });

      return { removed: true, sectionId: current.id };
    });
  }

  private async requireEditableScope(
    userId: string,
    eventId: string,
  ): Promise<{ event: EventSectionScope; role: MembershipRole }> {
    const found = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!found?.organizationId) throw new NotFoundException('Evento não encontrado.');

    const event: EventSectionScope = { ...found, organizationId: found.organizationId };
    const membership = await this.authorization.requireMembership(userId, event.organizationId);
    if (!EVENT_EDITOR_ROLES.includes(membership.role)) {
      throw new NotFoundException('Evento não encontrado.');
    }
    this.requireSectionsMutationAllowed(membership.role, event.status);
    return { event, role: membership.role };
  }

  private async requireLockedEditableEvent(
    tx: Prisma.TransactionClient,
    event: EventSectionScope,
    role: MembershipRole,
  ): Promise<void> {
    const locked = await this.repository.lockEventScope(tx, event.organizationId, event.id);
    if (!locked) throw new NotFoundException('Evento não encontrado.');
    this.requireSectionsMutationAllowed(role, locked.status);
  }

  private requireSectionsMutationAllowed(role: MembershipRole, eventStatus: EventStatus): void {
    if (!canMutateEventPublication({ role, eventStatus, mutation: 'UPDATE_SECTIONS' })) {
      throw new ConflictException('As seções da Divulgação estão congeladas neste estado do evento.');
    }
  }

  private normalizeCreate(dto: CreateEventPublicationSectionDto): EventPublicationSectionEditable {
    return this.validateEditable({
      kind: dto.kind,
      title: this.normalizeText(dto.title),
      enabled: dto.enabled,
      sortOrder: dto.sortOrder,
      content: this.normalizeContent(dto.content),
      canonicalSourceType: dto.canonicalSourceType ?? null,
      canonicalSourceId: this.normalizeText(dto.canonicalSourceId),
    });
  }

  private mergeUpdate(
    current: EventPublicationSectionRow,
    dto: UpdateEventPublicationSectionDto,
  ): EventPublicationSectionEditable {
    const has = (key: keyof UpdateEventPublicationSectionDto) => Object.prototype.hasOwnProperty.call(dto, key);
    return this.validateEditable({
      kind: dto.kind ?? current.kind,
      title: has('title') ? this.normalizeText(dto.title) : current.title,
      enabled: dto.enabled ?? current.enabled,
      sortOrder: dto.sortOrder ?? current.sortOrder,
      content: has('content') ? this.normalizeContent(dto.content ?? {}) : current.content,
      canonicalSourceType: has('canonicalSourceType')
        ? dto.canonicalSourceType ?? null
        : current.canonicalSourceType,
      canonicalSourceId: has('canonicalSourceId')
        ? this.normalizeText(dto.canonicalSourceId)
        : current.canonicalSourceId,
    });
  }

  private validateEditable(editable: EventPublicationSectionEditable): EventPublicationSectionEditable {
    const hasType = Boolean(editable.canonicalSourceType);
    const hasId = Boolean(editable.canonicalSourceId);
    if (hasType !== hasId) {
      throw new BadRequestException('A referência canônica exige tipo e identificador juntos.');
    }
    if (editable.kind === 'CANONICAL_REFERENCE' && (!hasType || !hasId)) {
      throw new BadRequestException('Seção de referência canônica exige origem e identificador.');
    }
    if (editable.kind !== 'CANONICAL_REFERENCE' && (hasType || hasId)) {
      throw new BadRequestException('Referência canônica só é aceita no tipo CANONICAL_REFERENCE.');
    }
    return editable;
  }

  private normalizeContent(content: Record<string, unknown>): Prisma.JsonValue {
    this.inspectContent(content, 0);
    const serialized = JSON.stringify(content);
    if (Buffer.byteLength(serialized, 'utf8') > 12000) {
      throw new BadRequestException('O conteúdo da seção excede o limite permitido.');
    }
    return JSON.parse(serialized) as Prisma.JsonValue;
  }

  private inspectContent(value: unknown, depth: number): void {
    if (depth > 8) throw new BadRequestException('O conteúdo da seção é complexo demais.');
    if (typeof value === 'string') {
      if (/<\s*\/?\s*[a-z][^>]*>/i.test(value)) {
        throw new BadRequestException('HTML arbitrário não é permitido nas seções.');
      }
      if (/http:\/\//i.test(value)) {
        throw new BadRequestException('Links externos devem usar HTTPS.');
      }
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 50) throw new BadRequestException('A seção contém itens demais.');
      value.forEach((item) => this.inspectContent(item, depth + 1));
      return;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > 50) throw new BadRequestException('A seção contém propriedades demais.');
      for (const [key, nested] of entries) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
          throw new BadRequestException('A seção contém uma propriedade não permitida.');
        }
        this.inspectContent(nested, depth + 1);
      }
    }
  }

  private normalizeText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
  }

  private changedFields(dto: UpdateEventPublicationSectionDto): string[] {
    return ['kind', 'title', 'enabled', 'sortOrder', 'content', 'canonicalSourceType', 'canonicalSourceId'].filter(
      (field) => Object.prototype.hasOwnProperty.call(dto, field),
    );
  }

  private payload(section: EventPublicationSectionRow) {
    return {
      id: section.id,
      kind: section.kind,
      title: section.title,
      enabled: section.enabled,
      sortOrder: section.sortOrder,
      content: section.content,
      canonicalSourceType: section.canonicalSourceType,
      canonicalSourceId: section.canonicalSourceId,
      revision: section.revision,
      updatedAt: section.updatedAt,
    };
  }

  private rethrowKnownWriteConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Já existe uma seção nessa posição. Recarregue e tente novamente.');
    }
    throw error;
  }
}
