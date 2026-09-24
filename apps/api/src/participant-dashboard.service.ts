import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventStatus, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { ParticipantAreaService } from './participant-area.service';
import { normalizeParticipantAccess, participantHash, secureHashMatches } from './participant-area-policy';

@Injectable()
export class ParticipantDashboardService {
  constructor(private readonly prisma: PrismaService, private readonly participantArea: ParticipantAreaService) {}

  private async userScope(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) throw new UnauthorizedException('Conta indisponível.');
    return { ...user, emailHash: participantHash(user.email.trim().toLowerCase()) };
  }

  async link(userId: string, rawInput: unknown) {
    const user = await this.userScope(userId);
    let input: { protocol: string; identityDocument: string };
    try { input = normalizeParticipantAccess(rawInput as { protocol?: unknown; identityDocument?: unknown }); }
    catch { throw new UnauthorizedException('Não foi possível confirmar a inscrição.'); }
    const reservation = await this.prisma.eventRegistrationReservation.findUnique({
      where: { protocol: input.protocol },
      select: { id: true, eventId: true, organizationId: true, emailHash: true, identityHash: true,
        status: true, expiresAt: true, event: { select: { status: true, endDate: true } } },
    });
    const now = new Date();
    if (!reservation || reservation.emailHash !== user.emailHash
      || !secureHashMatches(reservation.identityHash, participantHash(input.identityDocument))
      || reservation.event.status !== EventStatus.PUBLISHED
      || (reservation.event.endDate && reservation.event.endDate < now)
      || (reservation.status !== RegistrationReservationStatus.CONFIRMED
        && reservation.status !== RegistrationReservationStatus.PENDING_PAYMENT)
      || (reservation.status === RegistrationReservationStatus.PENDING_PAYMENT
        && (!reservation.expiresAt || reservation.expiresAt <= now))) {
      throw new UnauthorizedException('Não foi possível confirmar a inscrição.');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const link = await tx.participantIdentityLink.upsert({
          where: { identityHash_emailHash: { identityHash: reservation.identityHash, emailHash: user.emailHash } },
          create: { userId, identityHash: reservation.identityHash, emailHash: user.emailHash },
          update: {},
          select: { id: true, userId: true },
        });
        if (link.userId !== userId) throw new ConflictException('Essa inscrição já está vinculada a outra conta.');
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
    const links = await this.prisma.participantIdentityLink.findMany({
      where: { userId, emailHash: user.emailHash }, select: { identityHash: true },
    });
    if (links.length === 0) return { user: { name: user.name, email: user.email }, linked: false, events: [] };
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
      user: { name: user.name, email: user.email }, linked: true,
      events: reservations.map((item) => ({
        slug: item.event.slug, name: item.event.name, profileCode: item.event.profileCode,
        startDate: item.event.startDate?.toISOString() ?? null, endDate: item.event.endDate?.toISOString() ?? null,
        venue: item.event.venue, status: item.status,
      })),
    };
  }

  async enterEvent(userId: string, slug: string) {
    const user = await this.userScope(userId);
    const links = await this.prisma.participantIdentityLink.findMany({
      where: { userId, emailHash: user.emailHash }, select: { identityHash: true },
    });
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
