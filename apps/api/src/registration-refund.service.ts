import { createHash, timingSafeEqual } from 'node:crypto';
import { inspectSandboxPayment, readSandboxPayment, submitSandboxRefund } from './asaas-sandbox-refund';
import { lookupSandboxRefundPayment } from './asaas-refund-payment-lookup';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { EventStatus, MembershipRole, Prisma, RegistrationCheckoutStatus, RegistrationRefundRequestStatus, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { participantHash, normalizeParticipantToken } from './participant-area-policy';
import { PrismaService } from './prisma.service';
import {
  REFUND_REQUEST_LABEL,
  RegistrationRefundPolicyError,
  REFUND_PAGE_SIZE,
  describeAcceptedRefund,
  describeRefundPolicy,
  normalizeRefundListQuery,
  normalizeRefundText,
  normalizeRefundWindow,
  type RefundEligibility,
  type RefundWindow,
} from './registration-refund-policy';

// Private refund routes remain available for prior purchases after suspension or closure.
const REFUND_EVENT_STATUS = { in: [EventStatus.PUBLISHED, EventStatus.SUSPENDED, EventStatus.CANCELLED, EventStatus.FINISHED] };

const ORGANIZER_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];

function simulationOrganization(): string | undefined {
  const org = process.env.EVOLVIA_REFUND_SIMULATION_ORGANIZATION_ID;
  if (org && org === process.env.ASAAS_REFUND_SANDBOX_ORGANIZATION_ID && process.env.ASAAS_REFUND_SANDBOX_TOKEN?.trim()) {
    return org;
  }
  return undefined;
}

function policyError(error: unknown): never {
  if (error instanceof RegistrationRefundPolicyError) throw new BadRequestException(error.message);
  throw error;
}

