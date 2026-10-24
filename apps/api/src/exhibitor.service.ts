import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CapabilityStatus,
  EventStatus,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import {
  exhibitorDeadlineClosed,
  ExhibitorCredentialDraft,
  ExhibitorPolicyError,
  normalizeCredentialAttendance,
  normalizeExhibitorCompany,
  normalizeExhibitorCredential,
  normalizeExhibitorDownload,
  normalizeExhibitorForm,
  normalizeOrganizerExhibitorOrder,
  normalizeExhibitorOrderStatus,
  normalizeExhibitorProduct,
  quotaFor,
} from './exhibitor-policy';
import { PrismaService } from './prisma.service';

const ORGANIZER_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];

type Scope = { id: string; organizationId: string; name: string; slug: string; status: EventStatus; role?: MembershipRole };

function policyError(error: unknown): never {
  if (error instanceof ExhibitorPolicyError) throw new BadRequestException(error.message);
  throw error;
}

@Injectable()
export class ExhibitorService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async home(userId: string, eventId: string) {
    const event = await this.organizerEvent(userId, eventId);
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
      canManage: true,
      publicPath: `/evento/${encodeURIComponent(event.slug)}/expositor`,
      externalAccessAvailable: true,
      listLimited: { companies: companies.length >= 500, credentials: credentials.length >= 2000, orders: orders.length >= 1000 },
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
        priceCents: order.priceCents,
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

  async caexCompanies(userId: string, eventId: string, query = '', kind = 'EXHIBITOR', rawPage = '0', field = 'ALL') {
    const event = await this.organizerEvent(userId, eventId);
    const page = this.caexPage(rawPage);
    if (typeof query !== 'string' || query.length > 120 || !['EXHIBITOR', 'PROVIDER'].includes(kind)) {
      throw new BadRequestException('Informe uma busca de até 120 caracteres e um tipo de empresa válido.');
    }
    const q = query.trim();
    const fields: Record<string, string[]> = {
      ALL: ['legalName', 'tradeName', 'document', 'booth'],
      COMPANY: ['legalName', 'tradeName'], CONTACT: ['contactName'],
      EMAIL: ['loginEmail', 'contactEmail'], DOCUMENT: ['document'],
      BOOTH: ['booth'], CITY: ['city'], STATE: ['state'],
    };
    if (typeof field !== 'string' || !Object.prototype.hasOwnProperty.call(fields, field)) {
      throw new BadRequestException('Selecione um campo de busca válido.');
    }
    const where: Prisma.EventExhibitorCompanyWhereInput = {
      eventId: event.id, organizationId: event.organizationId,
      kind: kind as 'EXHIBITOR' | 'PROVIDER',
      ...(q ? { OR: fields[field].map((column) => ({
        [column]: { contains: q, mode: 'insensitive' as const },
      })) } : {}),
    };
    const rows = await this.prisma.eventExhibitorCompany.findMany({
      where, orderBy: [{ tradeName: 'asc' }, { id: 'asc' }], skip: page * 50, take: 51,
      select: { id: true, kind: true, legalName: true, tradeName: true, booth: true },
    });
    return { page, hasMore: rows.length > 50, items: rows.slice(0, 50) };
  }

