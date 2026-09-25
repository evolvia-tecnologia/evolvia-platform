import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventStatus, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { ParticipantAreaService } from './participant-area.service';
import { normalizeIdentityDocument, participantHash } from './participant-area-policy';

@Injectable()
export class ParticipantDashboardService {
  constructor(private readonly prisma: PrismaService, private readonly participantArea: ParticipantAreaService) {}

  private async userScope(userId: string, requireVerified = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, emailVerifiedAt: true },
    });
    if (!user) throw new UnauthorizedException('Conta indisponível.');
    if (requireVerified && !user.emailVerifiedAt) {
      throw new ForbiddenException('Confirme seu e-mail antes de reunir ou abrir inscrições.');
    }
    return { ...user, emailHash: participantHash(user.email.trim().toLowerCase()) };
  }

  async link(userId: string, rawInput: unknown) {
    const user = await this.userScope(userId, true);
    let identityDocument: string;
    try {
      identityDocument = normalizeIdentityDocument((rawInput as { identityDocument?: unknown })?.identityDocument);
    } catch {
      throw new UnauthorizedException('Não foi possível confirmar a inscrição.');
    }
    const now = new Date();
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: {
        emailHash: user.emailHash,
        identityHash: participantHash(identityDocument),
        event: { status: EventStatus.PUBLISHED, OR: [{ endDate: null }, { endDate: { gte: now } }] },
        OR: [
          { status: RegistrationReservationStatus.CONFIRMED },
          { status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, eventId: true, organizationId: true, emailHash: true, identityHash: true },
    });
    if (!reservation) throw new UnauthorizedException('Não foi possível confirmar a inscrição.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.participantIdentityLink.findUnique({
          where: { identityHash_emailHash: { identityHash: reservation.identityHash, emailHash: user.emailHash } },
          select: { id: true, userId: true },
        });
        if (existing) {
          if (existing.userId !== userId) throw new ConflictException('Essa inscrição já está vinculada a outra conta.');
          return;
        }
        const link = await tx.participantIdentityLink.create({
          data: { userId, identityHash: reservation.identityHash, emailHash: user.emailHash },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: { organizationId: reservation.organizationId, eventId: reservation.eventId, actorUserId: userId,
            action: 'participant.identity_linked', entityType: 'ParticipantIdentityLink', entityId: link.id,
            metadata: {} as Prisma.InputJsonObject },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Essa inscrição já está vinculada a outra conta.');
      }
      throw error;
    }
    return this.get(userId);
  }

  async get(userId: string) {
    const user = await this.userScope(userId);
    if (!user.emailVerifiedAt) {
      return {
        user: { name: user.name, email: user.email },
        emailVerified: false,
        linked: false,
        events: [],
      };
    }
    const links = await this.prisma.participantIdentityLink.findMany({
      where: { userId, emailHash: user.emailHash }, select: { identityHash: true },
    });
    if (links.length === 0) return { user: { name: user.name, email: user.email }, emailVerified: true, linked: false, events: [] };
    const now = new Date();
    const reservations = await this.prisma.eventRegistrationReservation.findMany({
      where: {
        emailHash: user.emailHash, identityHash: { in: links.map((link) => link.identityHash) },
        event: { status: EventStatus.PUBLISHED, OR: [{ endDate: null }, { endDate: { gte: now } }] },
        OR: [
          { status: RegistrationReservationStatus.CONFIRMED },
          { status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, event: { select: {
        name: true, slug: true, startDate: true, endDate: true, profileCode: true, venue: true,
      } } },
    });
    return {
      user: { name: user.name, email: user.email }, emailVerified: true, linked: true,
      events: reservations.map((item) => ({
        slug: item.event.slug, name: item.event.name, profileCode: item.event.profileCode,
        startDate: item.event.startDate?.toISOString() ?? null, endDate: item.event.endDate?.toISOString() ?? null,
        venue: item.event.venue, status: item.status,
      })),
    };
  }

  async enterEvent(userId: string, slug: string) {
    const user = await this.userScope(userId, true);
    const links = await this.prisma.participantIdentityLink.findMany({
      where: { userId, emailHash: user.emailHash }, select: { identityHash: true },
    });
    if (links.length === 0) throw new NotFoundException('Inscrição não encontrada.');
    const now = new Date();
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: {
        emailHash: user.emailHash, identityHash: { in: links.map((link) => link.identityHash) },
        event: { slug: slug.trim().toLowerCase(), status: EventStatus.PUBLISHED,
          OR: [{ endDate: null }, { endDate: { gte: now } }] },
        OR: [
          { status: RegistrationReservationStatus.CONFIRMED },
          { status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { gt: now } },
        ],
      },
      select: { id: true, eventId: true, organizationId: true },
    });
    if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
    return this.participantArea.createSessionForReservation(reservation.eventId, reservation.organizationId, reservation.id);
  }
}