@Injectable()
export class RegistrationRefundService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  private recoveryTimer?: NodeJS.Timeout;
  private readonly logger = new Logger(RegistrationRefundService.name);

  onModuleInit() {
    if (!this.sandboxRecoveryAccount()) return;
    this.recoveryTimer = setInterval(() => {
      void this.recoverSandboxRefund().catch(() => this.logger.warn('Falha na consulta de conciliação Pix sandbox.'));
    }, 30_000);
    this.recoveryTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.recoveryTimer);
  }

  private sandboxRecoveryAccount() {
    const org = process.env.ASAAS_REFUND_SANDBOX_ORGANIZATION_ID;
    const token = process.env.ASAAS_REFUND_SANDBOX_TOKEN?.trim();
    return org && token && org === process.env.ASAAS_REFUND_SANDBOX_EXECUTION_ORGANIZATION_ID ? { org, token } : null;
  }

  async recoverSandboxRefund() {
    const account = this.sandboxRecoveryAccount();
    if (!account) return;
    const { org, token } = account;
    // Reserve the next read across instances, committing before contacting Asaas.
    const paymentId = await this.prisma.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${'sandbox-refund-recovery/' + org}, 0)) AS acquired`;
      if (!lock.acquired) return;
      const [due] = await tx.$queryRaw<{ paymentId: string }[]>`
        SELECT "paymentId" FROM "SandboxRefundOperation"
        WHERE "organizationId" = ${org} AND status = 'PROCESSING' AND "nextCheckAt" <= now()
        ORDER BY "nextCheckAt", "paymentId" LIMIT 1`;
      if (!due) return;
      await tx.$executeRaw`UPDATE "SandboxRefundOperation" SET "nextCheckAt" = now() + interval '5 minutes'
        WHERE "organizationId" = ${org} AND "paymentId" = ${due.paymentId} AND status = 'PROCESSING'`;
      return due.paymentId;
    });
    if (paymentId) await this.reconcileSandboxPayment(org, paymentId, token, 'WORKER');
  }

  async publicPolicy(slugValue: string, now = new Date()) {
    const event = await this.publishedEvent(slugValue);
    return this.livePolicy(event, now);
  }

  async organizerPolicy(userId: string, eventId: string, now = new Date()) {
    const event = await this.organizerEvent(userId, eventId);
    return this.livePolicy(event, now);
  }

  async savePolicy(userId: string, eventId: string, input: unknown, now = new Date()) {
    const event = await this.organizerEvent(userId, eventId);
    let window: RefundWindow;
    try { window = normalizeRefundWindow(input && typeof input === 'object' ? (input as { window?: unknown }).window : undefined); }
    catch (error) { policyError(error); }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const current = await tx.eventRefundPolicy.findUnique({
            where: { eventId_organizationId: { eventId: event.id, organizationId: event.organizationId! } },
          });
          const version = current && current.window === window ? current.version : (current?.version ?? 0) + 1;
          if (!current || current.window !== window) {
            await tx.eventRefundPolicy.upsert({
              where: { eventId_organizationId: { eventId: event.id, organizationId: event.organizationId! } },
              create: { eventId: event.id, organizationId: event.organizationId!, window, version, updatedByUserId: userId },
              update: { window, version, updatedByUserId: userId },
            });
            await tx.eventRefundPolicyVersion.create({
              data: { eventId: event.id, organizationId: event.organizationId!, version, window },
            });
          }
          await tx.auditLog.create({
            data: {
              organizationId: event.organizationId!,
              eventId: event.id,
              actorUserId: userId,
              action: 'refund.policy_updated',
              entityType: 'EventRefundPolicy',
              entityId: event.id,
              metadata: { window, version } as Prisma.InputJsonObject,
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        // O retry deve repetir a leitura e recalcular a versão concorrente.
        // Não alterar snapshots aceitos nem sobrescrever a versão vencedora.
        if (error instanceof Prisma.PrismaClientKnownRequestError
          && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue;
        throw error;
      }
    }
    return this.livePolicy(event, now);
  }

  async recordAcceptance(
    tx: Prisma.TransactionClient,
    scope: { eventId: string; organizationId: string; reservationId: string },
    acceptedAt: Date,
  ) {
    const existing = await tx.registrationRefundAcceptance.findFirst({
      where: { reservationId: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId },
    });
    if (existing) return existing;
    const policy = await tx.eventRefundPolicy.findUnique({ where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } } });
    if (!policy) return null;
    const version = await tx.eventRefundPolicyVersion.findUnique({
      where: { eventId_organizationId_version: { eventId: scope.eventId, organizationId: scope.organizationId, version: policy.version } },
    });
    if (!version) return null;
    const event = await tx.event.findUnique({ where: { id: scope.eventId }, select: { startDate: true, timeZone: true } });
    const live = describeRefundPolicy({ window: version.window, startDate: event?.startDate ?? null, timeZone: event?.timeZone ?? null, now: acceptedAt });
    // INSERT ... ON CONFLICT DO NOTHING é atômico e mantém a transação
    // utilizável. Capturar P2002 após INSERT em PostgreSQL abortaria a
    // transação antes de qualquer consulta de recuperação.
    const inserted = await tx.registrationRefundAcceptance.createMany({
      data: [{
        reservationId: scope.reservationId,
        eventId: scope.eventId,
        organizationId: scope.organizationId,
        policyVersionId: version.id,
        window: version.window,
        version: version.version,
        deadlineAt: live.deadline ? new Date(live.deadline) : null,
        pendingCode: live.pending === 'START_DATE' || live.pending === 'TIME_ZONE' ? live.pending : null,
        acceptedAt,
      }],
      skipDuplicates: true,
    });
    const saved = await tx.registrationRefundAcceptance.findFirst({
      where: { reservationId: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId },
    });
    if (!saved) {
      throw new ConflictException('O aceite de reembolso pertence a outra inscrição ou organização.');
    }
    if (inserted.count === 1) {
      await tx.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          eventId: scope.eventId,
          action: 'refund.policy_accepted',
          entityType: 'RegistrationRefundAcceptance',
          entityId: scope.reservationId,
          metadata: { window: version.window, version: version.version, pending: live.pending } as Prisma.InputJsonObject,
        },
      });
    }
    return saved;
  }

  /**
   * Ponto de integração do checkout agrupado #471: deve ser chamado dentro
   * da transação que valida o pedido, ANTES da primeira chamada ao Asaas.
   * Sem aceite explícito por inscrição e política versionada, a cobrança é
   * bloqueada; não se infere consentimento a partir de terms_acceptance.
   */
  async recordOrderAcceptances(
    tx: Prisma.TransactionClient,
    scope: { orderId: string; eventId: string; organizationId: string },
    acceptedAt: Date,
  ) {
    const policy = await tx.eventRefundPolicy.findUnique({
      where: { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } },
      select: { version: true },
    });
    if (!policy) throw new ConflictException('Publique a política de reembolso antes de oferecer pagamento agrupado.');
    const version = await tx.eventRefundPolicyVersion.findUnique({
      where: { eventId_organizationId_version: {
        eventId: scope.eventId, organizationId: scope.organizationId, version: policy.version,
      } },
      select: { id: true },
    });
    if (!version) throw new ConflictException('Versão da política de reembolso indisponível.');

    // Count every order line, including missing/cancelled/free reservations.
    // Otherwise an order of 3 can appear valid when only 2 paid lines join.
    const totals = await tx.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::int AS "total"
      FROM "EventRegistrationOrderEntry"
      WHERE "orderId" = ${scope.orderId}
        AND "eventId" = ${scope.eventId}
        AND "organizationId" = ${scope.organizationId}
    `;
    const total = totals[0]?.total;
    if (!Number.isSafeInteger(total) || total < 2 || total > 10) {
      throw new ConflictException('O pedido agrupado não possui entradas válidas para pagamento.');
    }

    const entries = await tx.$queryRaw<Array<{ id: string; accepted: boolean; presentedVersion: string | null }>>`
      SELECT r."id",
             (r."registrationData"->>'refund_policy_acceptance' = 'true') AS "accepted",
             r."registrationData"->>'refund_policy_version' AS "presentedVersion"
      FROM "EventRegistrationOrderEntry" e
      JOIN "EventRegistrationReservation" r
        ON r."id" = e."reservationId"
       AND r."eventId" = e."eventId"
       AND r."organizationId" = e."organizationId"
      WHERE e."orderId" = ${scope.orderId}
        AND e."eventId" = ${scope.eventId}
        AND e."organizationId" = ${scope.organizationId}
        AND r."status" = 'PENDING_PAYMENT'
        AND r."finalPriceCents" > 0
      ORDER BY e."position"
      FOR UPDATE OF r
    `;
    if (entries.length !== total || entries.some((entry) => entry.accepted !== true)) {
      throw new ConflictException('Cada participante da compra paga deve aceitar expressamente a política de reembolso.');
    }
    if (entries.some((entry) => entry.presentedVersion !== String(policy.version))) {
      throw new ConflictException('A política exibida mudou; recarregue e confirme novamente a compra.');
    }
    for (const entry of entries) {
      const accepted = await this.recordAcceptance(tx, {
        reservationId: entry.id, eventId: scope.eventId, organizationId: scope.organizationId,
      }, acceptedAt);
      if (!accepted || accepted.policyVersionId !== version.id) {
        throw new ConflictException('A versão aceita da política mudou; confirme novamente a compra.');
      }
    }
    return { acceptedCount: entries.length, policyVersionId: version.id };
  }

  // O #471 pode ter sido integrado depois deste PR. Consultar o checkout
  // agrupado só quando as duas tabelas existem; nunca assumir pagamento pela
  // mera existência de pedido ou por um callback sem liquidação PAID.
  private async groupedPaid(
    client: Prisma.TransactionClient | PrismaService,
    reservation: { id: string; eventId: string; organizationId: string },
  ): Promise<boolean> {
    const tables = await client.$queryRaw<Array<{ ready: boolean }>>`
      SELECT (to_regclass('"EventRegistrationOrderEntry"') IS NOT NULL
        AND to_regclass('"EventRegistrationOrderCheckout"') IS NOT NULL) AS "ready"
    `;
    if (!tables[0]?.ready) return false;
    const matched = await client.$queryRaw<Array<{ id: string }>>`
      SELECT e."id"
      FROM "EventRegistrationOrderEntry" e
      JOIN "EventRegistrationOrderCheckout" c
        ON c."orderId" = e."orderId"
       AND c."eventId" = e."eventId"
       AND c."organizationId" = e."organizationId"
      WHERE e."reservationId" = ${reservation.id}
        AND e."eventId" = ${reservation.eventId}
        AND e."organizationId" = ${reservation.organizationId}
        AND c."status" = 'PAID'
      LIMIT 1
    `;
    return matched.length > 0;
  }

  private async paidAccountReservation(
    scope: {
      emailHash: string;
      identityHash: { in: string[] };
      event: { slug: string; status: typeof REFUND_EVENT_STATUS };
    },
  ) {
    const select = { id: true, eventId: true, organizationId: true, protocol: true } as const;
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const paidScope = {
      ...scope,
      status: RegistrationReservationStatus.CONFIRMED,
      finalPriceCents: { gt: 0 },
    };
    // Paginar todas as inscrições da identidade verificada, em ordem estável.
    // O limite fixo anterior (100) escondia compras agrupadas antigas e
    // priorizava checkouts individuais antigos sobre compras mais recentes.
    let cursor: string | undefined;
    while (true) {
      const candidates = await this.prisma.eventRegistrationReservation.findMany({
        where: paidScope,
        orderBy,
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { ...select, checkout: { select: { status: true } } },
      });
      for (const candidate of candidates) {
        if (candidate.checkout?.status === RegistrationCheckoutStatus.PAID
          || await this.groupedPaid(this.prisma, candidate)) {
          return { id: candidate.id, eventId: candidate.eventId, organizationId: candidate.organizationId, protocol: candidate.protocol };
        }
      }
      if (candidates.length < 100) break;
      cursor = candidates[candidates.length - 1].id;
    }
    return null;
  }

  async participantView(slug: string, authorization: string | undefined, now = new Date()) {
    const session = await this.sessionReservation(slug, authorization);
    return this.reservationView(session, now);
  }

  async requestFromSession(slug: string, authorization: string | undefined, input: unknown, now = new Date()) {
    const session = await this.sessionReservation(slug, authorization);
    return this.createRequest(session, input, null, now);
  }

  async requestFromAccount(userId: string, slug: string, input: unknown, now = new Date()) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
    if (!user?.emailVerifiedAt) throw new NotFoundException('Inscrição não encontrada.');
    const emailHash = participantHash(user.email.trim().toLowerCase());
    const links = await this.prisma.participantIdentityLink.findMany({ where: { userId, emailHash }, select: { identityHash: true } });
    if (links.length === 0) throw new NotFoundException('Inscrição não encontrada.');
    const reservation = await this.paidAccountReservation({
      emailHash,
      identityHash: { in: links.map((link) => link.identityHash) },
      event: { slug: slug.trim().toLowerCase(), status: REFUND_EVENT_STATUS },
    });
    if (!reservation) throw new NotFoundException('Inscrição paga não encontrada.');
    return this.createRequest(reservation, input, userId, now);
  }

  async accountView(userId: string, slug: string, now = new Date()) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
    if (!user?.emailVerifiedAt) throw new NotFoundException('Inscrição não encontrada.');
    const emailHash = participantHash(user.email.trim().toLowerCase());
    const links = await this.prisma.participantIdentityLink.findMany({ where: { userId, emailHash }, select: { identityHash: true } });
    if (links.length === 0) throw new NotFoundException('Inscrição não encontrada.');
    const scope = {
      emailHash,
      identityHash: { in: links.map((link) => link.identityHash) },
      event: { slug: slug.trim().toLowerCase(), status: REFUND_EVENT_STATUS },
    };
    const paidReservation = await this.paidAccountReservation(scope);
    const reservation = paidReservation ?? await this.prisma.eventRegistrationReservation.findFirst({
      where: scope,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, eventId: true, organizationId: true, protocol: true },
    });
    if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
    return this.reservationView(reservation, now);
  }

  async hasPublishedPolicy(eventId: string, organizationId: string) {
    const policy = await this.prisma.eventRefundPolicy.findUnique({
      where: { eventId_organizationId: { eventId, organizationId } },
      select: { version: true },
    });
    if (!policy) return false;
    const version = await this.prisma.eventRefundPolicyVersion.findUnique({
      where: { eventId_organizationId_version: { eventId, organizationId, version: policy.version } },
      select: { id: true },
    });
    return Boolean(version);
  }

  async listRequests(userId: string, eventId: string, rawQuery: { status?: unknown; cursor?: unknown } = {}) {
    const query = (() => { try { return normalizeRefundListQuery(rawQuery); } catch (error) { policyError(error); } })();
    const event = await this.organizerEvent(userId, eventId);
    const organizationId = event.organizationId!;
    if (query.cursor) {
      const anchor = await this.prisma.registrationRefundRequest.findFirst({
        where: { id: query.cursor, eventId: event.id, organizationId, ...(query.status ? { status: query.status } : {}) },
        select: { id: true },
      });
      if (!anchor) throw new NotFoundException('Página de reembolsos não encontrada.');
    }
    const rows = await this.prisma.registrationRefundRequest.findMany({
      where: {
        eventId: event.id,
        organizationId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REFUND_PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        reason: true,
        status: true,
        decisionNote: true,
        createdAt: true,
        decidedAt: true,
        preparedAmountCents: true, sandboxPaymentId: true, mockReceipt: { select: { reconciledAt: true } },
        reservation: { select: { protocol: true } },
      },
    });
    const page = rows.slice(0, REFUND_PAGE_SIZE);
    return {
      canSimulateRefund: event.organizerRole === MembershipRole.OWNER
        && organizationId === simulationOrganization(),
      items: page.map((row) => ({
        id: row.id,
        protocol: row.reservation.protocol,
        reason: row.reason,
        status: row.status,
        statusLabel: REFUND_REQUEST_LABEL[row.status],
        decisionNote: row.decisionNote,
        createdAt: row.createdAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
        preparedAmountCents: row.preparedAmountCents,
        sandboxPaymentIdentified: row.sandboxPaymentId !== null,
        mockRefundStatus: row.mockReceipt ? (row.mockReceipt.reconciledAt ? 'RECONCILED' : 'ISSUED') : null,
      })),
      nextCursor: rows.length > REFUND_PAGE_SIZE ? page.at(-1)?.id ?? null : null,
    };
  }

  async prepare(userId: string, eventId: string, requestId: string, input: unknown) {
    const amount = input && typeof input === 'object' ? (input as { amountCents?: unknown }).amountCents : null;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1 || amount > 2147483647) {
      throw new BadRequestException('Informe um valor positivo em centavos.');
    }
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          tx => this.prepareOnce(tx, userId, eventId, requestId, amount),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt >= 5) throw new ConflictException('Preparação concorrente. Consulte o pedido e tente novamente.');
        await new Promise(resolve => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 30)));
      }
    }
  }

  private async prepareOnce(tx: Prisma.TransactionClient, userId: string, eventId: string, requestId: string, amountCents: number) {
    // A identidade financeira vem da inscrição e do checkout persistidos.
    const paymentFields = { id: true, amountCents: true, status: true, paidAt: true } as const;
    const request = await tx.registrationRefundRequest.findFirst({
      where: {
        id: requestId, eventId,
        reservation: { event: { organization: { memberships: { some: { userId, role: MembershipRole.OWNER, status: 'ACTIVE' } } } } },
      },
      select: {
        organizationId: true, status: true, preparedAmountCents: true, sandboxPaymentId: true,
        reservation: { select: {
          status: true, finalPriceCents: true, checkout: { select: paymentFields },
          orderEntry: { select: { finalPriceCents: true, order: { select: { checkout: { select: paymentFields } } } } },
        } },
      },
    });
    if (!request) throw new NotFoundException('Pedido não encontrado.');
    if (request.status !== 'APPROVED') throw new ConflictException('A preparação exige um pedido aprovado.');
    const result = { id: requestId, amountCents, moneyReturned: false, processingStatus: 'AWAITING_PAYMENT_REFERENCE' as const };
    if (request.preparedAmountCents !== null) {
      if (request.preparedAmountCents !== amountCents) throw new ConflictException('Este pedido já tem outro valor preparado.');
      return request.sandboxPaymentId ? { ...result, processingStatus: 'SANDBOX_PAYMENT_IDENTIFIED' as const } : result;
    }
    const { reservation } = request;
    const entry = reservation.orderEntry;
    const payment = entry ? entry.order.checkout : reservation.checkout;
    const eligibleStatus = reservation.status === RegistrationReservationStatus.CONFIRMED
      || reservation.status === RegistrationReservationStatus.CANCELLED;
    if (!eligibleStatus || !payment?.paidAt || payment.status !== 'PAID'
      || (entry && reservation.checkout?.status === 'PAID')) {
      throw new ConflictException('Não foi possível identificar um único checkout pago para a inscrição.');
    }
    const limit = Math.min(reservation.finalPriceCents, entry?.finalPriceCents ?? reservation.finalPriceCents);
    if (amountCents > limit) throw new ConflictException('O valor supera o preço pago por esta inscrição.');
    const source = entry ? { preparedOrderCheckoutId: payment.id } : { preparedCheckoutId: payment.id };
    const total = await tx.registrationRefundRequest.aggregate({
      where: { eventId, organizationId: request.organizationId, ...source },
      _sum: { preparedAmountCents: true },
    });
    if (amountCents > payment.amountCents - (total._sum.preparedAmountCents ?? 0)) {
      throw new ConflictException('O valor supera o saldo disponível do checkout.');
    }
    await tx.registrationRefundRequest.update({
      where: { id: requestId }, data: { preparedAmountCents: amountCents, ...source },
    });
    await tx.auditLog.create({ data: {
      organizationId: request.organizationId, eventId, actorUserId: userId,
      entityType: 'RegistrationRefundRequest', entityId: requestId, action: 'refund.prepared',
      metadata: { amountCents, paymentKind: entry ? 'ORDER' : 'RESERVATION' },
    } });
    return result;
  }

  async resolveSandboxPayment(userId: string, eventId: string, requestId: string) {
    const authorized = {
      id: requestId, eventId,
      reservation: { event: { organization: { memberships: { some: { userId, role: MembershipRole.OWNER, status: 'ACTIVE' as const } } } } },
    };
    const fields = { id: true, provider: true, providerCheckoutId: true, status: true } as const;
    const request = await this.prisma.registrationRefundRequest.findFirst({
      where: authorized,
      select: {
        organizationId: true, status: true, preparedAmountCents: true, sandboxPaymentId: true,
        preparedCheckout: { select: fields }, preparedOrderCheckout: { select: fields },
      },
    });
    if (!request) throw new NotFoundException('Pedido não encontrado.');
    const checkout = request.preparedCheckout ?? request.preparedOrderCheckout;
    if (request.status !== 'APPROVED' || !request.preparedAmountCents ||
        checkout?.provider !== 'ASAAS' || checkout?.status !== 'PAID' || !checkout?.providerCheckoutId) {
      throw new ConflictException('O pedido precisa de preparação e de um checkout Asaas pago e identificado.');
    }
    const result = { id: requestId, processingStatus: 'SANDBOX_PAYMENT_IDENTIFIED' as const, moneyReturned: false };
    if (request.sandboxPaymentId) return result;
    const organizationId = request.organizationId;
    const accountOrg = process.env.ASAAS_REFUND_SANDBOX_ORGANIZATION_ID;
    const token = process.env.ASAAS_REFUND_SANDBOX_TOKEN;
    if (accountOrg !== organizationId || !token?.trim()) throw new ServiceUnavailableException('Conta de homologação indisponível para esta organização.');
    let paymentId: string;
    try {
      paymentId = await lookupSandboxRefundPayment(
        { organizationId, eventId, providerCheckoutId: checkout.providerCheckoutId },
        { organizationId: accountOrg, token },
      );
    } catch (error) {
      // The adapter owns the transport and emits only these diagnostic categories.
      const code = error instanceof Error ? error.cause : undefined;
      const cause = typeof code === 'string' && /^(TRANSPORT|INVALID_JSON|HTTP_[1-5][0-9]{2})$/u.test(code)
        ? code : 'UNVERIFIED_PAYMENT';
      throw new ServiceUnavailableException('Não foi possível identificar a cobrança na homologação.', { cause });
    }
    const source = { id: checkout.id, provider: 'ASAAS', status: 'PAID' as const, providerCheckoutId: checkout.providerCheckoutId };
    const scope = {
      ...authorized, organizationId, status: 'APPROVED' as const, preparedAmountCents: request.preparedAmountCents,
      ...(request.preparedCheckout ? { preparedCheckout: source } : { preparedOrderCheckout: source }),
    };
    return this.prisma.$transaction(async tx => {
      const saved = await tx.registrationRefundRequest.updateMany({
        where: { ...scope, sandboxPaymentId: null }, data: { sandboxPaymentId: paymentId },
      });
      if (!saved.count) {
        if (await tx.registrationRefundRequest.findFirst({ where: { ...scope, sandboxPaymentId: paymentId }, select: { id: true } })) return result;
        throw new ConflictException('O pedido ou a referência mudou durante a consulta.');
      }
      await tx.auditLog.create({ data: { organizationId, eventId, actorUserId: userId, entityId: requestId,
        entityType: 'RegistrationRefundRequest', action: 'refund.sandbox_payment_identified',
        metadata: { amountCents: request.preparedAmountCents },
      } });
      return result;
    });
  }

  async processSandboxRefund(userId: string, eventId: string, requestId: string) {
    const fields = { providerCheckoutId: true, provider: true, amountCents: true, status: true, paidAt: true } as const;
    const where = { id: requestId, eventId, reservation: { event: { organization: {
      memberships: { some: { userId, role: MembershipRole.OWNER, status: 'ACTIVE' as const } },
    } } } };
    const select = { organizationId: true, status: true, preparedAmountCents: true, sandboxPaymentId: true,
      preparedCheckout: { select: fields }, preparedOrderCheckout: { select: fields } } as const;
    const initial = await this.prisma.registrationRefundRequest.findFirst({
      where, select: { ...select, sandboxOperation: { select: { status: true, attempts: true, organizationId: true, eventId: true, paymentId: true, amountCents: true, reconciledAt: true } } },
    });
    if (!initial) throw new NotFoundException('Pedido não encontrado.');
    const { sandboxOperation, ...request } = initial;
    // A duplicate already in flight before rejection is not an explicit retry.
    const retryRequested = sandboxOperation?.status === 'FAILED' && sandboxOperation.attempts === 1;
    const { organizationId } = request;
    const token = process.env.ASAAS_REFUND_SANDBOX_TOKEN?.trim();
    if (!token || process.env.ASAAS_REFUND_SANDBOX_ORGANIZATION_ID !== organizationId ||
        process.env.ASAAS_REFUND_SANDBOX_EXECUTION_ORGANIZATION_ID !== organizationId) {
      throw new ServiceUnavailableException('Processamento de homologação desabilitado.');
    }
    const checkout = request.preparedCheckout ?? request.preparedOrderCheckout;
    if (request.status !== 'APPROVED' || !request.sandboxPaymentId || !request.preparedAmountCents ||
        !checkout?.providerCheckoutId || !checkout.paidAt || checkout.provider !== 'ASAAS' || checkout.status !== 'PAID' ||
        (request.preparedCheckout && request.preparedOrderCheckout)) {
      throw new ConflictException('A execução exige uma cobrança paga e um pedido aprovado e preparado.');
    }
    const op = { requestId, paymentId: request.sandboxPaymentId, checkoutId: checkout.providerCheckoutId,
      amountCents: request.preparedAmountCents, checkoutCents: checkout.amountCents };
    if (sandboxOperation?.status === 'RECONCILED') {
      if (sandboxOperation.organizationId !== organizationId || sandboxOperation.eventId !== eventId ||
          sandboxOperation.paymentId !== op.paymentId || sandboxOperation.amountCents !== op.amountCents ||
          !sandboxOperation.reconciledAt) throw new ConflictException('Operação divergente do pedido preparado.');
      return { requestId, environment: 'SANDBOX', processingStatus: 'RECONCILED', amountCents: op.amountCents,
        sandboxRefundConfirmed: true, moneyReturned: false };
    }
    const observed = inspectSandboxPayment(op, await readSandboxPayment(op.paymentId, token));
    const claim = await this.prisma.$transaction(async tx => {
      const owner = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "OrganizationMembership" WHERE "userId" = ${userId} AND "organizationId" = ${organizationId}
        AND role = 'OWNER' AND status = 'ACTIVE' FOR SHARE`;
      if (!owner.length) throw new NotFoundException('Pedido não encontrado.');
      // Lock the refund request, not just the operation insert: concurrent owners
      // must serialize while claims and prepared payment references are rechecked.
      // Never turn a conflicted claim into another provider POST after a timeout.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "RegistrationRefundRequest"
        WHERE id = ${requestId} AND "eventId" = ${eventId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Pedido não encontrado.');
      const current = await tx.registrationRefundRequest.findFirst({ where, select });
      if (!current || JSON.stringify(current) !== JSON.stringify(request)) throw new ConflictException('O pedido mudou.');
      // A first, definitively rejected HTTP 400/401/403 can be retried ONCE
      // by an authorized OWNER who explicitly calls the processing endpoint.
      // Ambiguous transport errors remain PROCESSING: never retry a possible
      // successful provider POST merely because a later GET sees no refund.
      // Match the immutable tenant/payment/amount and cap total provider POSTs at 2.
      const inserted = await tx.$executeRaw`
        INSERT INTO "SandboxRefundOperation" ("requestId","organizationId","eventId","paymentId","amountCents","attempts")
        VALUES (${requestId},${organizationId},${eventId},${op.paymentId},${op.amountCents},${observed.matched ? 0 : 1})
        ON CONFLICT ("requestId") DO UPDATE SET
          status = 'PROCESSING',
          attempts = "SandboxRefundOperation".attempts + 1,
          "nextCheckAt" = now()
        WHERE "SandboxRefundOperation".status = 'FAILED'
          AND "SandboxRefundOperation".attempts = 1
          AND "SandboxRefundOperation"."organizationId" = ${organizationId}
          AND "SandboxRefundOperation"."eventId" = ${eventId}
          AND "SandboxRefundOperation"."paymentId" = ${op.paymentId}
          AND "SandboxRefundOperation"."amountCents" = ${op.amountCents}
          AND ${retryRequested && !observed.matched && observed.eligible}`;
      if (inserted && !observed.matched && !observed.eligible) throw new ConflictException('Cobrança indisponível para nova operação.');
      if (inserted && !observed.matched) {
        await tx.auditLog.create({ data: { organizationId, eventId, actorUserId: userId,
          action: 'refund.sandbox_claimed', entityType: 'RegistrationRefundRequest', entityId: requestId,
          metadata: { attempt: retryRequested ? 2 : 1, amountCents: op.amountCents, origin: 'OWNER', status: 'PROCESSING' } } });
      }
      return inserted === 1 && !observed.matched;
    });
    const status = claim ? await submitSandboxRefund(op, token) : observed.status;
    const saved = await this.saveSandboxStatus(organizationId, eventId, requestId, op.paymentId, op.amountCents, status, 'OWNER', userId);
    return { requestId, environment: 'SANDBOX', processingStatus: saved.status, amountCents: op.amountCents,
      sandboxRefundConfirmed: saved.status === 'RECONCILED', moneyReturned: false };
  }

  private async saveSandboxStatus(organizationId: string, eventId: string, requestId: string,
    paymentId: string, amountCents: number, status: string, origin: 'OWNER' | 'WEBHOOK' | 'WORKER', actorUserId?: string) {
    return this.prisma.$transaction(async tx => {
      const [previous] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM "SandboxRefundOperation"
        WHERE "requestId" = ${requestId} AND "organizationId" = ${organizationId} AND "eventId" = ${eventId}
          AND "amountCents" = ${amountCents} AND "paymentId" = ${paymentId} FOR UPDATE`;
      if (!previous) throw new ConflictException('Operação divergente do pedido preparado.');
      if (previous.status === status || previous.status === 'RECONCILED' ||
          (previous.status === 'FAILED' && status !== 'RECONCILED')) return previous;
      await tx.$executeRaw`UPDATE "SandboxRefundOperation" SET status = ${status},
        "reconciledAt" = CASE WHEN ${status} = 'RECONCILED' THEN COALESCE("reconciledAt", now()) ELSE "reconciledAt" END
        WHERE "requestId" = ${requestId}`;
      await tx.auditLog.create({ data: { organizationId, eventId, actorUserId, entityId: requestId,
        entityType: 'RegistrationRefundRequest', action: 'refund.sandbox_status',
        metadata: { origin, previous: previous.status, status, amountCents } } });
      return { status };
    });
  }

  async reconcileSandboxWebhook(header: string | undefined, input: unknown) {
    const secret = process.env.ASAAS_REFUND_SANDBOX_WEBHOOK_TOKEN;
    const org = process.env.ASAAS_REFUND_SANDBOX_ORGANIZATION_ID;
    const token = process.env.ASAAS_REFUND_SANDBOX_TOKEN;
    if (!secret?.trim() || !org || !token?.trim() || org !== process.env.ASAAS_REFUND_SANDBOX_EXECUTION_ORGANIZATION_ID) {
      throw new ServiceUnavailableException('Conciliação sandbox desabilitada.');
    }
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (typeof header !== 'string' || !timingSafeEqual(digest(header), digest(secret))) throw new UnauthorizedException();
    const payload = input as { event?: unknown; payment?: { id?: unknown } } | null;
    if (typeof payload?.event !== 'string') throw new BadRequestException('Evento inválido.');
    if (!['PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_REFUND_DENIED'].includes(payload.event)) return;
    const paymentId = payload.payment?.id;
    if (typeof paymentId !== 'string' || !/^pay_[a-zA-Z0-9_-]{1,196}$/.test(paymentId)) {
      throw new BadRequestException('Referência de cobrança inválida.');
    }
    await this.reconcileSandboxPayment(org, paymentId, token, 'WEBHOOK');
  }

  private async reconcileSandboxPayment(org: string, paymentId: string, token: string, origin: 'WEBHOOK' | 'WORKER') {
    const rows = await this.prisma.$queryRaw<Array<{ requestId: string; eventId: string; amountCents: number;
      checkoutId: string; checkoutCents: number }>>`
      SELECT op."requestId", op."eventId", op."amountCents",
        COALESCE(c."providerCheckoutId", g."providerCheckoutId") AS "checkoutId",
        COALESCE(c."amountCents", g."amountCents") AS "checkoutCents"
      FROM "SandboxRefundOperation" op JOIN "RegistrationRefundRequest" r ON r.id = op."requestId"
        AND r."organizationId" = op."organizationId" AND r."eventId" = op."eventId"
        AND r."sandboxPaymentId" = op."paymentId" AND r."preparedAmountCents" = op."amountCents"
      LEFT JOIN "EventRegistrationCheckout" c ON c.id = r."preparedCheckoutId"
        AND c."organizationId" = op."organizationId" AND c."eventId" = op."eventId"
      LEFT JOIN "EventRegistrationOrderCheckout" g ON g.id = r."preparedOrderCheckoutId"
        AND g."organizationId" = op."organizationId" AND g."eventId" = op."eventId"
      WHERE op."organizationId" = ${org} AND op."paymentId" = ${paymentId} AND op.status <> 'RECONCILED'
        AND ((c.id IS NULL) <> (g.id IS NULL))`;
    if (!rows.length) return;
    const payment = await readSandboxPayment(paymentId, token);
    let divergence: ConflictException | undefined;
    for (const row of rows) {
      let observed;
      try { observed = inspectSandboxPayment({ ...row, paymentId }, payment); }
      catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        divergence = error;
        continue;
      }
      if (observed.matched) await this.saveSandboxStatus(org, row.eventId, row.requestId, paymentId, row.amountCents, observed.status, origin);
    }
    if (divergence) throw divergence;
  }

  // Simulation requires an explicit opt-in and writes only a local receipt.
  async mockRefund(userId: string, eventId: string, requestId: string, command: 'ISSUE' | 'RECONCILE', now = new Date()) {
    const org = simulationOrganization();
    if (!org) throw new NotFoundException('Simulação indisponível.');
    return this.prisma.$transaction(async tx => {
      // Serialize every command for this approved request, including a retry after a lost response.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT r."id" FROM "RegistrationRefundRequest" r
        JOIN "OrganizationMembership" m ON m."organizationId" = r."organizationId"
        WHERE r."id" = ${requestId} AND r."eventId" = ${eventId} AND r."organizationId" = ${org}
          AND m."userId" = ${userId} AND m."role" = 'OWNER' AND m."status" = 'ACTIVE'
        FOR UPDATE OF r FOR SHARE OF m
      `;
      if (!locked.length) throw new NotFoundException('Pedido não encontrado.');
      const request = await tx.registrationRefundRequest.findUniqueOrThrow({
        where: { id: requestId }, select: {
          status: true, preparedAmountCents: true, sandboxPaymentId: true, mockReceipt: true,
          preparedCheckout: { select: { status: true } }, preparedOrderCheckout: { select: { status: true } },
        },
      });
      const payment = request.preparedCheckout ?? request.preparedOrderCheckout;
      const amountCents = request.preparedAmountCents;
      const paymentId = request.sandboxPaymentId;
      if (request.status !== 'APPROVED' || !amountCents || !paymentId || payment?.status !== 'PAID') {
        throw new ConflictException('A simulação exige valor preparado e cobrança paga identificada.');
      }
      let receipt = request.mockReceipt;
      let action: string | undefined;
      if (receipt && (receipt.paymentId !== paymentId || receipt.amountCents !== amountCents)) {
        throw new ConflictException('O comprovante simulado diverge do pedido.');
      }
      if (command === 'ISSUE' && !receipt) {
        receipt = await tx.mockRefundReceipt.create({ data: { requestId, paymentId, amountCents } });
        action = 'refund.mock_issued';
      }
      if (!receipt) throw new ConflictException('O pedido ainda não possui comprovante simulado.');
      if (command === 'RECONCILE' && !receipt.reconciledAt) {
        receipt = await tx.mockRefundReceipt.update({
          where: { requestId }, data: { reconciledAt: now },
        });
        action = 'refund.mock_reconciled';
      }
      if (action) await tx.auditLog.create({ data: {
        organizationId: org, eventId, actorUserId: userId, action,
        entityType: 'RegistrationRefundRequest', entityId: requestId, metadata: { amountCents, simulated: true },
      } });
      return { id: requestId, amountCents, simulated: true, moneyReturned: false,
        mockRefundStatus: receipt.reconciledAt ? 'RECONCILED' : 'ISSUED' };
    });
  }

  async decide(userId: string, eventId: string, requestId: string, input: unknown, now = new Date()) {
    const event = await this.organizerEvent(userId, eventId);
    const decision = this.decisionOf(input);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "RegistrationRefundRequest"
        WHERE "id" = ${requestId} AND "eventId" = ${event.id} AND "organizationId" = ${event.organizationId!}
        FOR UPDATE
      `;
      if (!rows[0]) throw new NotFoundException('Pedido não encontrado.');
      const current = await tx.registrationRefundRequest.findFirst({
        where: { id: requestId, eventId: event.id, organizationId: event.organizationId! },
        select: { id: true, status: true, reservationId: true, reservation: { select: { protocol: true, status: true, finalPriceCents: true, checkout: { select: { status: true } } } } },
      });
      if (!current) throw new NotFoundException('Pedido não encontrado.');
      if (current.status !== RegistrationRefundRequestStatus.REQUESTED) {
        throw new ConflictException('Este pedido já foi analisado.');
      }
      // A decision must not approve a refund for a reservation whose payment
      // has been reversed or whose registration is no longer confirmed.
      // This is checked under the request row lock; gateway settlement remains
      // a separate, idempotent operation and is never inferred from approval.
      if (decision.approve && (
        current.reservation.status !== RegistrationReservationStatus.CONFIRMED ||
        current.reservation.finalPriceCents <= 0 ||
        (current.reservation.checkout?.status !== RegistrationCheckoutStatus.PAID
          && !(await this.groupedPaid(tx, { id: current.reservationId, eventId: event.id, organizationId: event.organizationId! })))
      )) {
        throw new ConflictException('A inscrição não possui pagamento confirmado para aprovar o reembolso.');
      }
      const status = decision.approve ? RegistrationRefundRequestStatus.APPROVED : RegistrationRefundRequestStatus.REJECTED;
      const updated = await tx.registrationRefundRequest.update({
        where: { id: current.id },
        data: { status, decisionNote: decision.note, decidedByUserId: userId, decidedAt: now },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          eventId: event.id,
          actorUserId: userId,
          action: decision.approve ? 'refund.approved' : 'refund.rejected',
          entityType: 'RegistrationRefundRequest',
          entityId: updated.id,
          metadata: { status, reservationId: current.reservationId } as Prisma.InputJsonObject,
        },
      });
      return {
        id: updated.id,
        protocol: current.reservation.protocol,
        status: updated.status,
        statusLabel: REFUND_REQUEST_LABEL[updated.status],
        decisionNote: updated.decisionNote,
        registrationStatus: current.reservation.status,
        checkoutStatus: current.reservation.checkout?.status ?? null,
      };
    });
  }

  private decisionOf(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) policyError(new RegistrationRefundPolicyError('Informe a análise do pedido.'));
    const raw = input as { decision?: unknown; note?: unknown };
    if (raw.decision !== 'APPROVE' && raw.decision !== 'REJECT') policyError(new RegistrationRefundPolicyError('Escolha aprovar ou recusar o pedido.'));
    let note: string;
    try { note = normalizeRefundText(raw.note, 'A justificativa'); }
    catch (error) { policyError(error); }
    return { approve: raw.decision === 'APPROVE', note };
  }

  private async createRequest(
    scope: { id: string; eventId: string; organizationId: string; protocol: string },
    input: unknown,
    userId: string | null,
    now: Date,
  ) {
    let reason: string;
    try { reason = normalizeRefundText(input && typeof input === 'object' ? (input as { reason?: unknown }).reason : undefined, 'O motivo'); }
    catch (error) { policyError(error); }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "EventRegistrationReservation"
        WHERE "id" = ${scope.id} AND "eventId" = ${scope.eventId} AND "organizationId" = ${scope.organizationId}
        FOR UPDATE
      `;
      const reservation = await tx.eventRegistrationReservation.findFirst({
        where: { id: scope.id, eventId: scope.eventId, organizationId: scope.organizationId },
        select: {
          id: true,
          protocol: true,
          status: true,
          finalPriceCents: true,
          checkout: { select: { status: true } },
          refundAcceptance: true,
          refundRequest: { select: { id: true, status: true, reason: true, decisionNote: true, createdAt: true, decidedAt: true } },
          event: { select: { timeZone: true } },
        },
      });
      if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
      if (reservation.refundRequest) return this.requestPayload(reservation.protocol, reservation.refundRequest);
      const paid = reservation.status === RegistrationReservationStatus.CONFIRMED
        && reservation.finalPriceCents > 0
        && (reservation.checkout?.status === RegistrationCheckoutStatus.PAID
          || await this.groupedPaid(tx, scope));
      if (!paid) throw new ConflictException('Só uma inscrição paga pode solicitar reembolso.');
      const eligibility = this.acceptedEligibility(reservation.refundAcceptance, reservation.event.timeZone, now);
      if (eligibility.eligible === null) throw new ConflictException(eligibility.message);
      if (!eligibility.eligible) throw new ConflictException(eligibility.message);
      try {
        const created = await tx.registrationRefundRequest.create({
          data: {
            reservationId: reservation.id,
            eventId: scope.eventId,
            organizationId: scope.organizationId,
            reason,
            requestedByUserId: userId,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: scope.organizationId,
            eventId: scope.eventId,
            actorUserId: userId,
            action: 'refund.requested',
            entityType: 'RegistrationRefundRequest',
            entityId: created.id,
            metadata: { reservationId: reservation.id } as Prisma.InputJsonObject,
          },
        });
        return this.requestPayload(reservation.protocol, created);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        const raced = await tx.registrationRefundRequest.findUnique({ where: { reservationId: reservation.id } });
        if (!raced) throw error;
        return this.requestPayload(reservation.protocol, raced);
      }
    });
  }

  private async reservationView(
    scope: { id: string; eventId: string; organizationId: string; protocol: string },
    now: Date,
  ) {
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { id: scope.id, eventId: scope.eventId, organizationId: scope.organizationId },
      select: {
        protocol: true,
        status: true,
        finalPriceCents: true,
        checkout: { select: { status: true } },
        refundAcceptance: true,
        refundRequest: { select: { id: true, status: true, reason: true, decisionNote: true, createdAt: true, decidedAt: true } },
        event: { select: { startDate: true, timeZone: true, refundPolicy: { select: { window: true, version: true } } } },
      },
    });
    if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
    const current = describeRefundPolicy({
      window: reservation.event.refundPolicy?.window ?? null,
      startDate: reservation.event.startDate,
      timeZone: reservation.event.timeZone,
      now,
    });
    const accepted = reservation.refundAcceptance
      ? this.acceptedEligibility(reservation.refundAcceptance, reservation.event.timeZone, now)
      : null;
    const paid = reservation.status === RegistrationReservationStatus.CONFIRMED
      && reservation.finalPriceCents > 0
      && (reservation.checkout?.status === RegistrationCheckoutStatus.PAID
        || await this.groupedPaid(this.prisma, scope));
    return {
      protocol: reservation.protocol,
      paid,
      current,
      accepted: accepted ? {
        ...accepted,
        version: reservation.refundAcceptance!.version,
        acceptedAt: reservation.refundAcceptance!.acceptedAt.toISOString(),
      } : null,
      request: reservation.refundRequest ? this.requestPayload(reservation.protocol, reservation.refundRequest) : null,
    };
  }

  private acceptedEligibility(
    acceptance: { window: RefundWindow; deadlineAt: Date | null; pendingCode: string | null } | null,
    timeZone: string | null,
    now: Date,
  ): RefundEligibility {
    if (!acceptance) {
      return {
        window: null,
        published: false,
        eligible: null,
        pending: 'UNRECORDED',
        deadline: null,
        message: 'A regra aceita nesta compra não foi registrada.',
      };
    }
    return describeAcceptedRefund({
      window: acceptance.window,
      deadlineAt: acceptance.deadlineAt,
      pendingCode: acceptance.pendingCode,
      now,
      timeZone,
    });
  }

  private requestPayload(
    protocol: string,
    request: { id: string; status: RegistrationRefundRequestStatus; reason: string; decisionNote: string | null; createdAt: Date; decidedAt: Date | null },
  ) {
    return {
      id: request.id,
      protocol,
      status: request.status,
      statusLabel: REFUND_REQUEST_LABEL[request.status],
      reason: request.reason,
      decisionNote: request.decisionNote,
      createdAt: request.createdAt.toISOString(),
      decidedAt: request.decidedAt?.toISOString() ?? null,
      moneyReturned: false,
    };
  }

  private async livePolicy(event: { id: string; organizationId: string | null; startDate: Date | null; timeZone: string | null }, now: Date) {
    const policy = await this.prisma.eventRefundPolicy.findUnique({
      where: { eventId_organizationId: { eventId: event.id, organizationId: event.organizationId! } },
      select: { window: true, version: true },
    });
    return {
      ...describeRefundPolicy({ window: policy?.window ?? null, startDate: event.startDate, timeZone: event.timeZone, now }),
      version: policy?.version ?? null,
      startDate: event.startDate?.toISOString() ?? null,
      timeZone: event.timeZone,
    };
  }

  private async publishedEvent(slugValue: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug: slugValue.trim().toLowerCase() },
      select: { id: true, organizationId: true, status: true, startDate: true, timeZone: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) throw new NotFoundException('Evento não encontrado.');
    return event;
  }

  private async organizerEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, startDate: true, timeZone: true, status: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    const membership = await this.authorization.requireRole(userId, event.organizationId, ORGANIZER_ROLES);
    return { ...event, organizerRole: membership.role };
  }

  private async sessionReservation(slug: string, authorization: string | undefined) {
    let token: string;
    try { token = normalizeParticipantToken(authorization); }
    catch { throw new UnauthorizedException('Sessão inválida ou expirada.'); }
    const session = await this.prisma.participantAccessSession.findFirst({
      where: {
        tokenHash: participantHash(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        reservation: { event: { slug: slug.trim().toLowerCase(), status: REFUND_EVENT_STATUS } },
      },
      select: { reservationId: true, eventId: true, organizationId: true, reservation: { select: { protocol: true } } },
    });
    if (!session) throw new UnauthorizedException('Sessão inválida ou expirada.');
    return { id: session.reservationId, eventId: session.eventId, organizationId: session.organizationId, protocol: session.reservation.protocol };
  }
}