  async caexCompany(userId: string, eventId: string, companyId: string, rawPage = '0', rawFormsPage = '0') {
    const event = await this.organizerEvent(userId, eventId);
    const page = this.caexPage(rawPage);
    const formsPage = this.caexPage(rawFormsPage);
    const scope = { eventId: event.id, organizationId: event.organizationId };
    const company = await this.prisma.eventExhibitorCompany.findFirst({
      where: { ...scope, id: companyId },
      select: { id: true, kind: true, legalName: true, tradeName: true, booth: true,
        quotaExhibitor: true, quotaAssembler: true, quotaService: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada neste evento.');
    const owned = { ...scope, companyId: company.id };
    const [credentials, total, forms, counts] = await Promise.all([
      this.prisma.eventExhibitorCredential.findMany({
        where: owned, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip: page * 100, take: 101,
        select: { id: true, companyId: true, kind: true, fullName: true, badgeName: true, role: true,
          credentialedAt: true, printedAt: true },
      }),
      this.prisma.eventExhibitorCredential.count({ where: owned }),
      this.prisma.eventExhibitorForm.findMany({
        where: { ...scope, audience: { in: [company.kind, 'BOTH'] } },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }, { id: 'asc' }], skip: formsPage * 50, take: 51,
        select: { id: true, title: true, kind: true, active: true, required: true, deadline: true, credentialKind: true,
          visits: { where: owned, select: { visitedAt: true }, take: 1 },
          products: { select: { orders: { where: owned, select: { status: true } } } } },
      }),
      this.prisma.eventExhibitorCredential.groupBy({ by: ['kind'], where: owned, _count: { _all: true } }),
    ]);
    return {
      company, page, total, hasMore: credentials.length > 100, formsPage, formsHaveMore: forms.length > 50,
      credentials: credentials.slice(0, 100).map((item) => ({
        ...item, companyTradeName: company.tradeName, companyKind: company.kind,
        credentialedAt: item.credentialedAt?.toISOString() ?? null, printedAt: item.printedAt?.toISOString() ?? null,
      })),
      forms: forms.slice(0, 50).map((form) => ({
        id: form.id, title: form.title, kind: form.kind, active: form.active, required: form.required,
        deadline: form.deadline?.toISOString().slice(0, 10) ?? null,
        visitedAt: form.visits[0]?.visitedAt.toISOString() ?? null,
        credentialCount: counts.filter((row) => !form.credentialKind || row.kind === form.credentialKind)
          .reduce((sum, row) => sum + row._count._all, 0),
        orderStatuses: form.products.flatMap((product) => product.orders.map((order) => order.status)),
      })),
    };
  }

  private caexPage(value: string) {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,4})$/.test(value)) {
      throw new BadRequestException('Informe uma página válida.');
    }
    return Number(value);
  }

  async saveCompany(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    return this.administrativeWrite(async (tx) => {
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
          return tx.eventExhibitorCompany.create({
            data: { ...data, organizationId: event.organizationId, eventId: event.id },
          });
        }
        const existing = await tx.eventExhibitorCompany.findFirst({
          where: { id: draft.id, eventId: event.id, organizationId: event.organizationId },
          select: { id: true },
        });
        if (!existing) throw new NotFoundException('Empresa não encontrada neste evento.');
        const used = await tx.eventExhibitorCredential.groupBy({ by: ['kind'], where: { companyId: existing.id, eventId: event.id, organizationId: event.organizationId }, _count: { _all: true } });
        if (used.some(row => row._count._all > quotaFor(row.kind, data))) throw new BadRequestException('A cota não pode ficar abaixo das credenciais já cadastradas.');
        return tx.eventExhibitorCompany.update({ where: { id: existing.id }, data });
      }, 'Já existe uma empresa com este documento ou e-mail de acesso neste evento.');
      await this.audit(event, userId, draft.id ? 'exhibitor.company_updated' : 'exhibitor.company_created', 'EventExhibitorCompany', saved.id, {
        kind: saved.kind,
      }, tx);
      return this.companyView(saved);
    });
  }

  async saveCredential(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    let draft;
    try { draft = normalizeExhibitorCredential(input); } catch (error) { policyError(error); }
    const saved = await this.persistCredential(event, draft, userId);
    return this.credentialView(saved);
  }

  async markCredential(userId: string, eventId: string, credentialId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    return this.administrativeWrite(async (tx) => {
      if (!/^[a-z0-9]{10,40}$/u.test(credentialId)) throw new NotFoundException('Credencial não encontrada neste evento.');
      let attendance;
      try { attendance = normalizeCredentialAttendance(input); } catch (error) { policyError(error); }
      const existing = await tx.eventExhibitorCredential.findFirst({
        where: { id: credentialId, eventId: event.id, organizationId: event.organizationId },
        select: { id: true, credentialedAt: true, printedAt: true },
      });
      if (!existing) throw new NotFoundException('Credencial não encontrada neste evento.');
      const now = new Date();
      const saved = await tx.eventExhibitorCredential.update({
        where: { id: existing.id },
        data: {
          credentialedAt: attendance.credentialed ? existing.credentialedAt ?? now : null,
          printedAt: attendance.printed ? existing.printedAt ?? now : null,
        },
      });
      await this.audit(event, userId, 'exhibitor.credential_marked', 'EventExhibitorCredential', saved.id, {
        credentialed: Boolean(saved.credentialedAt),
        printed: Boolean(saved.printedAt),
      }, tx);
      return {
        id: saved.id,
        credentialedAt: saved.credentialedAt?.toISOString() ?? null,
        printedAt: saved.printedAt?.toISOString() ?? null,
      };
    });
  }

  async saveForm(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    return this.administrativeWrite(async (tx) => {
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
        ? await tx.eventExhibitorForm.update({ where: { id: await this.ownedForm(event, draft.id, tx) }, data })
        : await tx.eventExhibitorForm.create({
          data: { ...data, organizationId: event.organizationId, eventId: event.id },
        });
      await this.audit(event, userId, draft.id ? 'exhibitor.form_updated' : 'exhibitor.form_created', 'EventExhibitorForm', saved.id, {
        audience: saved.audience,
        kind: saved.kind,
        active: saved.active,
      }, tx);
      return this.formView(saved);
    });
  }

  async saveProduct(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    return this.administrativeWrite(async (tx) => {
      let draft;
      try { draft = normalizeExhibitorProduct(input); } catch (error) { policyError(error); }
      const form = await tx.eventExhibitorForm.findFirst({
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
        ? await tx.eventExhibitorProduct.update({
          where: { id: await this.ownedProduct(event, draft.id, tx) },
          data,
        })
        : await tx.eventExhibitorProduct.create({
          data: { ...data, organizationId: event.organizationId, eventId: event.id },
        });
      await this.audit(event, userId, draft.id ? 'exhibitor.product_updated' : 'exhibitor.product_created', 'EventExhibitorProduct', saved.id, {
        formId: saved.formId,
        active: saved.active,
      }, tx);
      return { id: saved.id, formId: saved.formId, title: saved.title, unit: saved.unit, priceCents: saved.priceCents, active: saved.active };
    });
  }

  async saveDownload(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    return this.administrativeWrite(async (tx) => {
      let draft;
      try { draft = normalizeExhibitorDownload(input); } catch (error) { policyError(error); }
      const saved = draft.id
        ? await tx.eventExhibitorDownload.update({
          where: { id: await this.ownedDownload(event, draft.id, tx) },
          data: { title: draft.title, url: draft.url },
        })
        : await tx.eventExhibitorDownload.create({
          data: { title: draft.title, url: draft.url, organizationId: event.organizationId, eventId: event.id },
        });
      await this.audit(event, userId, draft.id ? 'exhibitor.download_updated' : 'exhibitor.download_created', 'EventExhibitorDownload', saved.id, {}, tx);
      return { id: saved.id, title: saved.title, url: saved.url };
    });
  }

  async setOrderStatus(userId: string, eventId: string, orderId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    if (!/^[a-z0-9]{10,40}$/u.test(orderId)) throw new NotFoundException('Pedido não encontrado neste evento.');
    let status;
    try { status = normalizeExhibitorOrderStatus(input); } catch (error) { policyError(error); }
    const existing = await this.prisma.eventExhibitorOrder.findFirst({
      where: { id: orderId, eventId: event.id, organizationId: event.organizationId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Pedido não encontrado neste evento.');
    if (existing.status === status) return { id: existing.id, status };
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('Não é possível alterar um pedido cancelado. Crie uma nova solicitação.');
    }
    if (status === 'REQUESTED') {
      throw new BadRequestException('Não é possível reverter um pedido confirmado para solicitado.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventExhibitorOrder.updateMany({
        where: { id: existing.id, eventId: event.id, organizationId: event.organizationId, status: existing.status },
        data: { status },
      });
      if (updated.count !== 1) throw new ConflictException('O pedido foi alterado. Atualize a página.');
      await tx.auditLog.create({ data: {
        organizationId: event.organizationId, eventId: event.id, actorUserId: userId,
        action: 'exhibitor.order_status', entityType: 'EventExhibitorOrder', entityId: existing.id,
        metadata: { previousStatus: existing.status, status },
      } });
      return { id: existing.id, status };
    });
  }

  async saveOrder(userId: string, eventId: string, input: unknown) {
    const event = await this.organizerEvent(userId, eventId);
    let draft;
    try { draft = normalizeOrganizerExhibitorOrder(input); } catch (error) { policyError(error); }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const scope = { eventId: event.id, organizationId: event.organizationId };
        const company = await tx.eventExhibitorCompany.findFirst({ where: { ...scope, id: draft.companyId }, select: { id: true, kind: true } });
        if (!company) throw new NotFoundException('Empresa não encontrada neste evento.');
        const product = await tx.eventExhibitorProduct.findFirst({
          where: { ...scope, id: draft.productId, active: true },
          select: { id: true, priceCents: true, form: { select: { active: true, kind: true, audience: true, deadline: true } } },
        });
        if (!product || !product.form.active || product.form.kind !== 'REQUEST'
          || (product.form.audience !== 'BOTH' && product.form.audience !== company.kind)) {
          throw new NotFoundException('Produto não encontrado para este público no evento.');
        }
        if (this.deadlineClosed(product.form.deadline)) throw new BadRequestException('O prazo deste formulário encerrou.');
        const current = await tx.eventExhibitorOrder.findFirst({ where: { ...scope, companyId: company.id, productId: product.id } });
        if (current?.status === 'CONFIRMED') throw new BadRequestException('Cancele o pedido confirmado antes de uma nova solicitação.');
        if (current?.status === 'REQUESTED' && current.quantity === draft.quantity) {
          return { id: current.id, quantity: current.quantity, priceCents: current.priceCents, status: current.status };
        }
        const data = { quantity: draft.quantity, status: 'REQUESTED' as const, priceCents: current?.status === 'REQUESTED' ? current.priceCents : product.priceCents };
        const saved = current
          ? await tx.eventExhibitorOrder.update({ where: { id: current.id }, data })
          : await tx.eventExhibitorOrder.create({ data: { ...scope, companyId: company.id, productId: product.id, ...data } });
        await tx.auditLog.create({ data: {
          ...scope, actorUserId: userId, action: 'exhibitor.order_requested', entityType: 'EventExhibitorOrder', entityId: saved.id,
          metadata: { companyId: company.id, productId: product.id, quantity: saved.quantity, priceCents: saved.priceCents },
        } });
        return { id: saved.id, quantity: saved.quantity, priceCents: saved.priceCents, status: saved.status };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictException('O pedido foi atualizado ao mesmo tempo. Atualize a página e tente novamente.');
      }
      throw error;
    }
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

  private async persistCredential(event: Scope, draft: ExhibitorCredentialDraft, actorUserId: string | null) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const company = await tx.eventExhibitorCompany.findFirst({
          where: { id: draft.companyId, eventId: event.id, organizationId: event.organizationId },
        });
        if (!company) throw new NotFoundException('Empresa não encontrada neste evento.');
        const existing = draft.id
          ? await tx.eventExhibitorCredential.findFirst({
            where: { id: draft.id, eventId: event.id, organizationId: event.organizationId },
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
        const changesQuota = !existing || existing.companyId !== company.id || existing.kind !== draft.kind;
        if (changesQuota && used >= quotaFor(draft.kind, company)) {
          throw new BadRequestException('A cota deste tipo de crachá já foi usada.');
        }
        const data = {
          companyId: company.id,
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
            metadata: {
              companyId: company.id,
              ...(existing && existing.companyId !== company.id ? { previousCompanyId: existing.companyId } : {}),
              kind: saved.kind,
            },
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

  private deadlineClosed(deadline: Date | null): boolean {
    return exhibitorDeadlineClosed(deadline);
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

  private async ownedForm(event: Scope, id: string, client: Prisma.TransactionClient = this.prisma): Promise<string> {
    const form = await client.eventExhibitorForm.findFirst({
      where: { id, eventId: event.id, organizationId: event.organizationId },
      select: { id: true },
    });
    if (!form) throw new NotFoundException('Formulário não encontrado neste evento.');
    return form.id;
  }

  private async ownedProduct(event: Scope, id: string, client: Prisma.TransactionClient = this.prisma): Promise<string> {
    const product = await client.eventExhibitorProduct.findFirst({
      where: { id, eventId: event.id, organizationId: event.organizationId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado neste evento.');
    return product.id;
  }

  private async ownedDownload(event: Scope, id: string, client: Prisma.TransactionClient = this.prisma): Promise<string> {
    const item = await client.eventExhibitorDownload.findFirst({
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

  private async administrativeWrite<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictException('Os dados foram atualizados ao mesmo tempo ou já existem. Atualize a página e tente novamente.');
      }
      throw error;
    }
  }

  private async audit(event: Scope, actorUserId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject, client: Prisma.TransactionClient = this.prisma) {
    await client.auditLog.create({
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


