import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import { categoryChangePatch, decidePaidCategoryChange, effectiveRegistrationStatus, normalizeCategoryChangeTarget, normalizeRegistrationPresence, type PaidCategoryChangeDecision, type RegistrationPresenceFilter, registrationDocumentHash, registrationEmailHash } from './registration-operations-policy';
import { activeWaitlistOfferWhere } from './registration-reservations.service';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const PAGE_SIZE = 25;
const PROTOCOL = /^EVO-[A-F0-9]{16}$/u;

@Injectable()
export class RegistrationOperationsService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async list(userId: string, eventId: string, query: {
    presence?: string;
    page?: string;
    status?: string;
    protocol?: string;
    email?: string;
    document?: string;
    benefit?: string;
    payment?: string;
    company?: string;
  }) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, name: true, profileCode: true, eventType: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, STAFF_ROLES);

    if (query?.page !== undefined && (typeof query.page !== 'string' || !/^[1-9][0-9]{0,3}$/u.test(query.page))) {
      throw new BadRequestException('Página inválida.');
    }
    const page = query?.page === undefined ? 1 : Number(query.page);
    if (page > 1000) throw new BadRequestException('Página inválida.');
    const status = query?.status ?? 'ALL';
    if (typeof status !== 'string') throw new BadRequestException('Situação inválida.');
    if (status !== 'ALL' && !Object.values(RegistrationReservationStatus).includes(status as RegistrationReservationStatus)) {
      throw new BadRequestException('Situação inválida.');
    }
    if (query?.protocol !== undefined && typeof query.protocol !== 'string') throw new BadRequestException('Protocolo inválido.');
    const protocol = query?.protocol?.trim().toUpperCase() ?? '';
    if (protocol && !PROTOCOL.test(protocol)) throw new BadRequestException('Protocolo inválido.');
    let presence: RegistrationPresenceFilter = 'ALL';
    try { presence = normalizeRegistrationPresence(query?.presence); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Validação inválida.'); }
    const email = typeof query?.email === 'string' ? query.email.trim() : '';
    const document = typeof query?.document === 'string' ? query.document.trim() : '';
    const benefit = typeof query?.benefit === 'string' ? query.benefit.trim().toUpperCase() : '';
    const company = typeof query?.company === 'string' ? query.company.trim().replace(/\s+/gu, ' ') : '';
    const payment = typeof query?.payment === 'string' ? query.payment : 'ALL';
    if (query?.email !== undefined && typeof query.email !== 'string') throw new BadRequestException('E-mail inválido.');
    if (query?.document !== undefined && typeof query.document !== 'string') throw new BadRequestException('Documento inválido.');
    if (query?.benefit !== undefined && typeof query.benefit !== 'string') throw new BadRequestException('Código inválido.');
    if (query?.company !== undefined && typeof query.company !== 'string') throw new BadRequestException('Empresa inválida.');
    if (company && (company.length < 2 || company.length > 180)) throw new BadRequestException('Informe a empresa como foi preenchida na cobrança.');
    if (!['ALL', 'PAID', 'EXEMPT', 'PENDING'].includes(payment)) throw new BadRequestException('Situação de pagamento inválida.');
    if (email && !registrationEmailHash(email)) throw new BadRequestException('Informe um e-mail válido.');
    if (document && !registrationDocumentHash(document)) throw new BadRequestException('Informe um CPF, CNPJ ou documento válido.');
    if (benefit && !/^[A-Z0-9][A-Z0-9_-]{2,31}$/u.test(benefit)) throw new BadRequestException('Informe um código de benefício válido.');
    const emailHash = email ? registrationEmailHash(email) : null;
    const documentHash = document ? registrationDocumentHash(document) : null;

    const scope = { organizationId: event.organizationId, eventId };
    const now = new Date();
    const effectiveFilter: Prisma.EventRegistrationReservationWhereInput = status === 'PENDING_PAYMENT'
      ? { status: RegistrationReservationStatus.PENDING_PAYMENT, OR: [{ expiresAt: { gt: now } }, { expiresAt: null }] }
      : status === 'EXPIRED'
        ? { OR: [
          { status: RegistrationReservationStatus.EXPIRED },
          { status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { lte: now } },
        ] }
        : status === 'ALL' ? {} : { status: status as RegistrationReservationStatus };
    const presenceFilter: Prisma.EventRegistrationReservationWhereInput = presence === 'VALIDATED'
      ? { status: RegistrationReservationStatus.CONFIRMED, checkIn: { is: { reversedAt: null } } }
      : presence === 'PENDING'
        ? { status: RegistrationReservationStatus.CONFIRMED, NOT: { checkIn: { is: { reversedAt: null } } } }
        : {};
    const paymentFilter: Prisma.EventRegistrationReservationWhereInput = payment === 'PAID'
      ? { checkout: { status: 'PAID' } }
      : payment === 'EXEMPT'
        ? { status: RegistrationReservationStatus.CONFIRMED, finalPriceCents: 0 }
        : payment === 'PENDING'
          ? { status: RegistrationReservationStatus.PENDING_PAYMENT, OR: [{ expiresAt: { gt: now } }, { expiresAt: null }] }
          : {};
    const compactDocument = document.replace(/[ .\-/]/gu, '').toUpperCase();
    const where: Prisma.EventRegistrationReservationWhereInput = {
      AND: [
        scope,
        effectiveFilter,
        presenceFilter,
        paymentFilter,
        ...(protocol ? [{ protocol }] : []),
        ...(emailHash ? [{ emailHash }] : []),
        ...(documentHash ? [{ OR: [
          { identityHash: documentHash },
          { registrationData: { path: ['cnpj'], equals: compactDocument } },
          { billingSnapshot: { path: ['payer', 'document'], equals: compactDocument } },
          { billingSnapshot: { path: ['recipient', 'document'], equals: compactDocument } },
        ] }] : []),
        ...(benefit ? [{ benefit: { code: benefit, eventId, organizationId: event.organizationId } }] : []),
        ...(company ? [{ OR: [
          { billingSnapshot: { path: ['payer', 'name'], equals: company } },
          { billingSnapshot: { path: ['recipient', 'name'], equals: company } },
          { registrationData: { path: ['empresa'], equals: company } },
          { registrationData: { path: ['razao_social'], equals: company } },
        ] }] : []),
      ],
    };
    const confirmed = { ...scope, status: RegistrationReservationStatus.CONFIRMED };
    const [total, rows, grouped, present, validated, notValidated, stalePending] = await Promise.all([
      this.prisma.eventRegistrationReservation.count({ where }),
      this.prisma.eventRegistrationReservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          protocol: true, status: true, createdAt: true, confirmedAt: true, expiresAt: true, finalPriceCents: true,
          category: { select: { name: true, proofRequirement: true } },
          categoryProof: { select: { state: true } },
          lot: { select: { name: true } },
          checkout: { select: { status: true } },
          checkIn: { select: { checkedInAt: true, reversedAt: true } },
        },
      }),
      this.prisma.eventRegistrationReservation.groupBy({
        by: ['status'], where: scope, _count: { _all: true },
      }),
      this.prisma.eventRegistrationCheckIn.count({ where: { ...scope, reversedAt: null } }),
      this.prisma.eventRegistrationReservation.count({ where: { ...confirmed, checkIn: { is: { reversedAt: null } } } }),
      this.prisma.eventRegistrationReservation.count({ where: { ...confirmed, NOT: { checkIn: { is: { reversedAt: null } } } } }),
      this.prisma.eventRegistrationReservation.count({ where: {
        ...scope, status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { lte: now },
      } }),
    ]);
    const counts = Object.fromEntries(Object.values(RegistrationReservationStatus).map((item) => [item, 0]));
    for (const item of grouped) counts[item.status] = item._count._all;
    counts.PENDING_PAYMENT -= stalePending;
    counts.EXPIRED += stalePending;

    return {
      event: { id: event.id, name: event.name, profileCode: event.profileCode, eventType: event.eventType },
      summary: { ...counts, checkedIn: present, validated, notValidated },
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows.map((row) => ({
        protocol: row.protocol,
        status: effectiveRegistrationStatus(row.status, row.expiresAt, now),
        category: row.category.name,
        categoryProof: row.category.proofRequirement === 'NONE'
          ? null
          : row.categoryProof?.state ?? (row.category.proofRequirement === 'OPTIONAL' ? 'NOT_SENT' : 'MISSING'),
        lot: row.lot.name,
        finalPriceCents: row.finalPriceCents,
        paymentStatus: effectiveRegistrationStatus(row.status, row.expiresAt, now) === RegistrationReservationStatus.EXPIRED
          && row.status === RegistrationReservationStatus.PENDING_PAYMENT && row.checkout?.status !== 'PAID_REVIEW'
          ? 'EXPIRED' : row.checkout?.status ?? null,
        createdAt: row.createdAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        checkedInAt: row.checkIn && !row.checkIn.reversedAt ? row.checkIn.checkedInAt.toISOString() : null,
      })),
    };
  }

  async categoryOptions(userId: string, eventId: string, rawProtocol: string) {
    const event = await this.eventFor(userId, eventId);
    const protocol = this.protocolOrReject(rawProtocol);
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { protocol, eventId: event.id, organizationId: event.organizationId },
      select: this.categoryReservationSelect(),
    });
    if (!reservation) throw new NotFoundException('Inscrição não encontrada neste evento.');
    const paid = this.paidView(reservation);
    if (!paid.eligible) {
      return { ...paid, current: this.currentCategory(reservation), choices: [], blocked: [] };
    }
    const now = new Date();
    const scope = { eventId: event.id, organizationId: event.organizationId };
    const [lots, categoryRows, lotRows, offerCategories, offerLots] = await Promise.all([
      this.prisma.eventRegistrationLot.findMany({
        where: { ...scope, active: true, category: { active: true, eventId: event.id, organizationId: event.organizationId } },
        select: { id: true, name: true, priceCents: true, quantity: true, category: { select: { id: true, name: true, capacity: true } } },
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.eventRegistrationReservation.groupBy({
        by: ['categoryId'], where: this.activeReservationWhere(event.id, event.organizationId, now), _count: { _all: true },
      }),
      this.prisma.eventRegistrationReservation.groupBy({
        by: ['lotId'], where: this.activeReservationWhere(event.id, event.organizationId, now), _count: { _all: true },
      }),
      this.prisma.eventRegistrationWaitlistEntry.groupBy({
        by: ['categoryId'], where: { ...activeWaitlistOfferWhere(event.id, now), organizationId: event.organizationId }, _count: { _all: true },
      }),
      this.prisma.eventRegistrationWaitlistEntry.groupBy({
        by: ['lotId'], where: { ...activeWaitlistOfferWhere(event.id, now), organizationId: event.organizationId }, _count: { _all: true },
      }),
    ]);
    const countOf = (rows: Array<{ categoryId?: string; lotId?: string; _count: { _all: number } }>, id: string) => rows.find((row) => row.categoryId === id || row.lotId === id)?._count._all ?? 0;
    const choices: Array<{ categoryId: string; lotId: string; category: string; lot: string; priceCents: number }> = [];
    const blocked: Array<{ category: string; lot: string; priceCents: number }> = [];
    const seen = new Set<string>();
    const consider = (lot: { id: string; name: string; priceCents: number; quantity: number | null; category: { id: string; name: string; capacity: number | null } }, active: boolean) => {
      const key = `${lot.category.id}:${lot.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const sameCategory = lot.category.id === reservation.categoryId;
      const sameLot = lot.id === reservation.lotId;
      const decision = decidePaidCategoryChange({
        ...this.decisionBase(reservation),
        targetCategoryId: lot.category.id,
        targetLotId: lot.id,
        targetLotPriceCents: sameLot ? reservation.basePriceCents : lot.priceCents,
        targetActive: active,
        sameEvent: true,
        categoryCapacity: lot.category.capacity,
        categoryOccupied: Math.max(0, countOf(categoryRows, lot.category.id) + countOf(offerCategories, lot.category.id) - (sameCategory ? 1 : 0)),
        lotQuantity: lot.quantity,
        lotOccupied: Math.max(0, countOf(lotRows, lot.id) + countOf(offerLots, lot.id) - (sameLot ? 1 : 0)),
      });
      if (decision.ok) choices.push({ categoryId: lot.category.id, lotId: lot.id, category: lot.category.name, lot: lot.name, priceCents: reservation.finalPriceCents });
      else if (decision.code === 'price') blocked.push({ category: lot.category.name, lot: lot.name, priceCents: lot.priceCents });
    };
    consider({
      id: reservation.lotId, name: reservation.lot.name, priceCents: reservation.basePriceCents, quantity: null,
      category: { id: reservation.categoryId, name: reservation.category.name, capacity: null },
    }, true);
    for (const lot of lots) consider(lot, true);
    return { ...paid, current: this.currentCategory(reservation), choices, blocked };
  }

  async changeCategory(userId: string, eventId: string, rawProtocol: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    const protocol = this.protocolOrReject(rawProtocol);
    let targetIds: { categoryId: string; lotId: string };
    try { targetIds = normalizeCategoryChangeTarget(input); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Informe a categoria e o lote.'); }
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.eventRegistrationReservation.findFirst({
        where: { protocol, eventId: event.id, organizationId: event.organizationId },
        select: { ...this.categoryReservationSelect(), registrationData: true },
      });
      if (!reservation) throw new NotFoundException('Inscrição não encontrada neste evento.');
      const same = targetIds.categoryId === reservation.categoryId && targetIds.lotId === reservation.lotId;
      const target = same ? null : await tx.eventRegistrationLot.findFirst({
        where: {
          id: targetIds.lotId, categoryId: targetIds.categoryId, eventId: event.id, organizationId: event.organizationId, active: true,
          category: { active: true, eventId: event.id, organizationId: event.organizationId },
        },
        select: { id: true, name: true, priceCents: true, quantity: true, category: { select: { id: true, name: true, capacity: true } } },
      });
      const now = new Date();
      const excludingSelf = { ...this.activeReservationWhere(event.id, event.organizationId, now), NOT: { id: reservation.id } };
      const offers = { ...activeWaitlistOfferWhere(event.id, now), organizationId: event.organizationId };
      const [categoryOccupied, lotOccupied, categoryOffers, lotOffers] = same || !target ? [0, 0, 0, 0] : await Promise.all([
        tx.eventRegistrationReservation.count({ where: { ...excludingSelf, categoryId: target.category.id } }),
        tx.eventRegistrationReservation.count({ where: { ...excludingSelf, lotId: target.id } }),
        tx.eventRegistrationWaitlistEntry.count({ where: { ...offers, categoryId: target.category.id } }),
        tx.eventRegistrationWaitlistEntry.count({ where: { ...offers, lotId: target.id } }),
      ]);
      const decision = decidePaidCategoryChange({
        ...this.decisionBase(reservation),
        targetCategoryId: targetIds.categoryId,
        targetLotId: targetIds.lotId,
        targetLotPriceCents: same ? reservation.basePriceCents : target?.priceCents ?? 0,
        targetActive: same || Boolean(target),
        sameEvent: true,
        categoryCapacity: target?.category.capacity ?? null,
        categoryOccupied: categoryOccupied + categoryOffers,
        lotQuantity: target?.quantity ?? null,
        lotOccupied: lotOccupied + lotOffers,
      });
      if (!decision.ok) this.rejectCategoryChange(decision);
      if (decision.unchanged || !target) {
        return this.categoryResult(reservation, reservation.category.name, reservation.lot.name, false);
      }
      const patch = categoryChangePatch(reservation.registrationData, target.category.id, target.id);
      await tx.eventRegistrationReservation.update({
        where: { id: reservation.id },
        data: {
          categoryId: patch.categoryId,
          lotId: patch.lotId,
          ...(patch.registrationData ? { registrationData: patch.registrationData as Prisma.InputJsonValue } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          eventId: event.id,
          actorUserId: userId,
          action: 'registration.category_changed',
          entityType: 'EventRegistrationReservation',
          entityId: reservation.id,
          metadata: {
            fromCategoryId: reservation.categoryId,
            toCategoryId: target.category.id,
            fromLotId: reservation.lotId,
            toLotId: target.id,
            paidCents: reservation.checkout?.status === 'PAID' ? reservation.checkout.amountCents : null,
            finalPriceCents: reservation.finalPriceCents,
          },
        },
      });
      return this.categoryResult(reservation, target.category.name, target.name, true);
    });
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, name: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, STAFF_ROLES);
    return event as { id: string; organizationId: string; name: string };
  }

  private protocolOrReject(protocol: string) {
    const value = protocol.trim().toUpperCase();
    if (!PROTOCOL.test(value)) throw new BadRequestException('Protocolo inválido.');
    return value;
  }

  private categoryReservationSelect() {
    return {
      id: true, protocol: true, status: true, categoryId: true, lotId: true, basePriceCents: true, discountPercent: true, finalPriceCents: true,
      category: { select: { name: true } },
      lot: { select: { name: true } },
      checkout: { select: { status: true, amountCents: true } },
    } as const;
  }

  private decisionBase(reservation: { status: string; finalPriceCents: number; basePriceCents: number; discountPercent: number; categoryId: string; lotId: string; checkout: { status: string; amountCents: number } | null }) {
    return {
      status: reservation.status,
      checkoutStatus: reservation.checkout?.status ?? null,
      paidCents: reservation.checkout?.status === 'PAID' ? reservation.checkout.amountCents : null,
      finalPriceCents: reservation.finalPriceCents,
      basePriceCents: reservation.basePriceCents,
      discountPercent: reservation.discountPercent,
      currentCategoryId: reservation.categoryId,
      currentLotId: reservation.lotId,
    };
  }

  private paidView(reservation: { checkout: { status: string; amountCents: number } | null; finalPriceCents: number; status: string }) {
    const decision = decidePaidCategoryChange({
      ...this.decisionBase({ ...reservation, basePriceCents: reservation.finalPriceCents, discountPercent: 0, categoryId: 'current-category', lotId: 'current-lot-id' }),
      targetCategoryId: 'current-category', targetLotId: 'current-lot-id', targetLotPriceCents: reservation.finalPriceCents,
      targetActive: true, sameEvent: true, categoryCapacity: null, categoryOccupied: 0, lotQuantity: null, lotOccupied: 0,
    });
    return {
      eligible: decision.ok,
      message: decision.ok ? null : decision.message,
      paidCents: reservation.checkout?.status === 'PAID' ? reservation.checkout.amountCents : null,
    };
  }

  private currentCategory(reservation: { categoryId: string; lotId: string; category: { name: string }; lot: { name: string } }) {
    return { categoryId: reservation.categoryId, lotId: reservation.lotId, category: reservation.category.name, lot: reservation.lot.name };
  }

  private categoryResult(reservation: { protocol: string; finalPriceCents: number; checkout: { status: string; amountCents: number } | null }, category: string, lot: string, changed: boolean) {
    return {
      protocol: reservation.protocol,
      category,
      lot,
      finalPriceCents: reservation.finalPriceCents,
      paidCents: reservation.checkout?.status === 'PAID' ? reservation.checkout.amountCents : null,
      changed,
    };
  }

  private activeReservationWhere(eventId: string, organizationId: string, now: Date): Prisma.EventRegistrationReservationWhereInput {
    return {
      eventId,
      organizationId,
      status: { in: [RegistrationReservationStatus.PENDING_PAYMENT, RegistrationReservationStatus.CONFIRMED] },
      OR: [{ status: RegistrationReservationStatus.CONFIRMED }, { expiresAt: { gt: now } }],
    };
  }

  private rejectCategoryChange(decision: Extract<PaidCategoryChangeDecision, { ok: false }>): never {
    if (decision.code === 'unavailable') throw new NotFoundException(decision.message);
    if (decision.code === 'capacity' || decision.code === 'lot') throw new ConflictException(decision.message);
    throw new BadRequestException(decision.message);
  }
}


