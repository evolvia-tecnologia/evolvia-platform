import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CapabilityStatus,
  EventStatus,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import {
  EXHIBITOR_ACCESS_DENIED,
  ExhibitorCredentialDraft,
  ExhibitorPolicyError,
  normalizeCredentialAttendance,
  normalizeExhibitorAccess,
  normalizeExhibitorCompany,
  normalizeExhibitorCredential,
  normalizeExhibitorDownload,
  normalizeExhibitorForm,
  normalizeExhibitorMessage,
  normalizeExhibitorOrder,
  normalizeExhibitorOrderStatus,
  normalizeExhibitorProduct,
  normalizeExhibitorRepresentative,
  normalizeOwnCompanyProfile,
  quotaFor,
} from './exhibitor-policy';
import { PrismaService } from './prisma.service';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const ORGANIZER_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const SESSION_HOURS = 12;
const SESSION_DENIED = 'Sessão inválida ou expirada.';

type Scope = { id: string; organizationId: string; name: string; slug: string; status: EventStatus; role?: MembershipRole };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashesMatch(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function policyError(error: unknown): never {
  if (error instanceof ExhibitorPolicyError) throw new BadRequestException(error.message);
  throw error;
}

function bearerToken(authorization: string | undefined): string {
  const match = /^Bearer ([a-f0-9]{64})$/u.exec(authorization?.trim() ?? '');
  if (!match) throw new UnauthorizedException(SESSION_DENIED);
  return match[1];
}

@Injectable()
export class ExhibitorService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async home(userId: string, eventId: string) {
    const event = await this.staffEvent(userId, eventId);
    const organizationId = event.organizationId;
    const where = { eventId: event.id, organizationId };
    const [companies, credentials, forms, products, downloads, orders, messages] = await Promise.all([
      this.prisma.eventExhibitorCompany.findMany({
        where,
        orderBy: [{ tradeName: 'asc' }],
        take: 500,
      }),
      this.prisma.eventExhibitorCredential.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
        take: 2000,
        include: { company: { select: { tradeName: true, kind: true } } },
      }),
      this.prisma.eventExhibitorForm.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        take: 200,
      }),
      this.prisma.eventExhibitorProduct.findMany({
        where,
        orderBy: [{ title: 'asc' }],
        take: 200,
        include: { form: { select: { title: true } } },
      }),
      this.prisma.eventExhibitorDownload.findMany({
        where,
        orderBy: [{ title: 'asc' }],
        take: 100,
      }),
      this.prisma.eventExhibitorOrder.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: 1000,
        include: {
          company: { select: { tradeName: true, kind: true } },
          product: { select: { title: true, unit: true, priceCents: true, form: { select: { title: true } } } },
        },
      }),
      this.prisma.eventExhibitorMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
        include: { company: { select: { tradeName: true } } },
      }),
    ]);
    const credentialCounts = await this.prisma.eventExhibitorCredential.groupBy({
      by: ['companyId'],
      where,
      _count: { _all: true },
    });
    const companyCounts = new Map(credentialCounts.map((row) => [row.companyId, row._count._all]));
    const summaries = await Promise.all((['EXHIBITOR', 'PROVIDER'] as const).map(async (kind) => {
      const credentialWhere = { ...where, company: { kind } };
      const [companyTotals, total, credentialed, printed] = await Promise.all([
        this.prisma.eventExhibitorCompany.aggregate({
          where: { ...where, kind },
          _count: { _all: true },
          _sum: { quotaExhibitor: true, quotaAssembler: true, quotaService: true },
        }),
        this.prisma.eventExhibitorCredential.count({ where: credentialWhere }),
        this.prisma.eventExhibitorCredential.count({ where: { ...credentialWhere, credentialedAt: { not: null } } }),
        this.prisma.eventExhibitorCredential.count({ where: { ...credentialWhere, printedAt: { not: null } } }),
      ]);
      return {
        companies: companyTotals._count._all,
        quota: (companyTotals._sum.quotaExhibitor ?? 0) + (companyTotals._sum.quotaAssembler ?? 0) + (companyTotals._sum.quotaService ?? 0),
        credentials: total,
        credentialed,
        pending: total - credentialed,
        printed,
      };
    }));
    return {
      event: { id: event.id, name: event.name, slug: event.slug, status: event.status },
      canManage: event.role !== MembershipRole.OPERATOR,
      publicPath: event.status === EventStatus.PUBLISHED ? `/evento/${event.slug}/expositor` : null,
      summary: { exhibitors: summaries[0], providers: summaries[1] },
      companies: companies.map((company) => ({
        ...this.companyView(company),
        credentialCount: companyCounts.get(company.id) ?? 0,
      })),
      credentials: credentials.map((credential) => ({
        id: credential.id,
        companyId: credential.companyId,
        companyTradeName: credential.company.tradeName,
        companyKind: credential.company.kind,
        kind: credential.kind,
        nationality: credential.nationality,
        document: credential.document,
        fullName: credential.fullName,
        badgeName: credential.badgeName,
        role: credential.role,
        phone: credential.phone,
        mobile: credential.mobile,
        credentialedAt: credential.credentialedAt?.toISOString() ?? null,
        printedAt: credential.printedAt?.toISOString() ?? null,
      })),
      forms: forms.map((form) => this.formView(form)),
      products: products.map((product) => ({
        id: product.id,
        formId: product.formId,
        formTitle: product.form.title,
        title: product.title,
        unit: product.unit,
        priceCents: product.priceCents,
        active: product.active,
      })),
      downloads: downloads.map((item) => ({ id: item.id, title: item.title, url: item.url })),
      orders: orders.map((order) => ({
        id: order.id,
        companyId: order.companyId,
        companyTradeName: order.company.tradeName,
        companyKind: order.company.kind,
        productId: order.productId,
        productTitle: order.product.title,
        formTitle: order.product.form.title,
        unit: order.product.unit,
        priceCents: order.product.priceCents,
        quantity: order.quantity,
        status: order.status,
      })),
      messages: messages.map((message) => ({
        id: message.id,
        companyId: message.companyId,
        companyTradeName: message.company.tradeName,
        subject: message.subject,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  async saveCompany(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    let draft;
    try { draft = normalizeExhibitorCompany(input); } catch (error) { policyError(error); }
    const data = {
      kind: draft.kind,
      nationality: draft.nationality,
      document: draft.document,
      loginEmail: draft.loginEmail,
      legalName: draft.legalName,
      tradeName: draft.tradeName,
      segment: draft.segment,
      booth: draft.booth,
      areaLabel: draft.areaLabel,
      quotaExhibitor: draft.quotaExhibitor,
      quotaAssembler: draft.quotaAssembler,
      quotaService: draft.quotaService,
      contactName: draft.contactName,
      contactRole: draft.contactRole,
      contactEmail: draft.contactEmail,
      postalCode: draft.postalCode,
      street: draft.street,
      addressNumber: draft.addressNumber,
      complement: draft.complement,
      district: draft.district,
      city: draft.city,
      state: draft.state,
      country: draft.country,
      phone: draft.phone,
    };
    const saved = await this.writeUnique(async () => {
      if (!draft.id) {
        return this.prisma.eventExhibitorCompany.create({
          data: { ...data, organizationId: event.organizationId, eventId: event.id },
        });
      }
      const existing = await this.prisma.eventExhibitorCompany.findFirst({
        where: { id: draft.id, eventId: event.id, organizationId: event.organizationId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Empresa não encontrada neste evento.');
      return this.prisma.eventExhibitorCompany.update({ where: { id: existing.id }, data });
    }, 'Já existe uma empresa com este documento ou e-mail de acesso neste evento.');
    await this.audit(event, userId, draft.id ? 'exhibitor.company_updated' : 'exhibitor.company_created', 'EventExhibitorCompany', saved.id, {
      kind: saved.kind,
    });
    return this.companyView(saved);
  }

  async saveCredential(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    let draft;
    try { draft = normalizeExhibitorCredential(input); } catch (error) { policyError(error); }
    const saved = await this.persistCredential(event, draft, userId);
    return this.credentialView(saved);
  }

  async markCredential(userId: string, eventId: string, credentialId: string, input: unknown) {
    const event = await this.staffEvent(userId, eventId);
    if (!/^[a-z0-9]{10,40}$/u.test(credentialId)) throw new NotFoundException('Credencial não encontrada neste evento.');
    let attendance;
    try { attendance = normalizeCredentialAttendance(input); } catch (error) { policyError(error); }
    const existing = await this.prisma.eventExhibitorCredential.findFirst({
      where: { id: credentialId, eventId: event.id, organizationId: event.organizationId },
      select: { id: true, credentialedAt: true, printedAt: true },
    });
    if (!existing) throw new NotFoundException('Credencial não encontrada neste evento.');
    const now = new Date();
    const saved = await this.prisma.eventExhibitorCredential.update({
      where: { id: existing.id },
      data: {
        credentialedAt: attendance.credentialed ? existing.credentialedAt ?? now : null,
        printedAt: attendance.printed ? existing.printedAt ?? now : null,
      },
    });
    await this.audit(event, userId, 'exhibitor.credential_marked', 'EventExhibitorCredential', saved.id, {
      credentialed: Boolean(saved.credentialedAt),
      printed: Boolean(saved.printedAt),
    });
    return {
      id: saved.id,
      credentialedAt: saved.credentialedAt?.toISOString() ?? null,
      printedAt: saved.printedAt?.toISOString() ?? null,
    };
  }

  async saveForm(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    let draft;
    try { draft = normalizeExhibitorForm(input); } catch (error) { policyError(error); }
    const data = {
      sortOrder: draft.sortOrder,
      title: draft.title,
      active: draft.active,
      required: draft.required,
      deadline: draft.deadline ? new Date(`${draft.deadline}T00:00:00.000Z`) : null,
      audience: draft.audience,
      kind: draft.kind,
      credentialKind: draft.credentialKind,
      pdfUrl: draft.pdfUrl,
      wordUrl: draft.wordUrl,
    };
    const saved = draft.id
      ? await this.prisma.eventExhibitorForm.update({ where: { id: await this.ownedForm(event, draft.id) }, data })
      : await this.prisma.eventExhibitorForm.create({
        data: { ...data, organizationId: event.organizationId, eventId: event.id },
      });
    await this.audit(event, userId, draft.id ? 'exhibitor.form_updated' : 'exhibitor.form_created', 'EventExhibitorForm', saved.id, {
      audience: saved.audience,
      kind: saved.kind,
      active: saved.active,
    });
    return this.formView(saved);
  }

  async saveProduct(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    let draft;
    try { draft = normalizeExhibitorProduct(input); } catch (error) { policyError(error); }
    const form = await this.prisma.eventExhibitorForm.findFirst({
      where: { id: draft.formId, eventId: event.id, organizationId: event.organizationId, kind: 'REQUEST' },
      select: { id: true },
    });
    if (!form) throw new NotFoundException('Crie um formulário de solicitação antes de cadastrar o produto.');
    const data = {
      formId: form.id,
      title: draft.title,
      unit: draft.unit,
      priceCents: draft.priceCents,
      active: draft.active,
    };
    const saved = draft.id
      ? await this.prisma.eventExhibitorProduct.update({
        where: { id: await this.ownedProduct(event, draft.id) },
        data,
      })
      : await this.prisma.eventExhibitorProduct.create({
        data: { ...data, organizationId: event.organizationId, eventId: event.id },
      });
    await this.audit(event, userId, draft.id ? 'exhibitor.product_updated' : 'exhibitor.product_created', 'EventExhibitorProduct', saved.id, {
      formId: saved.formId,
      active: saved.active,
    });
    return { id: saved.id, formId: saved.formId, title: saved.title, unit: saved.unit, priceCents: saved.priceCents, active: saved.active };
  }

  async saveDownload(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    let draft;
    try { draft = normalizeExhibitorDownload(input); } catch (error) { policyError(error); }
    const saved = draft.id
      ? await this.prisma.eventExhibitorDownload.update({
        where: { id: await this.ownedDownload(event, draft.id) },
        data: { title: draft.title, url: draft.url },
      })
      : await this.prisma.eventExhibitorDownload.create({
        data: { title: draft.title, url: draft.url, organizationId: event.organizationId, eventId: event.id },
      });
    await this.audit(event, userId, draft.id ? 'exhibitor.download_updated' : 'exhibitor.download_created', 'EventExhibitorDownload', saved.id, {});
    return { id: saved.id, title: saved.title, url: saved.url };
  }

  async setOrderStatus(userId: string, eventId: string, orderId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    if (!/^[a-z0-9]{10,40}$/u.test(orderId)) throw new NotFoundException('Pedido não encontrado neste evento.');
    let status;
    try { status = normalizeExhibitorOrderStatus(input); } catch (error) { policyError(error); }
    const existing = await this.prisma.eventExhibitorOrder.findFirst({
      where: { id: orderId, eventId: event.id, organizationId: event.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Pedido não encontrado neste evento.');
    const saved = await this.prisma.eventExhibitorOrder.update({ where: { id: existing.id }, data: { status } });
    await this.audit(event, userId, 'exhibitor.order_status', 'EventExhibitorOrder', saved.id, { status: saved.status });
    return { id: saved.id, status: saved.status };
  }

  async createSession(slugValue: string, input: unknown) {
    let access;
    try { access = normalizeExhibitorAccess(input); }
    catch { throw new UnauthorizedException(EXHIBITOR_ACCESS_DENIED); }
    const event = await this.publishedExhibitorEvent(slugValue);
    if (!event) throw new UnauthorizedException(EXHIBITOR_ACCESS_DENIED);
    const company = await this.prisma.eventExhibitorCompany.findFirst({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        document: access.document,
        OR: [
          { loginEmail: access.email },
          { representatives: { some: { email: access.email } } },
        ],
      },
      select: { id: true },
    });
    if (!company) throw new UnauthorizedException(EXHIBITOR_ACCESS_DENIED);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    const session = await this.prisma.eventExhibitorSession.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        companyId: company.id,
        tokenHash: sha256(token),
        expiresAt,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        action: 'exhibitor.session_created',
        entityType: 'EventExhibitorSession',
        entityId: session.id,
        metadata: { expiresAt: expiresAt.toISOString() },
      },
    });
    return { accessToken: token, expiresAt: expiresAt.toISOString() };
  }

  async area(slugValue: string, authorization?: string) {
    const session = await this.requireSession(slugValue, authorization);
    const company = session.company;
    const where = { companyId: company.id, eventId: session.eventId, organizationId: session.organizationId };
    const audiences = company.kind === 'PROVIDER' ? ['PROVIDER', 'BOTH'] as const : ['EXHIBITOR', 'BOTH'] as const;
    const [credentials, representatives, forms, orders, downloads, messages] = await Promise.all([
      this.prisma.eventExhibitorCredential.findMany({ where, orderBy: [{ fullName: 'asc' }], take: 500 }),
      this.prisma.eventExhibitorRepresentative.findMany({ where, orderBy: [{ name: 'asc' }], take: 50 }),
      this.prisma.eventExhibitorForm.findMany({
        where: { eventId: session.eventId, organizationId: session.organizationId, active: true, audience: { in: [...audiences] } },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        take: 100,
        include: { products: { where: { active: true }, orderBy: [{ title: 'asc' }], take: 50 } },
      }),
      this.prisma.eventExhibitorOrder.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
        include: { product: { select: { title: true, unit: true, priceCents: true, form: { select: { title: true } } } } },
      }),
      this.prisma.eventExhibitorDownload.findMany({
        where: { eventId: session.eventId, organizationId: session.organizationId },
        orderBy: [{ title: 'asc' }],
        take: 100,
      }),
      this.prisma.eventExhibitorMessage.findMany({ where, orderBy: [{ createdAt: 'desc' }], take: 50 }),
    ]);
    const used = { EXHIBITOR: 0, ASSEMBLER: 0, SERVICE: 0 };
    const counts = await this.prisma.eventExhibitorCredential.groupBy({
      by: ['kind'], where, _count: { _all: true },
    });
    for (const row of counts) used[row.kind] = row._count._all;
    return {
      event: { name: session.event.name, slug: session.event.slug },
      sessionExpiresAt: session.expiresAt.toISOString(),
      company: {
        ...this.companyView(company),
        remaining: {
          EXHIBITOR: Math.max(0, company.quotaExhibitor - used.EXHIBITOR),
          ASSEMBLER: Math.max(0, company.quotaAssembler - used.ASSEMBLER),
          SERVICE: Math.max(0, company.quotaService - used.SERVICE),
        },
      },
      credentials: credentials.map((credential) => this.credentialView(credential)),
      representatives: representatives.map((person) => ({ id: person.id, name: person.name, role: person.role, email: person.email })),
      forms: forms.map((form) => ({
        ...this.formView(form),
        closed: this.deadlineClosed(form.deadline),
        products: form.kind === 'REQUEST'
          ? form.products.map((product) => ({ id: product.id, title: product.title, unit: product.unit, priceCents: product.priceCents }))
          : [],
      })),
      orders: orders.map((order) => ({
        id: order.id,
        productId: order.productId,
        productTitle: order.product.title,
        formTitle: order.product.form.title,
        unit: order.product.unit,
        priceCents: order.product.priceCents,
        quantity: order.quantity,
        status: order.status,
      })),
      downloads: downloads.map((item) => ({ id: item.id, title: item.title, url: item.url })),
      messages: messages.map((message) => ({
        id: message.id,
        subject: message.subject,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  async saveOwnCredential(slugValue: string, authorization: string | undefined, input: unknown) {
    const session = await this.requireSession(slugValue, authorization);
    let draft;
    try { draft = normalizeExhibitorCredential(input); } catch (error) { policyError(error); }
    if (draft.companyId !== session.companyId) throw new NotFoundException('Credencial não encontrada neste evento.');
    await this.requireOpenCredentialForm(session.eventId, session.organizationId, session.company.kind, draft.kind);
    const saved = await this.persistCredential(
      { id: session.eventId, organizationId: session.organizationId, name: session.event.name, slug: session.event.slug, status: session.event.status },
      draft,
      null,
    );
    return this.credentialView(saved);
  }

  async requestOrder(slugValue: string, authorization: string | undefined, input: unknown) {
    const session = await this.requireSession(slugValue, authorization);
    let draft;
    try { draft = normalizeExhibitorOrder(input); } catch (error) { policyError(error); }
    const product = await this.prisma.eventExhibitorProduct.findFirst({
      where: { id: draft.productId, eventId: session.eventId, organizationId: session.organizationId, active: true },
      select: { id: true, form: { select: { active: true, kind: true, audience: true, deadline: true } } },
    });
    const visible = product?.form.active && product.form.kind === 'REQUEST'
      && (product.form.audience === 'BOTH' || product.form.audience === session.company.kind);
    if (!product || !visible) throw new NotFoundException('Produto não encontrado neste evento.');
    if (this.deadlineClosed(product.form.deadline)) throw new BadRequestException('O prazo deste formulário encerrou.');
    const saved = await this.prisma.$transaction(async (tx) => {
      const current = await tx.eventExhibitorOrder.findFirst({
        where: { companyId: session.companyId, productId: product.id, eventId: session.eventId, organizationId: session.organizationId },
      });
      if (current?.status === 'CONFIRMED') {
        throw new BadRequestException('Este pedido já foi confirmado. O organizador precisa cancelar antes de uma nova solicitação.');
      }
      if (current) {
        const updated = await tx.eventExhibitorOrder.updateMany({
          where: { id: current.id, companyId: session.companyId, eventId: session.eventId, organizationId: session.organizationId, status: { not: 'CONFIRMED' } },
          data: { quantity: draft.quantity, status: 'REQUESTED' },
        });
        if (updated.count !== 1) throw new ConflictException('Este pedido foi confirmado durante a solicitação. Atualize a página.');
      }
      const order = current
        ? await tx.eventExhibitorOrder.findUniqueOrThrow({ where: { id: current.id } })
        : await tx.eventExhibitorOrder.create({
          data: {
            organizationId: session.organizationId,
            eventId: session.eventId,
            companyId: session.companyId,
            productId: product.id,
            quantity: draft.quantity,
            status: 'REQUESTED',
          },
        });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          eventId: session.eventId,
          action: 'exhibitor.order_requested',
          entityType: 'EventExhibitorOrder',
          entityId: order.id,
          metadata: { quantity: order.quantity },
        },
      });
      return order;
    });
    return { id: saved.id, productId: saved.productId, quantity: saved.quantity, status: saved.status };
  }

  async addRepresentative(slugValue: string, authorization: string | undefined, input: unknown) {
    const session = await this.requireSession(slugValue, authorization);
    let draft;
    try { draft = normalizeExhibitorRepresentative(input); } catch (error) { policyError(error); }
    const saved = await this.writeUnique(() => this.prisma.eventExhibitorRepresentative.create({
      data: {
        organizationId: session.organizationId,
        eventId: session.eventId,
        companyId: session.companyId,
        name: draft.name,
        role: draft.role,
        email: draft.email,
      },
    }), 'Este e-mail já representa esta empresa.');
    await this.prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        eventId: session.eventId,
        action: 'exhibitor.representative_created',
        entityType: 'EventExhibitorRepresentative',
        entityId: saved.id,
        metadata: {},
      },
    });
    return { id: saved.id, name: saved.name, role: saved.role, email: saved.email };
  }

  async sendMessage(slugValue: string, authorization: string | undefined, input: unknown) {
    const session = await this.requireSession(slugValue, authorization);
    let draft;
    try { draft = normalizeExhibitorMessage(input); } catch (error) { policyError(error); }
    const saved = await this.prisma.eventExhibitorMessage.create({
      data: {
        organizationId: session.organizationId,
        eventId: session.eventId,
        companyId: session.companyId,
        subject: draft.subject,
        body: draft.body,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        eventId: session.eventId,
        action: 'exhibitor.message_created',
        entityType: 'EventExhibitorMessage',
        entityId: saved.id,
        metadata: {},
      },
    });
    return { id: saved.id, subject: saved.subject, createdAt: saved.createdAt.toISOString() };
  }

  async updateOwnProfile(slugValue: string, authorization: string | undefined, input: unknown) {
    const session = await this.requireSession(slugValue, authorization);
    let draft;
    try { draft = normalizeOwnCompanyProfile(input); } catch (error) { policyError(error); }
    const saved = await this.prisma.eventExhibitorCompany.update({
      where: { id: session.companyId },
      data: draft,
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        eventId: session.eventId,
        action: 'exhibitor.profile_updated',
        entityType: 'EventExhibitorCompany',
        entityId: saved.id,
        metadata: {},
      },
    });
    return this.companyView(saved);
  }

  async revoke(slugValue: string, authorization?: string) {
    const session = await this.requireSession(slugValue, authorization);
    await this.prisma.eventExhibitorSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        eventId: session.eventId,
        action: 'exhibitor.session_revoked',
        entityType: 'EventExhibitorSession',
        entityId: session.id,
        metadata: {},
      },
    });
    return { revoked: true };
  }

  private async staffEvent(userId: string, eventId: string): Promise<Scope & { role: MembershipRole }> {
    return this.eventFor(userId, eventId, STAFF_ROLES);
  }

  private async organizerEvent(userId: string, eventId: string): Promise<Scope & { role: MembershipRole }> {
    return this.eventFor(userId, eventId, ORGANIZER_ROLES);
  }

  private async eventFor(userId: string, eventId: string, roles: MembershipRole[]): Promise<Scope & { role: MembershipRole }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        organizationId: true,
        capabilities: { where: { code: 'exhibitor', status: CapabilityStatus.ACTIVE }, select: { id: true } },
      },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    const membership = await this.authorization.requireRole(userId, event.organizationId, roles);
    if (event.capabilities.length === 0) throw new NotFoundException('A área do expositor não está ligada neste evento.');
    return { ...event, organizationId: event.organizationId, role: membership.role };
  }

  private async publishedExhibitorEvent(slugValue: string) {
    const slug = slugValue.trim().toLowerCase();
    if (!slug) return null;
    const event = await this.prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        organizationId: true,
        status: true,
        capabilities: { where: { code: 'exhibitor', status: CapabilityStatus.ACTIVE }, select: { id: true } },
      },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED || event.capabilities.length === 0) return null;
    return { id: event.id, organizationId: event.organizationId };
  }

  private async requireSession(slugValue: string, authorization?: string) {
    let token: string;
    try { token = bearerToken(authorization); }
    catch { throw new UnauthorizedException(SESSION_DENIED); }
    const hash = sha256(token);
    const slug = slugValue.trim().toLowerCase();
    const session = await this.prisma.eventExhibitorSession.findFirst({
      where: {
        tokenHash: hash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        event: {
          slug,
          status: EventStatus.PUBLISHED,
          capabilities: { some: { code: 'exhibitor', status: CapabilityStatus.ACTIVE } },
        },
      },
      include: {
        company: true,
        event: { select: { name: true, slug: true, status: true } },
      },
    });
    if (!session || !hashesMatch(session.tokenHash, hash)) throw new UnauthorizedException(SESSION_DENIED);
    return session;
  }

  private async persistCredential(event: Scope, draft: ExhibitorCredentialDraft, actorUserId: string | null) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const company = await tx.eventExhibitorCompany.findFirst({
          where: { id: draft.companyId, eventId: event.id, organizationId: event.organizationId },
        });
        if (!company) throw new NotFoundException('Empresa não encontrada neste evento.');
        const existing = draft.id
          ? await tx.eventExhibitorCredential.findFirst({
            where: { id: draft.id, companyId: company.id, eventId: event.id, organizationId: event.organizationId },
          })
          : null;
        if (draft.id && !existing) throw new NotFoundException('Credencial não encontrada neste evento.');
        const used = await tx.eventExhibitorCredential.count({
          where: {
            companyId: company.id,
            eventId: event.id,
            organizationId: event.organizationId,
            kind: draft.kind,
            ...(existing ? { id: { not: existing.id } } : {}),
          },
        });
        if (existing?.kind !== draft.kind && used >= quotaFor(draft.kind, company)) {
          throw new BadRequestException('A cota deste tipo de crachá já foi usada.');
        }
        const data = {
          kind: draft.kind,
          nationality: draft.nationality,
          document: draft.document,
          fullName: draft.fullName,
          badgeName: draft.badgeName,
          role: draft.role,
          phone: draft.phone,
          mobile: draft.mobile,
        };
        const saved = existing
          ? await tx.eventExhibitorCredential.update({ where: { id: existing.id }, data })
          : await tx.eventExhibitorCredential.create({
            data: { ...data, organizationId: event.organizationId, eventId: event.id, companyId: company.id },
          });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            actorUserId,
            action: existing ? 'exhibitor.credential_updated' : 'exhibitor.credential_created',
            entityType: 'EventExhibitorCredential',
            entityId: saved.id,
            metadata: { companyId: company.id, kind: saved.kind },
          },
        });
        return saved;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta pessoa já tem credencial nesta empresa.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('A cota foi atualizada ao mesmo tempo. Tente de novo.');
      }
      throw error;
    }
  }

  private async requireOpenCredentialForm(eventId: string, organizationId: string, companyKind: 'EXHIBITOR' | 'PROVIDER', credentialKind: string) {
    const forms = await this.prisma.eventExhibitorForm.findMany({
      where: {
        eventId,
        organizationId,
        active: true,
        kind: 'CREDENTIAL',
        audience: { in: companyKind === 'PROVIDER' ? ['PROVIDER', 'BOTH'] : ['EXHIBITOR', 'BOTH'] },
      },
      select: { credentialKind: true, deadline: true },
      take: 50,
    });
    const matching = forms.filter((form) => form.credentialKind === null || form.credentialKind === credentialKind);
    if (matching.length === 0) throw new BadRequestException('O organizador ainda não abriu este formulário.');
    if (matching.every((form) => this.deadlineClosed(form.deadline))) throw new BadRequestException('O prazo deste formulário encerrou.');
  }

  private deadlineClosed(deadline: Date | null): boolean {
    if (!deadline) return false;
    return deadline.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10);
  }

  private formView(form: {
    id: string;
    sortOrder: number;
    title: string;
    active: boolean;
    required: boolean;
    deadline: Date | null;
    audience: string;
    kind: string;
    credentialKind: string | null;
    pdfUrl: string;
    wordUrl: string;
  }) {
    return {
      id: form.id,
      sortOrder: form.sortOrder,
      title: form.title,
      active: form.active,
      required: form.required,
      deadline: form.deadline ? form.deadline.toISOString().slice(0, 10) : null,
      audience: form.audience,
      kind: form.kind,
      credentialKind: form.credentialKind,
      pdfUrl: form.pdfUrl,
      wordUrl: form.wordUrl,
    };
  }

  private async ownedForm(event: Scope, id: string): Promise<string> {
    const form = await this.prisma.eventExhibitorForm.findFirst({
      where: { id, eventId: event.id, organizationId: event.organizationId },
      select: { id: true },
    });
    if (!form) throw new NotFoundException('Formulário não encontrado neste evento.');
    return form.id;
  }

  private async ownedProduct(event: Scope, id: string): Promise<string> {
    const product = await this.prisma.eventExhibitorProduct.findFirst({
      where: { id, eventId: event.id, organizationId: event.organizationId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado neste evento.');
    return product.id;
  }

  private async ownedDownload(event: Scope, id: string): Promise<string> {
    const item = await this.prisma.eventExhibitorDownload.findFirst({
      where: { id, eventId: event.id, organizationId: event.organizationId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Download não encontrado neste evento.');
    return item.id;
  }

  private companyView(company: {
    id: string;
    kind: string;
    nationality: string;
    document: string;
    loginEmail: string;
    legalName: string;
    tradeName: string;
    segment: string;
    booth: string;
    areaLabel: string;
    quotaExhibitor: number;
    quotaAssembler: number;
    quotaService: number;
    contactName: string;
    contactRole: string;
    contactEmail: string;
    postalCode: string;
    street: string;
    addressNumber: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    country: string;
    phone: string;
  }) {
    return {
      id: company.id,
      kind: company.kind,
      nationality: company.nationality,
      document: company.document,
      loginEmail: company.loginEmail,
      legalName: company.legalName,
      tradeName: company.tradeName,
      segment: company.segment,
      booth: company.booth,
      areaLabel: company.areaLabel,
      quotaExhibitor: company.quotaExhibitor,
      quotaAssembler: company.quotaAssembler,
      quotaService: company.quotaService,
      contactName: company.contactName,
      contactRole: company.contactRole,
      contactEmail: company.contactEmail,
      postalCode: company.postalCode,
      street: company.street,
      addressNumber: company.addressNumber,
      complement: company.complement,
      district: company.district,
      city: company.city,
      state: company.state,
      country: company.country,
      phone: company.phone,
    };
  }

  private credentialView(credential: {
    id: string;
    companyId: string;
    kind: string;
    nationality: string;
    document: string;
    fullName: string;
    badgeName: string;
    role: string;
    phone: string;
    mobile: string;
    credentialedAt: Date | null;
    printedAt: Date | null;
  }) {
    return {
      id: credential.id,
      companyId: credential.companyId,
      kind: credential.kind,
      nationality: credential.nationality,
      document: credential.document,
      fullName: credential.fullName,
      badgeName: credential.badgeName,
      role: credential.role,
      phone: credential.phone,
      mobile: credential.mobile,
      credentialedAt: credential.credentialedAt?.toISOString() ?? null,
      printedAt: credential.printedAt?.toISOString() ?? null,
    };
  }

  private async writeUnique<T>(action: () => Promise<T>, message: string): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(message);
      throw error;
    }
  }

  private async audit(event: Scope, actorUserId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId,
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  }
}
