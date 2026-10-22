import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventStatus, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { ParticipantAreaService } from './participant-area.service';
import { ParticipantAreaPolicyError, normalizeIdentityDocument, participantHash } from './participant-area-policy';
import {
  HISTORY_CONFIRM_FAILURE,
  HISTORY_RECOVERY_MESSAGE,
  historyFacts,
  includeReservation,
  participantDocumentIdentity,
} from './participant-history.policy';

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
      select: { id: true, eventId: true, organizationId: true, emailHash: true, identityHash: true, status: true },
    });
    if (!reservation) throw new UnauthorizedException('Não foi possível confirmar a inscrição.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const verifiedAt = reservation.status === RegistrationReservationStatus.CONFIRMED ? now : null;
        const existing = await tx.participantIdentityLink.findUnique({
          where: { identityHash_emailHash: { identityHash: reservation.identityHash, emailHash: user.emailHash } },
          select: { id: true, userId: true },
        });
        if (existing) {
          if (existing.userId !== userId) throw new ConflictException('Essa inscrição já está vinculada a outra conta.');
          if (verifiedAt) {
            await tx.participantIdentityLink.update({ where: { id: existing.id }, data: { verifiedAt } });
          }
          return;
        }
        const link = await tx.participantIdentityLink.create({
          data: { userId, identityHash: reservation.identityHash, emailHash: user.emailHash, verifiedAt },
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
      where: { userId }, select: { identityHash: true, emailHash: true, verifiedAt: true },
    });
    const ownHashes = links.filter((link) => link.emailHash === user.emailHash).map((link) => link.identityHash);
    const verifiedHashes = links.filter((link) => link.verifiedAt).map((link) => link.identityHash);
    if (ownHashes.length === 0 && verifiedHashes.length === 0) {
      return { user: { name: user.name, email: user.email }, emailVerified: true, linked: false, events: [] };
    }
    const now = new Date();
    const reservations = await this.prisma.eventRegistrationReservation.findMany({
      where: {
        AND: [
          { OR: [
            ...(ownHashes.length > 0 ? [{ emailHash: user.emailHash, identityHash: { in: ownHashes } }] : []),
            ...(verifiedHashes.length > 0 ? [{ identityHash: { in: verifiedHashes }, status: RegistrationReservationStatus.CONFIRMED }] : []),
          ] },
          { event: { status: EventStatus.PUBLISHED, OR: [{ endDate: null }, { endDate: { gte: now } }] } },
          { OR: [
            { status: RegistrationReservationStatus.CONFIRMED },
            { status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { gt: now } },
          ] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, emailHash: true, identityHash: true, event: { select: {
        name: true, slug: true, startDate: true, endDate: true, profileCode: true, venue: true,
      } } },
    });
    const visible = reservations.filter((item) => includeReservation({
      sameAccount: item.emailHash === user.emailHash && ownHashes.includes(item.identityHash),
      verifiedDocument: verifiedHashes.includes(item.identityHash),
      confirmed: item.status === RegistrationReservationStatus.CONFIRMED,
    }));
    return {
      user: { name: user.name, email: user.email }, emailVerified: true, linked: true,
      events: visible.map((item) => ({
        slug: item.event.slug, name: item.event.name, profileCode: item.event.profileCode,
        startDate: item.event.startDate?.toISOString() ?? null, endDate: item.event.endDate?.toISOString() ?? null,
        venue: item.event.venue, status: item.status,
      })),
    };
  }

  async enterEvent(userId: string, slug: string) {
    const user = await this.userScope(userId, true);
    const links = await this.prisma.participantIdentityLink.findMany({
      where: { userId }, select: { identityHash: true, emailHash: true, verifiedAt: true },
    });
    const ownHashes = links.filter((link) => link.emailHash === user.emailHash).map((link) => link.identityHash);
    const verifiedHashes = links.filter((link) => link.verifiedAt).map((link) => link.identityHash);
    if (ownHashes.length === 0 && verifiedHashes.length === 0) throw new NotFoundException('Inscrição não encontrada.');
    const now = new Date();
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: {
        AND: [
          { OR: [
            ...(ownHashes.length > 0 ? [{ emailHash: user.emailHash, identityHash: { in: ownHashes } }] : []),
            ...(verifiedHashes.length > 0 ? [{ identityHash: { in: verifiedHashes }, status: RegistrationReservationStatus.CONFIRMED }] : []),
          ] },
          { event: { slug: slug.trim().toLowerCase(), status: EventStatus.PUBLISHED,
            OR: [{ endDate: null }, { endDate: { gte: now } }] } },
          { OR: [
            { status: RegistrationReservationStatus.CONFIRMED },
            { status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { gt: now } },
          ] },
        ],
      },
      select: { id: true, eventId: true, organizationId: true, status: true, emailHash: true, identityHash: true },
    });
    if (reservation && !includeReservation({
      sameAccount: reservation.emailHash === user.emailHash && ownHashes.includes(reservation.identityHash),
      verifiedDocument: verifiedHashes.includes(reservation.identityHash),
      confirmed: reservation.status === RegistrationReservationStatus.CONFIRMED,
    })) {
      throw new NotFoundException('Inscrição não encontrada.');
    }
    if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
    return this.participantArea.createSessionForReservation(reservation.eventId, reservation.organizationId, reservation.id);
  }

  async history(userId: string) {
    const user = await this.userScope(userId, true);
    const links = await this.prisma.participantIdentityLink.findMany({
      where: { userId, verifiedAt: { not: null } },
      select: { identityHash: true },
    });
    const pendingConfirmations = await this.prisma.participantHistoryRecovery.findMany({
      where: { targetUserId: userId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, documentKind: true, issuerCountry: true, expiresAt: true },
    });
    if (links.length === 0) return { events: [], pendingConfirmations };
    const reservations = await this.prisma.eventRegistrationReservation.findMany({
      where: {
        identityHash: { in: links.map((link) => link.identityHash) },
        status: RegistrationReservationStatus.CONFIRMED,
        event: { status: EventStatus.PUBLISHED },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        checkIn: { select: { reversedAt: true } },
        event: { select: { name: true, slug: true, startDate: true } },
      },
    });
    return {
      events: reservations.map((item) => {
        const facts = historyFacts({
          confirmed: item.status === RegistrationReservationStatus.CONFIRMED,
          presenceRecorded: Boolean(item.checkIn),
          presenceReversed: Boolean(item.checkIn?.reversedAt),
        });
        return {
          slug: item.event.slug,
          name: item.event.name,
          startDate: item.event.startDate?.toISOString() ?? null,
          confirmed: facts.confirmed,
          presence: facts.presence,
        };
      }),
      pendingConfirmations,
    };
  }

  async requestHistoryRecovery(userId: string, rawInput: unknown, now = new Date()) {
    const user = await this.userScope(userId, true);
    let identity;
    try {
      const input = rawInput as { documentKind?: unknown; identityDocument?: unknown; issuerCountry?: unknown };
      identity = participantDocumentIdentity(input);
    } catch (error) {
      if (error instanceof ParticipantAreaPolicyError) throw new UnauthorizedException(error.message);
      throw error;
    }
    const recent = await this.prisma.participantHistoryRecovery.count({
      where: { requesterUserId: userId, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    if (recent >= 5) throw new HttpException('Aguarde antes de pedir outra confirmação.', HttpStatus.TOO_MANY_REQUESTS);
    const ownConfirmed = await this.prisma.eventRegistrationReservation.findFirst({
      where: {
        emailHash: user.emailHash,
        identityHash: identity.identityHash,
        status: RegistrationReservationStatus.CONFIRMED,
      },
      select: { id: true },
    });
    if (ownConfirmed) {
      await this.prisma.participantIdentityLink.upsert({
        where: { identityHash_emailHash: { identityHash: identity.identityHash, emailHash: user.emailHash } },
        create: {
          userId,
          identityHash: identity.identityHash,
          emailHash: user.emailHash,
          documentKind: identity.kind,
          issuerCountry: identity.country,
          verifiedAt: now,
        },
        update: { verifiedAt: now, documentKind: identity.kind, issuerCountry: identity.country },
      });
    }
    const owner = await this.prisma.participantIdentityLink.findFirst({
      where: { identityHash: identity.identityHash, verifiedAt: { not: null } },
      orderBy: { verifiedAt: 'desc' },
      select: { userId: true },
    });
    if (owner && owner.userId !== userId) {
      const rawToken = randomBytes(32).toString('hex');
      await this.prisma.$transaction(async (tx) => {
        await tx.participantHistoryRecovery.updateMany({
          where: { requesterUserId: userId, identityHash: identity.identityHash, consumedAt: null },
          data: { consumedAt: now },
        });
        const recovery = await tx.participantHistoryRecovery.create({
          data: {
            requesterUserId: userId,
            targetUserId: owner.userId,
            identityHash: identity.identityHash,
            documentKind: identity.kind,
            issuerCountry: identity.country,
            tokenHash: participantHash(rawToken),
            expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
          },
          select: { id: true },
        });
        const sample = await tx.eventRegistrationReservation.findFirst({
          where: { identityHash: identity.identityHash, status: RegistrationReservationStatus.CONFIRMED },
          select: { organizationId: true, eventId: true },
        });
        if (sample) {
          await tx.auditLog.create({
            data: {
              organizationId: sample.organizationId,
              eventId: sample.eventId,
              actorUserId: userId,
              action: 'participant.history_recovery_requested',
              entityType: 'ParticipantHistoryRecovery',
              entityId: recovery.id,
              metadata: { documentKind: identity.kind, masked: identity.masked } as Prisma.InputJsonObject,
            },
          });
        }
      });
    }
    return { accepted: true as const, message: HISTORY_RECOVERY_MESSAGE };
  }

  async confirmHistoryRecovery(userId: string, rawInput: unknown, now = new Date()) {
    const input = rawInput as { token?: unknown; recoveryId?: unknown };
    const token = typeof input?.token === 'string' ? input.token.trim() : '';
    const recoveryId = typeof input?.recoveryId === 'string' ? input.recoveryId.trim() : '';
    const row = recoveryId
      ? await this.prisma.participantHistoryRecovery.findFirst({
          where: { id: recoveryId, targetUserId: userId, consumedAt: null, expiresAt: { gt: now } },
        })
      : /^[a-f0-9]{64}$/u.test(token)
        ? await this.prisma.participantHistoryRecovery.findUnique({ where: { tokenHash: participantHash(token) } })
        : null;
    if (!row || row.consumedAt || row.expiresAt <= now || row.targetUserId !== userId) {
      throw new NotFoundException(HISTORY_CONFIRM_FAILURE);
    }
    const requester = await this.prisma.user.findUnique({ where: { id: row.requesterUserId }, select: { email: true, emailVerifiedAt: true } });
    if (!requester?.emailVerifiedAt) throw new NotFoundException(HISTORY_CONFIRM_FAILURE);
    const emailHash = participantHash(requester.email.trim().toLowerCase());
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.participantHistoryRecovery.updateMany({
        where: { id: row.id, consumedAt: null, targetUserId: userId },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new NotFoundException(HISTORY_CONFIRM_FAILURE);
      await tx.participantIdentityLink.upsert({
        where: { identityHash_emailHash: { identityHash: row.identityHash, emailHash } },
        create: {
          userId: row.requesterUserId,
          identityHash: row.identityHash,
          emailHash,
          documentKind: row.documentKind,
          issuerCountry: row.issuerCountry,
          verifiedAt: now,
        },
        update: { verifiedAt: now, documentKind: row.documentKind, issuerCountry: row.issuerCountry },
      });
      const sample = await tx.eventRegistrationReservation.findFirst({
        where: { identityHash: row.identityHash, status: RegistrationReservationStatus.CONFIRMED },
        select: { organizationId: true, eventId: true },
      });
      if (sample) {
        await tx.auditLog.create({
          data: {
            organizationId: sample.organizationId,
            eventId: sample.eventId,
            actorUserId: userId,
            action: 'participant.history_recovery_confirmed',
            entityType: 'ParticipantIdentityLink',
            entityId: row.requesterUserId,
            metadata: { documentKind: row.documentKind } as Prisma.InputJsonObject,
          },
        });
      }
    });
    return { accepted: true as const };
  }
}
