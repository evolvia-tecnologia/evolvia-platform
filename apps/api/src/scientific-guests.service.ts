import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CapabilityStatus,
  EventProfileCode,
  Prisma,
  ScientificInvitationStatus,
  ScientificParticipationType,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import {
  ConfigureScientificInvitationTemplateDto,
  CreateScientificGuestDto,
  PrepareScientificInvitationDto,
  RespondScientificInvitationDto,
  ScientificInvitationResponseDto,
  UpdateScientificGuestDto,
  UpdateScientificInvitationStatusDto,
} from './dto';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  invitationCanBeMarkedSent,
  invitationCanBePrepared,
  invitationCanReceiveResponse,
  invitationTokenHash,
  participationTypeLabels,
  renderScientificInvitationTemplate,
} from './scientific-guests-policy';
import { normalizeScientificText } from './scientific-structure-policy';

const DEFAULT_INVITATION_TEMPLATE = {
  subject: 'Convite para {EVENTO}',
  body: 'Olá, {NOME}. Você está sendo convidado(a) para participar de {EVENTO} como {FUNCAO}.',
  expiresInDays: 14,
};

@Injectable()
export class ScientificGuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    const [people, guests, capability] = await Promise.all([
      this.prisma.scientificPerson.findMany({
        where: { eventId, organizationId: event.organizationId! },
        orderBy: { name: 'asc' },
      }),
      this.prisma.scientificGuestProfile.findMany({
        where: { eventId, organizationId: event.organizationId! },
        include: { person: true },
        orderBy: [{ invitationStatus: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.eventCapability.findUnique({
        where: { eventId_code: { eventId, code: 'speakers_guests' } },
      }),
    ]);

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        profileCode: event.profileCode,
        organizationId: event.organizationId,
        organization: event.organization,
      },
      summary: {
        total: guests.length,
        confirmed: guests.filter((item) => item.invitationStatus === ScientificInvitationStatus.CONFIRMED).length,
        pending: guests.filter((item) =>
          item.invitationStatus !== ScientificInvitationStatus.CONFIRMED
          && item.invitationStatus !== ScientificInvitationStatus.DECLINED
          && item.invitationStatus !== ScientificInvitationStatus.CANCELLED,
        ).length,
        declined: guests.filter((item) => item.invitationStatus === ScientificInvitationStatus.DECLINED).length,
      },
      invitationTemplate: this.readInvitationTemplate(capability?.config),
      people: people.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        institution: item.institution,
        hasGuestProfile: guests.some((guest) => guest.personId === item.id),
      })),
      guests: guests.map((item) => this.publicGuest(item)),
    };
  }

  async create(userId: string, eventId: string, dto: CreateScientificGuestDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    this.assertRole(dto.participationType, dto.customRoleLabel);

    if (!dto.personId && !dto.name) {
      throw new BadRequestException('Escolha uma pessoa existente ou informe o nome do novo palestrante/convidado.');
    }

    const scope = { eventId, organizationId: event.organizationId! };
    let existingPerson = dto.personId
      ? await this.prisma.scientificPerson.findFirst({ where: { id: dto.personId, ...scope } })
      : dto.email
        ? await this.prisma.scientificPerson.findFirst({ where: { email: dto.email.trim().toLowerCase(), ...scope } })
        : null;

    if (dto.personId && !existingPerson) {
      throw new BadRequestException('A pessoa selecionada não pertence a este evento científico.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (!existingPerson) {
          existingPerson = await tx.scientificPerson.create({
            data: {
              ...scope,
              name: normalizeScientificText(dto.name!, 120),
              email: dto.email ? dto.email.trim().toLowerCase() : null,
              institution: this.optional(dto.institution, 160),
            },
          });
        }

        const guest = await tx.scientificGuestProfile.create({
          data: {
            ...scope,
            personId: existingPerson!.id,
            participationType: dto.participationType,
            customRoleLabel: this.optional(dto.customRoleLabel, 100),
            displayName: this.optional(dto.displayName, 120),
            professionalTitle: this.optional(dto.professionalTitle, 120),
            miniBio: this.optional(dto.miniBio, 1200),
            websiteUrl: this.optional(dto.websiteUrl, 300),
            linkedinUrl: this.optional(dto.linkedinUrl, 300),
            internalNotes: this.optional(dto.internalNotes, 1200),
            accessibilityNotes: this.optional(dto.accessibilityNotes, 600),
            technicalSupportNotes: this.optional(dto.technicalSupportNotes, 600),
          },
        });

        await this.audit(tx, event, userId, 'scientific.guest_created', 'ScientificGuestProfile', guest.id, {
          personId: guest.personId,
          participationType: guest.participationType,
        });
      });
    } catch (reason) {
      this.rethrowConflict(reason, 'Esta pessoa já está cadastrada como palestrante ou convidado neste evento.');
    }

    return this.get(userId, eventId);
  }

  async update(userId: string, eventId: string, guestId: string, dto: UpdateScientificGuestDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const guest = await this.requireGuest(eventId, event.organizationId!, guestId);
    const resultingType = dto.participationType ?? guest.participationType;
    const resultingCustomRole = dto.customRoleLabel === undefined ? guest.customRoleLabel : dto.customRoleLabel;
    this.assertRole(resultingType, resultingCustomRole ?? undefined);

    const data: Prisma.ScientificGuestProfileUpdateInput = {};
    if (dto.participationType !== undefined) data.participationType = dto.participationType;
    if (dto.customRoleLabel !== undefined) data.customRoleLabel = this.optional(dto.customRoleLabel, 100);
    if (dto.displayName !== undefined) data.displayName = this.optional(dto.displayName, 120);
    if (dto.professionalTitle !== undefined) data.professionalTitle = this.optional(dto.professionalTitle, 120);
    if (dto.miniBio !== undefined) data.miniBio = this.optional(dto.miniBio, 1200);
    if (dto.websiteUrl !== undefined) data.websiteUrl = this.optional(dto.websiteUrl, 300);
    if (dto.linkedinUrl !== undefined) data.linkedinUrl = this.optional(dto.linkedinUrl, 300);
    if (dto.internalNotes !== undefined) data.internalNotes = this.optional(dto.internalNotes, 1200);
    if (dto.accessibilityNotes !== undefined) data.accessibilityNotes = this.optional(dto.accessibilityNotes, 600);
    if (dto.technicalSupportNotes !== undefined) data.technicalSupportNotes = this.optional(dto.technicalSupportNotes, 600);

    await this.prisma.$transaction(async (tx) => {
      await tx.scientificGuestProfile.update({ where: { id: guest.id }, data });
      await this.audit(tx, event, userId, 'scientific.guest_updated', 'ScientificGuestProfile', guest.id, {
        changedFields: Object.keys(dto),
      });
    });

    return this.get(userId, eventId);
  }

  async configureTemplate(userId: string, eventId: string, dto: ConfigureScientificInvitationTemplateDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const existing = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: 'speakers_guests' } },
    });
    const currentConfig = this.configObject(existing?.config);
    const invitationTemplate = {
      subject: normalizeScientificText(dto.subject, 160),
      body: dto.body.trim().slice(0, 5000),
      expiresInDays: dto.expiresInDays,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.upsert({
        where: { eventId_code: { eventId, code: 'speakers_guests' } },
        create: {
          eventId,
          code: 'speakers_guests',
          status: CapabilityStatus.ACTIVE,
          config: { ...currentConfig, invitationTemplate } as Prisma.InputJsonValue,
        },
        update: {
          status: CapabilityStatus.ACTIVE,
          config: { ...currentConfig, invitationTemplate } as Prisma.InputJsonValue,
        },
      });
      await this.audit(tx, event, userId, 'scientific.invitation_template_updated', 'EventCapability', 'speakers_guests', {
        expiresInDays: dto.expiresInDays,
      });
    });

    return this.get(userId, eventId);
  }

  async prepareInvitation(userId: string, eventId: string, guestId: string, dto: PrepareScientificInvitationDto) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const guest = await this.requireGuest(eventId, event.organizationId!, guestId, true);
    if (!invitationCanBePrepared(guest.invitationStatus)) {
      throw new ConflictException('Este convite não pode ser preparado novamente no estado atual.');
    }

    const capability = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: 'speakers_guests' } },
    });
    const template = this.readInvitationTemplate(capability?.config);
    const expiresInDays = dto.expiresInDays ?? template.expiresInDays;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const role = this.roleLabel(guest.participationType, guest.customRoleLabel);
    const name = guest.displayName || guest.person.name;

    await this.prisma.$transaction(async (tx) => {
      await tx.scientificGuestProfile.update({
        where: { id: guest.id },
        data: {
          invitationStatus: ScientificInvitationStatus.PREPARED,
          invitationTokenHash: invitationTokenHash(token),
          invitationExpiresAt: expiresAt,
          preparedAt: new Date(),
          sentAt: null,
          viewedAt: null,
          respondedAt: null,
          confirmedAt: null,
          declinedAt: null,
          cancelledAt: null,
        },
      });
      await this.audit(tx, event, userId, 'scientific.invitation_prepared', 'ScientificGuestProfile', guest.id, {
        expiresAt: expiresAt.toISOString(),
      });
    });

    return {
      ...(await this.get(userId, eventId)),
      preparedInvitation: {
        guestId: guest.id,
        token,
        path: `/convites/cientificos/${token}`,
        expiresAt,
        subject: renderScientificInvitationTemplate(template.subject, { name, event: event.name, role }),
        body: renderScientificInvitationTemplate(template.body, { name, event: event.name, role }),
      },
    };
  }

  async updateInvitationStatus(
    userId: string,
    eventId: string,
    guestId: string,
    dto: UpdateScientificInvitationStatusDto,
  ) {
    const event = await this.requireMutableScientificEvent(userId, eventId);
    const guest = await this.requireGuest(eventId, event.organizationId!, guestId);

    if (dto.status === ScientificInvitationStatus.SENT) {
      if (!invitationCanBeMarkedSent(guest.invitationStatus)) {
        throw new ConflictException('O convite precisa estar preparado antes de ser marcado como enviado.');
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.scientificGuestProfile.update({
          where: { id: guest.id },
          data: { invitationStatus: ScientificInvitationStatus.SENT, sentAt: new Date() },
        });
        await this.audit(tx, event, userId, 'scientific.invitation_sent', 'ScientificGuestProfile', guest.id, {});
      });
    } else if (dto.status === ScientificInvitationStatus.CANCELLED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.scientificGuestProfile.update({
          where: { id: guest.id },
          data: {
            invitationStatus: ScientificInvitationStatus.CANCELLED,
            cancelledAt: new Date(),
            invitationTokenHash: null,
          },
        });
        await this.audit(tx, event, userId, 'scientific.invitation_cancelled', 'ScientificGuestProfile', guest.id, {});
      });
    } else {
      throw new BadRequestException('Nesta operação, o organizador pode registrar apenas envio ou cancelamento do convite.');
    }

    return this.get(userId, eventId);
  }

  async publicInvitation(token: string) {
    const guest = await this.findGuestByToken(token);
    this.assertInvitationAccessible(guest);

    let current = guest;
    if (
      !guest.viewedAt
      && (
        guest.invitationStatus === ScientificInvitationStatus.PREPARED
        || guest.invitationStatus === ScientificInvitationStatus.SENT
      )
    ) {
      current = await this.prisma.scientificGuestProfile.update({
        where: { id: guest.id },
        data: { invitationStatus: ScientificInvitationStatus.VIEWED, viewedAt: new Date() },
        include: { person: true, event: true },
      });
      await this.prisma.auditLog.create({
        data: {
          organizationId: guest.organizationId,
          eventId: guest.eventId,
          action: 'scientific.invitation_viewed',
          entityType: 'ScientificGuestProfile',
          entityId: guest.id,
          metadata: {},
        },
      });
    }

    return this.publicInvitationPayload(current);
  }

  async respondPublicInvitation(token: string, dto: RespondScientificInvitationDto) {
    const guest = await this.findGuestByToken(token);
    this.assertInvitationAccessible(guest);
    if (!invitationCanReceiveResponse(guest.invitationStatus)) {
      throw new ConflictException('Este convite já recebeu uma resposta ou não aceita mais alterações.');
    }

    const confirmed = dto.response === ScientificInvitationResponseDto.CONFIRMED;
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.scientificGuestProfile.update({
        where: { id: guest.id },
        data: {
          invitationStatus: confirmed ? ScientificInvitationStatus.CONFIRMED : ScientificInvitationStatus.DECLINED,
          respondedAt: now,
          confirmedAt: confirmed ? now : null,
          declinedAt: confirmed ? null : now,
        },
        include: { person: true, event: true },
      });
      await this.audit(tx, guest.event, null, confirmed ? 'scientific.invitation_confirmed' : 'scientific.invitation_declined', 'ScientificGuestProfile', guest.id, {});
      return item;
    });

    return this.publicInvitationPayload(updated);
  }

  private async findGuestByToken(token: string) {
    if (!token || token.length < 20 || token.length > 120) throw new NotFoundException('Convite não encontrado.');
    const guest = await this.prisma.scientificGuestProfile.findUnique({
      where: { invitationTokenHash: invitationTokenHash(token) },
      include: { person: true, event: true },
    });
    if (!guest) throw new NotFoundException('Convite não encontrado.');
    return guest;
  }

  private assertInvitationAccessible(guest: { invitationStatus: ScientificInvitationStatus; invitationExpiresAt: Date | null }) {
    if (guest.invitationStatus === ScientificInvitationStatus.CANCELLED) {
      throw new GoneException('Este convite foi cancelado.');
    }
    if (
      guest.invitationExpiresAt
      && guest.invitationExpiresAt.getTime() < Date.now()
      && guest.invitationStatus !== ScientificInvitationStatus.CONFIRMED
      && guest.invitationStatus !== ScientificInvitationStatus.DECLINED
    ) {
      throw new GoneException('Este convite expirou.');
    }
  }

  private async publicInvitationPayload(guest: any) {
    const capability = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId: guest.eventId, code: 'speakers_guests' } },
    });
    const template = this.readInvitationTemplate(capability?.config);
    const role = this.roleLabel(guest.participationType, guest.customRoleLabel);
    const name = guest.displayName || guest.person.name;
    return {
      event: { id: guest.event.id, name: guest.event.name },
      guest: {
        displayName: name,
        institution: guest.person.institution,
        professionalTitle: guest.professionalTitle,
        participationType: guest.participationType,
        roleLabel: role,
        miniBio: guest.miniBio,
      },
      invitation: {
        status: guest.invitationStatus,
        expiresAt: guest.invitationExpiresAt,
        subject: renderScientificInvitationTemplate(template.subject, { name, event: guest.event.name, role }),
        body: renderScientificInvitationTemplate(template.body, { name, event: guest.event.name, role }),
      },
    };
  }

  private async requireMutableScientificEvent(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private async requireScientificEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { organization: { select: { id: true, name: true, slug: true, status: true } } },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');

    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }

    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('Palestrantes e convidados estão disponíveis apenas para eventos técnico-científicos.');
    }
    if (!event.organizationId) {
      throw new BadRequestException('O evento científico precisa estar vinculado a uma organização.');
    }
    return event;
  }

  private async requireGuest(eventId: string, organizationId: string, guestId: string, includePerson = false): Promise<any> {
    const guest = await this.prisma.scientificGuestProfile.findFirst({
      where: { id: guestId, eventId, organizationId },
      ...(includePerson ? { include: { person: true } } : {}),
    });
    if (!guest) throw new NotFoundException('Palestrante ou convidado não encontrado neste evento.');
    return guest;
  }

  private assertRole(type: ScientificParticipationType, customRoleLabel?: string) {
    if (type === ScientificParticipationType.OTHER && !customRoleLabel?.trim()) {
      throw new BadRequestException('Informe o nome da função quando selecionar “Outra função”.');
    }
  }

  private roleLabel(type: ScientificParticipationType, customRoleLabel?: string | null): string {
    return type === ScientificParticipationType.OTHER && customRoleLabel
      ? customRoleLabel
      : participationTypeLabels[type];
  }

  private readInvitationTemplate(config: unknown) {
    const value = this.configObject(config).invitationTemplate;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_INVITATION_TEMPLATE };
    const template = value as Record<string, unknown>;
    return {
      subject: typeof template.subject === 'string' && template.subject.trim()
        ? template.subject.slice(0, 160)
        : DEFAULT_INVITATION_TEMPLATE.subject,
      body: typeof template.body === 'string' && template.body.trim()
        ? template.body.slice(0, 5000)
        : DEFAULT_INVITATION_TEMPLATE.body,
      expiresInDays: typeof template.expiresInDays === 'number'
        ? Math.max(1, Math.min(90, Math.round(template.expiresInDays)))
        : DEFAULT_INVITATION_TEMPLATE.expiresInDays,
    };
  }

  private configObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private optional(value: string | undefined, maxLength: number): string | null {
    if (!value) return null;
    const normalized = normalizeScientificText(value, maxLength);
    return normalized || null;
  }

  private publicGuest(item: any) {
    const { invitationTokenHash: _tokenHash, ...guest } = item;
    return {
      ...guest,
      roleLabel: this.roleLabel(item.participationType, item.customRoleLabel),
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    event: { id: string; organizationId: string | null },
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId!,
        actorUserId,
        eventId: event.id,
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  }

  private rethrowConflict(reason: unknown, message: string): never {
    if (reason instanceof Prisma.PrismaClientKnownRequestError && reason.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw reason;
  }
}
