import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CapabilityStatus, EventStatus, Prisma } from '@prisma/client';
import {
  exhibitorDeadlineClosed,
  exhibitorFormProgress,
  ExhibitorPolicyError,
  normalizeCompanyCredential,
  normalizeCompanyOrder,
  normalizeExhibitorRepresentative,
  normalizeOwnCompanyProfile,
  quotaFor,
} from './exhibitor-policy';
import { PrismaService } from './prisma.service';

const COMPANY_DENIED = 'Não há empresa deste evento ligada a esta conta.';
const PROFILE_DENIED = 'Somente a conta do e-mail de acesso altera estes dados.';

type Access = 'ACCOUNT' | 'REPRESENTATIVE';
type EventScope = { id: string; organizationId: string; name: string; slug: string };
type Actor = { id: string; email: string; name: string };

function policyError(error: unknown): never {
  if (error instanceof ExhibitorPolicyError) throw new BadRequestException(error.message);
  throw error;
}

export class ExhibitorCompanyService {
  private readonly prisma: PrismaService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
  }

  async home(userId: string, tokenEmail: string, slug: string, companyId?: string) {
    const actor = await this.actor(userId, tokenEmail);
    const event = await this.eventBySlug(slug);
    const matches = await this.matches(event, actor.email);
    if (companyId && !/^[a-z0-9]{10,40}$/u.test(companyId)) throw new NotFoundException(COMPANY_DENIED);
    const chosen = this.choose(matches, companyId);
    if (!chosen) {
      return {
        needsChoice: true as const,
        event: { name: event.name, slug: event.slug },
        accountName: actor.name,
        companies: matches.map((company) => ({
          id: company.id,
          tradeName: company.tradeName,
          kind: company.kind,
          access: this.accessOf(company, actor.email),
        })),
      };
    }
    return this.workspace(event, chosen, actor);
  }

  async updateProfile(userId: string, tokenEmail: string, slug: string, companyId: string, input: unknown) {
    const loaded = await this.bound(userId, tokenEmail, slug, companyId);
    if (loaded.access !== 'ACCOUNT') throw new ForbiddenException(PROFILE_DENIED);
    let draft;
    try { draft = normalizeOwnCompanyProfile(input); } catch (error) { policyError(error); }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventExhibitorCompany.updateMany({
        where: { id: loaded.company.id, eventId: loaded.event.id, organizationId: loaded.event.organizationId },
        data: draft,
      });
      if (updated.count !== 1) throw new NotFoundException(COMPANY_DENIED);
      await this.audit(tx, loaded, 'exhibitor.company_profile_updated', 'EventExhibitorCompany', loaded.company.id, {});
    });
    try {
      return await this.home(userId, tokenEmail, slug, companyId);
    } catch {
      return { saved: true as const, refreshRequired: true as const, companyId: loaded.company.id };
    }
  }

  async addRepresentative(userId: string, tokenEmail: string, slug: string, companyId: string, input: unknown) {
    const loaded = await this.bound(userId, tokenEmail, slug, companyId);
    if (loaded.access !== 'ACCOUNT') throw new ForbiddenException(PROFILE_DENIED);
    let draft;
    try { draft = normalizeExhibitorRepresentative(input); } catch (error) { policyError(error); }
    if (draft.email === loaded.company.loginEmail) {
      throw new BadRequestException('O e-mail de acesso da empresa não entra como representante.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const saved = await tx.eventExhibitorRepresentative.create({
          data: {
            ...draft,
            organizationId: loaded.event.organizationId,
            eventId: loaded.event.id,
            companyId: loaded.company.id,
          },
        });
        await this.audit(tx, loaded, 'exhibitor.representative_created', 'EventExhibitorRepresentative', saved.id, {});
        return { id: saved.id, name: saved.name, role: saved.role, email: saved.email };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este e-mail já é representante desta empresa.');
      }
      throw error;
    }
  }

  async removeRepresentative(userId: string, tokenEmail: string, slug: string, companyId: string, representativeId: string) {
    const loaded = await this.bound(userId, tokenEmail, slug, companyId);
    if (loaded.access !== 'ACCOUNT') throw new ForbiddenException(PROFILE_DENIED);
    if (!/^[a-z0-9]{10,40}$/u.test(representativeId)) throw new NotFoundException('Representante não encontrado nesta empresa.');
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.eventExhibitorRepresentative.deleteMany({
        where: {
          id: representativeId,
          companyId: loaded.company.id,
          eventId: loaded.event.id,
          organizationId: loaded.event.organizationId,
        },
      });
      if (removed.count !== 1) throw new NotFoundException('Representante não encontrado nesta empresa.');
      await this.audit(tx, loaded, 'exhibitor.representative_removed', 'EventExhibitorRepresentative', representativeId, {});
    });
    return { id: representativeId, removed: true };
  }

  async visitForm(userId: string, tokenEmail: string, slug: string, companyId: string, formId: string) {
    const loaded = await this.bound(userId, tokenEmail, slug, companyId);
    if (!/^[a-z0-9]{10,40}$/u.test(formId)) throw new NotFoundException('Formulário não encontrado para esta empresa.');
    const form = await this.visibleForm(loaded, formId, 'DOCUMENT');
    const existing = await this.prisma.eventExhibitorFormVisit.findFirst({
      where: { companyId: loaded.company.id, formId: form.id, eventId: loaded.event.id, organizationId: loaded.event.organizationId },
      select: { id: true, visitedAt: true },
    });
    if (existing) return { id: existing.id, visitedAt: existing.visitedAt.toISOString() };
    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const created = await tx.eventExhibitorFormVisit.create({
          data: {
            organizationId: loaded.event.organizationId,
            eventId: loaded.event.id,
            companyId: loaded.company.id,
            formId: form.id,
          },
        });
        await this.audit(tx, loaded, 'exhibitor.form_visited', 'EventExhibitorFormVisit', created.id, { formId: form.id });
        return created;
      });
      return { id: saved.id, visitedAt: saved.visitedAt.toISOString() };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = await this.prisma.eventExhibitorFormVisit.findFirst({
          where: { companyId: loaded.company.id, formId: form.id, eventId: loaded.event.id, organizationId: loaded.event.organizationId },
          select: { id: true, visitedAt: true },
        });
        if (again) return { id: again.id, visitedAt: again.visitedAt.toISOString() };
      }
      throw error;
    }
  }

  async addCredential(userId: string, tokenEmail: string, slug: string, companyId: string, input: unknown) {
    const loaded = await this.bound(userId, tokenEmail, slug, companyId);
    let draft;
    try { draft = normalizeCompanyCredential(input); } catch (error) { policyError(error); }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const form = await this.visibleForm(loaded, draft.formId, 'CREDENTIAL', tx);
        if (exhibitorDeadlineClosed(form.deadline)) throw new BadRequestException('O prazo deste formulário encerrou.');
        if (form.credentialKind && form.credentialKind !== draft.kind) {
          throw new BadRequestException('Este formulário aceita outro tipo de crachá.');
        }
        const used = await tx.eventExhibitorCredential.count({
          where: {
            companyId: loaded.company.id,
            eventId: loaded.event.id,
            organizationId: loaded.event.organizationId,
            kind: draft.kind,
          },
        });
        if (used >= quotaFor(draft.kind, loaded.company)) throw new BadRequestException('A cota deste tipo de crachá já foi usada.');
        const saved = await tx.eventExhibitorCredential.create({
          data: {
            organizationId: loaded.event.organizationId,
            eventId: loaded.event.id,
            companyId: loaded.company.id,
            kind: draft.kind,
            nationality: draft.nationality,
            document: draft.document,
            fullName: draft.fullName,
            badgeName: draft.badgeName,
            role: draft.role,
            phone: draft.phone,
            mobile: draft.mobile,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: loaded.event.organizationId,
            eventId: loaded.event.id,
            actorUserId: loaded.actor.id,
            action: 'exhibitor.credential_created',
            entityType: 'EventExhibitorCredential',
            entityId: saved.id,
            metadata: { companyId: loaded.company.id, formId: form.id, kind: saved.kind },
          },
        });
        return {
          id: saved.id,
          kind: saved.kind,
          fullName: saved.fullName,
          badgeName: saved.badgeName,
          role: saved.role,
        };
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

  async requestOrder(userId: string, tokenEmail: string, slug: string, companyId: string, input: unknown) {
    const loaded = await this.bound(userId, tokenEmail, slug, companyId);
    let draft;
    try { draft = normalizeCompanyOrder(input); } catch (error) { policyError(error); }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const form = await this.visibleForm(loaded, draft.formId, 'REQUEST', tx);
        if (exhibitorDeadlineClosed(form.deadline)) throw new BadRequestException('O prazo deste formulário encerrou.');
        const product = await tx.eventExhibitorProduct.findFirst({
          where: {
            id: draft.productId,
            formId: form.id,
            eventId: loaded.event.id,
            organizationId: loaded.event.organizationId,
            active: true,
          },
          select: { id: true, priceCents: true },
        });
        if (!product) throw new NotFoundException('Produto não encontrado neste formulário.');
        const current = await tx.eventExhibitorOrder.findFirst({
          where: {
            companyId: loaded.company.id,
            productId: product.id,
            eventId: loaded.event.id,
            organizationId: loaded.event.organizationId,
          },
        });
        if (current?.status === 'CONFIRMED') throw new BadRequestException('Este pedido já foi confirmado pela organização.');
        if (current?.status === 'REQUESTED' && current.quantity === draft.quantity) {
          return { id: current.id, quantity: current.quantity, priceCents: current.priceCents, status: current.status };
        }
        const data = {
          quantity: draft.quantity,
          status: 'REQUESTED' as const,
          priceCents: current?.status === 'REQUESTED' ? current.priceCents : product.priceCents,
        };
        const saved = current
          ? await tx.eventExhibitorOrder.update({ where: { id: current.id }, data })
          : await tx.eventExhibitorOrder.create({
            data: {
              ...data,
              organizationId: loaded.event.organizationId,
              eventId: loaded.event.id,
              companyId: loaded.company.id,
              productId: product.id,
            },
          });
        await tx.auditLog.create({
          data: {
            organizationId: loaded.event.organizationId,
            eventId: loaded.event.id,
            actorUserId: loaded.actor.id,
            action: 'exhibitor.order_requested',
            entityType: 'EventExhibitorOrder',
            entityId: saved.id,
            metadata: { companyId: loaded.company.id, formId: form.id, productId: product.id, quantity: saved.quantity, priceCents: saved.priceCents },
          },
        });
        return { id: saved.id, quantity: saved.quantity, priceCents: saved.priceCents, status: saved.status };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new ConflictException('O pedido foi atualizado ao mesmo tempo. Atualize a página e tente novamente.');
      }
      throw error;
    }
  }

  private async workspace(event: EventScope, company: CompanyRow, actor: Actor) {
    const scope = { eventId: event.id, organizationId: event.organizationId, companyId: company.id };
    const audience = { in: [company.kind, 'BOTH'] as Array<typeof company.kind | 'BOTH'> };
    const [credentials, forms, products, orders, downloads, representatives, visits] = await Promise.all([
      this.prisma.eventExhibitorCredential.findMany({
        where: scope,
        orderBy: { fullName: 'asc' },
        take: 500,
      }),
      this.prisma.eventExhibitorForm.findMany({
        where: { eventId: event.id, organizationId: event.organizationId, active: true, audience },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        take: 200,
      }),
      this.prisma.eventExhibitorProduct.findMany({
        where: { eventId: event.id, organizationId: event.organizationId, active: true, form: { active: true, audience } },
        orderBy: { title: 'asc' },
        take: 200,
      }),
      this.prisma.eventExhibitorOrder.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { product: { select: { title: true, unit: true, formId: true, form: { select: { title: true, deadline: true } } } } },
      }),
      this.prisma.eventExhibitorDownload.findMany({
        where: { eventId: event.id, organizationId: event.organizationId },
        orderBy: { title: 'asc' },
        take: 100,
      }),
      this.prisma.eventExhibitorRepresentative.findMany({
        where: scope,
        orderBy: { name: 'asc' },
        take: 100,
      }),
      this.prisma.eventExhibitorFormVisit.findMany({
        where: scope,
        select: { formId: true },
        take: 200,
      }),
    ]);
    const visited = new Set(visits.map((visit) => visit.formId));
    const access = this.accessOf(company, actor.email);
    return {
      needsChoice: false as const,
      access,
      canManage: access === 'ACCOUNT',
      accountName: actor.name,
      event: { name: event.name, slug: event.slug },
      company: {
        id: company.id,
        kind: company.kind,
        nationality: company.nationality,
        document: company.document,
        loginEmail: company.loginEmail,
        legalName: company.legalName,
        tradeName: company.tradeName,
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
      },
      quotaUsed: {
        EXHIBITOR: credentials.filter((item) => item.kind === 'EXHIBITOR').length,
        ASSEMBLER: credentials.filter((item) => item.kind === 'ASSEMBLER').length,
        SERVICE: credentials.filter((item) => item.kind === 'SERVICE').length,
      },
      credentials: credentials.map((item) => ({
        id: item.id,
        kind: item.kind,
        fullName: item.fullName,
        badgeName: item.badgeName,
        role: item.role,
        document: access === 'ACCOUNT' ? item.document : undefined,
      })),
      representatives: representatives.map((item) => ({ id: item.id, name: item.name, role: item.role, email: item.email })),
      forms: forms.map((form) => {
        const opened = form.kind === 'DOCUMENT'
          ? visited.has(form.id)
          : form.kind === 'CREDENTIAL'
            ? credentials.some((item) => !form.credentialKind || item.kind === form.credentialKind)
            : orders.some((order) => order.status !== 'CANCELLED' && order.product.formId === form.id);
        return {
          id: form.id,
          sortOrder: form.sortOrder,
          title: form.title,
          required: form.required,
          deadline: form.deadline?.toISOString().slice(0, 10) ?? null,
          kind: form.kind,
          credentialKind: form.credentialKind,
          pdfUrl: form.pdfUrl,
          wordUrl: form.wordUrl,
          progress: exhibitorFormProgress({ opened, deadline: form.deadline }),
          products: products.filter((product) => product.formId === form.id).map((product) => ({
            id: product.id,
            title: product.title,
            unit: product.unit,
            priceCents: product.priceCents,
          })),
        };
      }),
      orders: orders.map((order) => ({
        id: order.id,
        description: order.product.title,
        formTitle: order.product.form.title,
        unit: order.product.unit,
        quantity: order.quantity,
        priceCents: order.priceCents,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        dueOn: order.product.form.deadline?.toISOString().slice(0, 10) ?? null,
      })),
      downloads: downloads.map((item) => ({ id: item.id, title: item.title, url: item.url })),
      paymentNote: 'Os pedidos e valores aparecem aqui. A confirmação fica com a organização. Esta área não emite boleto nem pede cartão.',
    };
  }

  private async bound(userId: string, tokenEmail: string, slug: string, companyId: string) {
    const actor = await this.actor(userId, tokenEmail);
    const event = await this.eventBySlug(slug);
    if (!/^[a-z0-9]{10,40}$/u.test(companyId)) throw new NotFoundException(COMPANY_DENIED);
    const company = await this.prisma.eventExhibitorCompany.findFirst({
      where: {
        id: companyId,
        eventId: event.id,
        organizationId: event.organizationId,
        OR: [
          { loginEmail: actor.email },
          { representatives: { some: { email: actor.email, eventId: event.id, organizationId: event.organizationId } } },
        ],
      },
    });
    if (!company) throw new NotFoundException(COMPANY_DENIED);
    return { actor, event, company, access: this.accessOf(company, actor.email) };
  }

  private async visibleForm(loaded: { event: EventScope; company: CompanyRow }, formId: string, kind: 'CREDENTIAL' | 'REQUEST' | 'DOCUMENT', client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const form = await client.eventExhibitorForm.findFirst({
      where: {
        id: formId,
        eventId: loaded.event.id,
        organizationId: loaded.event.organizationId,
        active: true,
        kind,
        audience: { in: [loaded.company.kind, 'BOTH'] },
      },
    });
    if (!form) throw new NotFoundException('Formulário não encontrado para esta empresa.');
    return form;
  }

  private async actor(userId: string, tokenEmail: string): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });
    if (!user || user.email.trim().toLowerCase() !== tokenEmail.trim().toLowerCase()) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    if (!user.emailVerifiedAt) throw new ForbiddenException('Confirme o e-mail da sua conta Evolvia antes de abrir a área da empresa.');
    return { id: user.id, email: user.email.trim().toLowerCase(), name: user.name };
  }

  private async eventBySlug(slug: string): Promise<EventScope> {
    if (!/^[a-z0-9-]{3,80}$/u.test(slug)) throw new NotFoundException('Evento não encontrado.');
    const event = await this.prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        organizationId: true,
        capabilities: { where: { code: 'exhibitor', status: CapabilityStatus.ACTIVE }, select: { id: true } },
      },
    });
    if (!event?.organizationId || event.status === EventStatus.DRAFT || event.status === EventStatus.CANCELLED) {
      throw new NotFoundException('Evento não encontrado.');
    }
    if (event.capabilities.length === 0) throw new NotFoundException('A área do expositor não está ligada neste evento.');
    return { id: event.id, organizationId: event.organizationId, name: event.name, slug: event.slug };
  }

  private async matches(event: EventScope, email: string): Promise<CompanyRow[]> {
    return this.prisma.eventExhibitorCompany.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        OR: [
          { loginEmail: email },
          { representatives: { some: { email, eventId: event.id, organizationId: event.organizationId } } },
        ],
      },
      orderBy: { tradeName: 'asc' },
    });
  }

  private choose(matches: CompanyRow[], companyId?: string): CompanyRow | null {
    if (matches.length === 0) throw new NotFoundException(COMPANY_DENIED);
    if (!companyId) return matches.length === 1 ? matches[0] : null;
    const chosen = matches.find((company) => company.id === companyId);
    if (!chosen) throw new NotFoundException(COMPANY_DENIED);
    return chosen;
  }

  private accessOf(company: { loginEmail: string }, email: string): Access {
    return company.loginEmail === email ? 'ACCOUNT' : 'REPRESENTATIVE';
  }

  private async audit(
    client: Prisma.TransactionClient | PrismaService,
    loaded: { actor: Actor; event: EventScope },
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await client.auditLog.create({
      data: {
        organizationId: loaded.event.organizationId,
        eventId: loaded.event.id,
        actorUserId: loaded.actor.id,
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  }
}

type CompanyRow = {
  id: string;
  kind: 'EXHIBITOR' | 'PROVIDER';
  nationality: 'BRAZILIAN' | 'FOREIGN';
  document: string;
  loginEmail: string;
  legalName: string;
  tradeName: string;
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
};

