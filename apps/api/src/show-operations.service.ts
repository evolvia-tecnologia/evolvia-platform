import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma, RegistrationCheckoutStatus, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import {
  CHECK_IN_REPEATED_ACTION,
  ShowEntrancePolicyError,
  TURNSTILE_ACTIVE_LIMIT,
  TURNSTILE_KEY_TTL_MS,
  canManageShowOperations,
  issueStaffCode,
  issueTurnstileKey,
  normalizeKeyLabel,
  normalizePage,
  normalizeResourceId,
  normalizeStaffIdentity,
  normalizeTicketStatusFilter,
  normalizeTicketValidationFilter,
  normalizeTurnstileShare,
  showTicketStatus,
} from './show-entrance.policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const PAGE_SIZE = 25;
const STAFF_ACTIVE_LIMIT = 200;

type Scope = { organizationId: string; eventId: string };

function asBadRequest(error: unknown): never {
  if (error instanceof ShowEntrancePolicyError) throw new BadRequestException(error.message);
  throw error;
}

@Injectable()
export class ShowOperationsService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async report(userId: string, eventId: string) {
    const { event, canManage } = await this.requireEvent(userId, eventId, false);
    const scope = { organizationId: event.organizationId, eventId: event.id };
    const [paid, exempt, cancelled, validated, notValidated, ticketEntries, staffEntries, repeatedAttempts, recentTickets, recentStaff, staff, turnstileKeys] = await Promise.all([
      this.prisma.eventRegistrationReservation.count({ where: this.confirmedWhere(scope, 'PAGO') }),
      this.prisma.eventRegistrationReservation.count({ where: this.confirmedWhere(scope, 'ISENTO') }),
      this.prisma.eventRegistrationReservation.count({ where: { ...scope, status: RegistrationReservationStatus.CANCELLED } }),
      this.prisma.eventRegistrationReservation.count({ where: { ...this.confirmedWhere(scope, 'BOTH'), checkIn: { isNot: null } } }),
      this.prisma.eventRegistrationReservation.count({ where: { ...this.confirmedWhere(scope, 'BOTH'), checkIn: null } }),
      this.prisma.eventRegistrationCheckIn.count({ where: scope }),
      this.prisma.eventStaffAccess.count({ where: scope }),
      this.prisma.auditLog.count({ where: { organizationId: scope.organizationId, eventId: scope.eventId, action: CHECK_IN_REPEATED_ACTION } }),
      this.prisma.eventRegistrationCheckIn.findMany({
        where: scope,
        orderBy: { checkedInAt: 'desc' },
        take: 15,
        select: { checkedInAt: true, reservation: { select: { protocol: true, category: { select: { name: true } } } } },
      }),
      this.prisma.eventStaffAccess.findMany({
        where: scope,
        orderBy: { accessedAt: 'desc' },
        take: 15,
        select: { accessedAt: true, credential: { select: { displayName: true, duty: true } } },
      }),
      canManage ? this.prisma.eventStaffCredential.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: STAFF_ACTIVE_LIMIT,
        select: { id: true, displayName: true, duty: true, active: true, createdAt: true, revokedAt: true },
      }) : Promise.resolve([]),
      canManage ? this.prisma.eventTurnstileKey.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, label: true, keyHint: true, shareName: true, shareTicketType: true, shareStatus: true, shareCode: true,
          expiresAt: true, revokedAt: true, lastUsedAt: true, createdAt: true,
        },
      }) : Promise.resolve([]),
    ]);

    const recentAccesses = [
      ...recentTickets.map((row) => ({
        kind: 'TICKET' as const,
        at: row.checkedInAt.toISOString(),
        label: row.reservation.protocol,
        detail: row.reservation.category.name,
      })),
      ...recentStaff.map((row) => ({
        kind: 'STAFF' as const,
        at: row.accessedAt.toISOString(),
        label: row.credential.displayName,
        detail: row.credential.duty,
      })),
    ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 20);

    return {
      event: { id: event.id, name: event.name, slug: event.slug, status: event.status },
      canManage,
      tickets: {
        total: paid + exempt + cancelled,
        paid,
        exempt,
        cancelled,
        validated,
        notValidated,
      },
      access: { ticketEntries, repeatedAttempts, staffEntries },
      recentAccesses,
      staff: canManage ? staff.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        duty: row.duty,
        active: row.active,
        createdAt: row.createdAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })) : null,
      turnstileKeys: canManage ? turnstileKeys.map((row) => ({
        id: row.id,
        label: row.label,
        keyHint: row.keyHint,
        shareName: row.shareName,
        shareTicketType: row.shareTicketType,
        shareStatus: row.shareStatus,
        shareCode: row.shareCode,
        expiresAt: row.expiresAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })) : null,
    };
  }

  async listTickets(userId: string, eventId: string, query: { page?: unknown; status?: unknown; validation?: unknown }) {
    const { event } = await this.requireEvent(userId, eventId, false);
    let page = 1;
    let status: ReturnType<typeof normalizeTicketStatusFilter> = 'ALL';
    let validation: ReturnType<typeof normalizeTicketValidationFilter> = 'ALL';
    try {
      page = normalizePage(query?.page);
      status = normalizeTicketStatusFilter(query?.status);
      validation = normalizeTicketValidationFilter(query?.validation);
    } catch (error) { asBadRequest(error); }

    const scope = { organizationId: event.organizationId, eventId: event.id };
    const where = this.ticketListWhere(scope, status, validation);
    const [total, rows] = await Promise.all([
      this.prisma.eventRegistrationReservation.count({ where }),
      this.prisma.eventRegistrationReservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          protocol: true,
          status: true,
          finalPriceCents: true,
          category: { select: { name: true } },
          checkout: { select: { status: true } },
          checkIn: { select: { checkedInAt: true } },
        },
      }),
    ]);

    return {
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows.flatMap((row) => {
        const ticketStatus = showTicketStatus({
          status: row.status,
          finalPriceCents: row.finalPriceCents,
          checkoutStatus: row.checkout?.status ?? null,
        });
        if (!ticketStatus) return [];
        return [{
          protocol: row.protocol,
          category: row.category.name,
          status: ticketStatus,
          validatedAt: row.checkIn?.checkedInAt.toISOString() ?? null,
        }];
      }),
    };
  }

  async createStaff(userId: string, eventId: string, input: { displayName?: unknown; duty?: unknown }) {
    const { event } = await this.requireEvent(userId, eventId, true);
    let identity: { displayName: string; duty: string };
    try { identity = normalizeStaffIdentity(input ?? {}); } catch (error) { asBadRequest(error); }
    const scope = { organizationId: event.organizationId, eventId: event.id };
    const active = await this.prisma.eventStaffCredential.count({ where: { ...scope, active: true } });
    if (active >= STAFF_ACTIVE_LIMIT) {
      throw new BadRequestException('Este evento já tem o máximo de credenciais de equipe ativas.');
    }
    const issued = issueStaffCode();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.eventStaffCredential.create({
          data: {
            ...scope,
            displayName: identity.displayName,
            duty: identity.duty,
            codeHash: issued.codeHash,
            createdByUserId: userId,
            active: true,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: scope.organizationId,
            eventId: scope.eventId,
            actorUserId: userId,
            action: 'show.staff_credential_created',
            entityType: 'EventStaffCredential',
            entityId: row.id,
            metadata: { duty: identity.duty } satisfies Prisma.InputJsonObject,
          },
        });
        return row;
      });
      return {
        id: created.id,
        displayName: created.displayName,
        duty: created.duty,
        code: issued.code,
        createdAt: created.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Não foi possível criar a credencial. Tente novamente.');
      }
      throw error;
    }
  }

  async revokeStaff(userId: string, eventId: string, credentialId: string) {
    const { event } = await this.requireEvent(userId, eventId, true);
    let id = '';
    try { id = normalizeResourceId(credentialId, 'Credencial inválida.'); } catch (error) { asBadRequest(error); }
    const scope = { organizationId: event.organizationId, eventId: event.id };
    const credential = await this.prisma.eventStaffCredential.findFirst({
      where: { id, ...scope },
      select: { id: true, active: true, revokedAt: true, duty: true },
    });
    if (!credential) throw new NotFoundException('Credencial não encontrada.');
    if (!credential.active) {
      return { id: credential.id, active: false, revokedAt: credential.revokedAt?.toISOString() ?? null };
    }
    const revokedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventStaffCredential.update({
        where: { id: credential.id },
        data: { active: false, revokedAt },
      });
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          eventId: scope.eventId,
          actorUserId: userId,
          action: 'show.staff_credential_revoked',
          entityType: 'EventStaffCredential',
          entityId: credential.id,
          metadata: { duty: credential.duty } satisfies Prisma.InputJsonObject,
        },
      });
    });
    return { id: credential.id, active: false, revokedAt: revokedAt.toISOString() };
  }

  async createTurnstileKey(userId: string, eventId: string, input: { label?: unknown; shareName?: unknown; shareTicketType?: unknown; shareStatus?: unknown; shareCode?: unknown }) {
    const { event } = await this.requireEvent(userId, eventId, true);
    let label = '';
    let share: { shareName: boolean; shareTicketType: boolean; shareStatus: boolean; shareCode: boolean };
    try {
      label = normalizeKeyLabel(input?.label);
      share = normalizeTurnstileShare(input ?? {});
    } catch (error) { asBadRequest(error); }
    const scope = { organizationId: event.organizationId, eventId: event.id };
    const active = await this.prisma.eventTurnstileKey.count({
      where: { ...scope, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active >= TURNSTILE_ACTIVE_LIMIT) {
      throw new BadRequestException('Este evento já tem 3 chaves de catraca ativas. Revogue uma para criar outra.');
    }
    const issued = issueTurnstileKey();
    const expiresAt = new Date(Date.now() + TURNSTILE_KEY_TTL_MS);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.eventTurnstileKey.create({
          data: {
            ...scope,
            label,
            keyHash: issued.keyHash,
            keyHint: issued.keyHint,
            ...share,
            expiresAt,
            createdByUserId: userId,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: scope.organizationId,
            eventId: scope.eventId,
            actorUserId: userId,
            action: 'show.turnstile_key_created',
            entityType: 'EventTurnstileKey',
            entityId: row.id,
            metadata: {
              shareName: share.shareName,
              shareTicketType: share.shareTicketType,
              shareStatus: share.shareStatus,
              shareCode: share.shareCode,
              expiresAt: expiresAt.toISOString(),
            } satisfies Prisma.InputJsonObject,
          },
        });
        return row;
      });
      return {
        id: created.id,
        label: created.label,
        secret: issued.secret,
        keyHint: created.keyHint,
        shareName: created.shareName,
        shareTicketType: created.shareTicketType,
        shareStatus: created.shareStatus,
        shareCode: created.shareCode,
        expiresAt: created.expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Não foi possível criar a chave. Tente novamente.');
      }
      throw error;
    }
  }

  async revokeTurnstileKey(userId: string, eventId: string, keyId: string) {
    const { event } = await this.requireEvent(userId, eventId, true);
    let id = '';
    try { id = normalizeResourceId(keyId, 'Chave inválida.'); } catch (error) { asBadRequest(error); }
    const scope = { organizationId: event.organizationId, eventId: event.id };
    const key = await this.prisma.eventTurnstileKey.findFirst({
      where: { id, ...scope },
      select: { id: true, revokedAt: true },
    });
    if (!key) throw new NotFoundException('Chave não encontrada.');
    if (key.revokedAt) return { id: key.id, revokedAt: key.revokedAt.toISOString() };
    const revokedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventTurnstileKey.update({ where: { id: key.id }, data: { revokedAt } });
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          eventId: scope.eventId,
          actorUserId: userId,
          action: 'show.turnstile_key_revoked',
          entityType: 'EventTurnstileKey',
          entityId: key.id,
          metadata: { revoked: true } satisfies Prisma.InputJsonObject,
        },
      });
    });
    return { id: key.id, revokedAt: revokedAt.toISOString() };
  }

  private async requireEvent(userId: string, eventId: string, manage: boolean) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, name: true, slug: true, status: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    const membership = await this.authorization.requireRole(userId, event.organizationId, manage
      ? [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER]
      : STAFF_ROLES);
    return { event: { ...event, organizationId: event.organizationId }, canManage: canManageShowOperations(membership.role) };
  }

  private confirmedWhere(scope: Scope, kind: 'PAGO' | 'ISENTO' | 'BOTH'): Prisma.EventRegistrationReservationWhereInput {
    const paid = {
      ...scope,
      status: RegistrationReservationStatus.CONFIRMED,
      finalPriceCents: { gt: 0 },
      checkout: { is: { status: RegistrationCheckoutStatus.PAID } },
    };
    const exempt = { ...scope, status: RegistrationReservationStatus.CONFIRMED, finalPriceCents: 0 };
    if (kind === 'PAGO') return paid;
    if (kind === 'ISENTO') return exempt;
    return {
      ...scope,
      status: RegistrationReservationStatus.CONFIRMED,
      OR: [
        { finalPriceCents: 0 },
        { finalPriceCents: { gt: 0 }, checkout: { is: { status: RegistrationCheckoutStatus.PAID } } },
      ],
    };
  }

  private ticketListWhere(
    scope: Scope,
    status: ReturnType<typeof normalizeTicketStatusFilter>,
    validation: ReturnType<typeof normalizeTicketValidationFilter>,
  ): Prisma.EventRegistrationReservationWhereInput {
    if (status === 'CANCELADO') {
      if (validation !== 'ALL') return { ...scope, id: { in: [] } };
      return { ...scope, status: RegistrationReservationStatus.CANCELLED };
    }
    const kind = status === 'PAGO' ? 'PAGO' : status === 'ISENTO' ? 'ISENTO' : 'BOTH';
    const confirmed = this.confirmedWhere(scope, kind);
    if (validation === 'VALIDATED') return { ...confirmed, checkIn: { isNot: null } };
    if (validation === 'PENDING') return { ...confirmed, checkIn: null };
    if (status === 'ALL') {
      return {
        ...scope,
        OR: [
          { status: RegistrationReservationStatus.CANCELLED },
          { status: RegistrationReservationStatus.CONFIRMED, finalPriceCents: 0 },
          {
            status: RegistrationReservationStatus.CONFIRMED,
            finalPriceCents: { gt: 0 },
            checkout: { is: { status: RegistrationCheckoutStatus.PAID } },
          },
        ],
      };
    }
    return confirmed;
  }
}
