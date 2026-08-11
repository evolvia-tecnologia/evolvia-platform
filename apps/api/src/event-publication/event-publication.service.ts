import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventFormat, EventStatus, MembershipRole, Prisma } from '@prisma/client';
import { AuthorizationService } from '../authorization.service';
import { EVENT_EDITOR_ROLES } from '../membership-policy';
import { PrismaService } from '../prisma.service';
import { UpdateEventPublicationDto } from './event-publication.dto';
import { canMutateEventPublication } from './event-publication.policy';
import {
  EventPublicationEditable,
  EventPublicationRepository,
  EventPublicationRow,
  EventPublicationSectionRow,
} from './event-publication.repository';

type EventScope = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: EventStatus;
  format: EventFormat;
  startDate: Date | null;
  endDate: Date | null;
  venue: string | null;
};

type PublicationChecklistItem = {
  code:
    | 'EVENT_NAME'
    | 'PUBLIC_URL'
    | 'EVENT_DATES'
    | 'LOCATION'
    | 'SHORT_DESCRIPTION'
    | 'PUBLIC_CONTACT'
    | 'ACCESSIBILITY_SUMMARY';
  label: string;
  ready: boolean;
  required: boolean;
};

@Injectable()
export class EventPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly repository: EventPublicationRepository,
  ) {}

  async getAdmin(userId: string, eventId: string) {
    const event = await this.requireEventScope(eventId);
    const membership = await this.authorization.requireMembership(userId, event.organizationId);
    const publication = await this.repository.findByScope(this.prisma, event.organizationId, event.id);
    const sections = publication
      ? await this.repository.findSectionsByScope(
          this.prisma,
          event.organizationId,
          event.id,
          publication.id,
        )
      : [];
    return this.adminPayload(event, publication, sections, membership.role);
  }

  async updateAdmin(userId: string, eventId: string, dto: UpdateEventPublicationDto) {
    const event = await this.requireEventScope(eventId);
    const membership = await this.authorization.requireMembership(userId, event.organizationId);

    if (!EVENT_EDITOR_ROLES.includes(membership.role)) {
      throw new NotFoundException('Evento não encontrado.');
    }
    this.requireMutationAllowed(membership.role, event.status);

    try {
      const publication = await this.prisma.$transaction(async (tx) => {
        const lockedEvent = await this.repository.lockEventScope(tx, event.organizationId, event.id);
        if (!lockedEvent) throw new NotFoundException('Evento não encontrado.');
        this.requireMutationAllowed(membership.role, lockedEvent.status);

        const current = await this.repository.findByScope(tx, event.organizationId, event.id);
        if (!current && dto.revision !== 0) {
          throw new ConflictException('A Divulgação foi alterada. Recarregue os dados antes de salvar novamente.');
        }
        if (current && current.revision !== dto.revision) {
          throw new ConflictException('A Divulgação foi alterada em outra sessão. Recarregue os dados antes de salvar novamente.');
        }

        const editable = this.mergeEditable(current, dto);
        const saved = current
          ? await this.repository.updateIfRevision(tx, current, dto.revision, editable)
          : await this.repository.create(tx, event.organizationId, event.id, editable);

        if (!saved) {
          throw new ConflictException('A Divulgação foi alterada em outra sessão. Recarregue os dados antes de salvar novamente.');
        }

        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: userId,
            eventId: event.id,
            action: current ? 'event.publication.updated' : 'event.publication.created',
            entityType: 'EventPublication',
            entityId: saved.id,
            metadata: {
              fromRevision: current?.revision ?? 0,
              toRevision: saved.revision,
              changedFields: this.changedFields(dto),
            },
          },
        });

        return saved;
      });

      const freshEvent = await this.requireEventScope(eventId);
      const sections = await this.repository.findSectionsByScope(
        this.prisma,
        freshEvent.organizationId,
        freshEvent.id,
        publication.id,
      );
      return this.adminPayload(freshEvent, publication, sections, membership.role);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A Divulgação foi criada em outra sessão. Recarregue os dados antes de salvar novamente.');
      }
      throw error;
    }
  }

  private async requireEventScope(eventId: string): Promise<EventScope> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        status: true,
        format: true,
        startDate: true,
        endDate: true,
        venue: true,
      },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    return { ...event, organizationId: event.organizationId };
  }

  private requireMutationAllowed(role: MembershipRole, eventStatus: EventStatus): void {
    if (!canMutateEventPublication({ role, eventStatus, mutation: 'UPDATE_EDITORIAL' })) {
      throw new ConflictException('O conteúdo da Divulgação está congelado neste estado do evento.');
    }
  }

  private mergeEditable(
    current: EventPublicationRow | null,
    dto: UpdateEventPublicationDto,
  ): EventPublicationEditable {
    const baseline: EventPublicationEditable = current
      ? {
          shortDescription: current.shortDescription,
          fullDescription: current.fullDescription,
          publicContactEmail: current.publicContactEmail,
          publicContactPhone: current.publicContactPhone,
          seoTitle: current.seoTitle,
          seoDescription: current.seoDescription,
          accessibilitySummary: current.accessibilitySummary,
          themeConfig: current.themeConfig,
        }
      : {
          shortDescription: null,
          fullDescription: null,
          publicContactEmail: null,
          publicContactPhone: null,
          seoTitle: null,
          seoDescription: null,
          accessibilitySummary: null,
          themeConfig: null,
        };

    return {
      shortDescription: this.mergeText(baseline.shortDescription, dto, 'shortDescription'),
      fullDescription: this.mergeText(baseline.fullDescription, dto, 'fullDescription'),
      publicContactEmail: this.mergeText(baseline.publicContactEmail, dto, 'publicContactEmail'),
      publicContactPhone: this.mergeText(baseline.publicContactPhone, dto, 'publicContactPhone'),
      seoTitle: this.mergeText(baseline.seoTitle, dto, 'seoTitle'),
      seoDescription: this.mergeText(baseline.seoDescription, dto, 'seoDescription'),
      accessibilitySummary: this.mergeText(baseline.accessibilitySummary, dto, 'accessibilitySummary'),
      themeConfig: Object.prototype.hasOwnProperty.call(dto, 'themeConfig')
        ? this.normalizeJson(dto.themeConfig ?? null)
        : baseline.themeConfig,
    };
  }

  private mergeText(
    current: string | null,
    dto: UpdateEventPublicationDto,
    key:
      | 'shortDescription'
      | 'fullDescription'
      | 'publicContactEmail'
      | 'publicContactPhone'
      | 'seoTitle'
      | 'seoDescription'
      | 'accessibilitySummary',
  ): string | null {
    if (!Object.prototype.hasOwnProperty.call(dto, key)) return current;
    const value = dto[key];
    if (value === null || value === undefined) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeJson(value: Record<string, unknown> | null): Prisma.JsonValue | null {
    if (value === null) return null;
    return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
  }

  private changedFields(dto: UpdateEventPublicationDto): string[] {
    return [
      'shortDescription',
      'fullDescription',
      'publicContactEmail',
      'publicContactPhone',
      'seoTitle',
      'seoDescription',
      'accessibilitySummary',
      'themeConfig',
    ].filter((field) => Object.prototype.hasOwnProperty.call(dto, field));
  }

  private adminPayload(
    event: EventScope,
    publication: EventPublicationRow | null,
    sections: EventPublicationSectionRow[],
    role: MembershipRole,
  ) {
    const checklist = this.buildChecklist(event, publication);

    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        status: event.status,
        format: event.format,
        startDate: event.startDate,
        endDate: event.endDate,
        venue: event.venue,
      },
      publication: publication
        ? {
            shortDescription: publication.shortDescription,
            fullDescription: publication.fullDescription,
            publicContactEmail: publication.publicContactEmail,
            publicContactPhone: publication.publicContactPhone,
            seoTitle: publication.seoTitle,
            seoDescription: publication.seoDescription,
            accessibilitySummary: publication.accessibilitySummary,
            themeConfig: publication.themeConfig,
            revision: publication.revision,
            updatedAt: publication.updatedAt,
          }
        : {
            shortDescription: null,
            fullDescription: null,
            publicContactEmail: null,
            publicContactPhone: null,
            seoTitle: null,
            seoDescription: null,
            accessibilitySummary: null,
            themeConfig: null,
            revision: 0,
            updatedAt: null,
          },
      sections: sections.map((section) => ({
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
      })),
      permissions: {
        canEdit: canMutateEventPublication({ role, eventStatus: event.status, mutation: 'UPDATE_EDITORIAL' }),
        canEditSections: canMutateEventPublication({
          role,
          eventStatus: event.status,
          mutation: 'UPDATE_SECTIONS',
        }),
        canPreparePreview: canMutateEventPublication({
          role,
          eventStatus: event.status,
          mutation: 'PREPARE_PREVIEW',
        }),
      },
      checklist: {
        items: checklist,
        blockingCount: checklist.filter((item) => item.required && !item.ready).length,
        recommendedPendingCount: checklist.filter((item) => !item.required && !item.ready).length,
      },
    };
  }

  private buildChecklist(
    event: EventScope,
    publication: EventPublicationRow | null,
  ): PublicationChecklistItem[] {
    const hasVenue = event.format === EventFormat.ONLINE || Boolean(event.venue?.trim());
    const hasPublicContact = Boolean(
      publication?.publicContactEmail?.trim() || publication?.publicContactPhone?.trim(),
    );

    return [
      {
        code: 'EVENT_NAME',
        label: 'Nome público do evento',
        ready: Boolean(event.name.trim()),
        required: true,
      },
      {
        code: 'PUBLIC_URL',
        label: 'Endereço público do evento',
        ready: Boolean(event.slug.trim()),
        required: true,
      },
      {
        code: 'EVENT_DATES',
        label: 'Datas do evento',
        ready: Boolean(event.startDate && event.endDate),
        required: true,
      },
      {
        code: 'LOCATION',
        label: 'Local ou formato online',
        ready: hasVenue,
        required: true,
      },
      {
        code: 'SHORT_DESCRIPTION',
        label: 'Descrição curta',
        ready: Boolean(publication?.shortDescription?.trim()),
        required: true,
      },
      {
        code: 'PUBLIC_CONTACT',
        label: 'Contato público',
        ready: hasPublicContact,
        required: false,
      },
      {
        code: 'ACCESSIBILITY_SUMMARY',
        label: 'Informações públicas de acessibilidade',
        ready: Boolean(publication?.accessibilitySummary?.trim()),
        required: false,
      },
    ];
  }
}
