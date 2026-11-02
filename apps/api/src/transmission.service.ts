import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventFormat, MembershipRole, Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import {
  normalizeTransmission,
  readTransmission,
  TransmissionPolicyError,
  type TransmissionLink,
} from './transmission-policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const EDITOR_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const CODE = 'transmission';

@Injectable()
export class TransmissionService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    this.requireOnlineOrHybrid(event.format);
    return { transmission: await this.activeLink(eventId) };
  }

  async save(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    this.requireOnlineOrHybrid(event.format);
    let link: TransmissionLink | null;
    try { link = normalizeTransmission(input); }
    catch (error) {
      if (error instanceof TransmissionPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.upsert({
        where: { eventId_code: { eventId, code: CODE } },
        create: {
          eventId,
          code: CODE,
          status: link ? CapabilityStatus.ACTIVE : CapabilityStatus.DISABLED,
          schemaVersion: 1,
          config: (link ?? {}) as Prisma.InputJsonObject,
        },
        update: {
          status: link ? CapabilityStatus.ACTIVE : CapabilityStatus.DISABLED,
          config: (link ?? {}) as Prisma.InputJsonObject,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          actorUserId: userId,
          eventId,
          action: 'event.transmission_configured',
          entityType: 'EventCapability',
          entityId: eventId,
          metadata: { enabled: Boolean(link), kind: link?.kind ?? null } as Prisma.InputJsonObject,
        },
      });
    });
    return { transmission: link };
  }

  async linkForConfirmedEvent(eventId: string): Promise<TransmissionLink | null> {
    return this.activeLink(eventId);
  }

  private async activeLink(eventId: string): Promise<TransmissionLink | null> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { format: true } });
    if (!event || event.format === EventFormat.IN_PERSON) return null;
    const row = await this.prisma.eventCapability.findUnique({
      where: { eventId_code: { eventId, code: CODE } },
      select: { status: true, config: true },
    });
    if (row?.status !== CapabilityStatus.ACTIVE) return null;
    return readTransmission(row.config);
  }

  private requireOnlineOrHybrid(format: EventFormat): void {
    if (format !== EventFormat.ONLINE && format !== EventFormat.HYBRID) {
      throw new BadRequestException('Transmissão disponível somente para eventos online ou híbridos. Altere o formato na Fundação do evento.');
    }
  }

  private async eventFor(userId: string, eventId: string, roles: readonly MembershipRole[]) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, format: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, roles);
    return { id: event.id, organizationId: event.organizationId, format: event.format };
  }
}
