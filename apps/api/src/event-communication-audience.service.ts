import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { COMMUNICATION_SCIENTIFIC_STATUSES, communicationAudienceInput, uniqueCommunicationContacts, hasCommunicationOptIn } from './event-communication-audience.policy';

@Injectable()
export class EventCommunicationAudienceService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}
  private async scope(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { eventId: event.id, organizationId: event.organizationId };
  }
  async categories(userId: string, eventId: string) {
    const scope = await this.scope(userId, eventId);
    // Includes inactive categories: existing registrations may still belong to them.
    return this.prisma.eventRegistrationCategory.findMany({ where: scope, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }
  // Server-side complete audience snapshot for durable outbox preparation. Never
  // expose this full contact list through a public controller.
  async snapshot(userId: string, eventId: string, raw: unknown, consentOnly = false) {
    const scope = await this.scope(userId, eventId);
    let input;
    try { input = communicationAudienceInput(raw); } catch (error) { throw new BadRequestException((error as Error).message); }
    if (input.audience !== 'CONFIRMED_REGISTRATIONS') {
      if (consentOnly) throw new BadRequestException('Autores exigem base legal e consentimento de comunicação específicos antes do envio em lote.');
      const rows = await this.prisma.scientificSubmissionAuthor.findMany({
        where: { ...scope, ...(input.audience === 'CORRESPONDING_AUTHORS' ? { isCorresponding: true } : {}),
          submission: { is: { ...scope, submittedAt: { not: null }, status: input.submissionStatus === 'ALL' ? { in: [...COMMUNICATION_SCIENTIFIC_STATUSES] } : input.submissionStatus } },
          person: { is: { ...scope, status: 'ACTIVE' } },
        },
        select: { nameSnapshot: true, person: { select: { name: true, email: true } } },
        orderBy: { id: 'asc' }, take: 5001,
      });
      if (rows.length > 5000) throw new ConflictException('Esta prévia suporta até 5000 autorias científicas. Restrinja a situação científica. Nenhuma lista parcial foi gerada.');
      const { contacts, missingEmail, duplicates } = uniqueCommunicationContacts(rows.map(row => ({ registrationData: { full_name: row.nameSnapshot ?? row.person.name, email: row.person.email } })));
      return { eventId, audience: input.audience, filters: input, contacts, matchedAuthors: rows.length, matchedRegistrations: 0, missingEmail, duplicates };
    }
    if (input.categoryIds.length) {
      const categories = await this.prisma.eventRegistrationCategory.count({ where: { ...scope, id: { in: input.categoryIds } } });
      if (categories !== input.categoryIds.length) throw new BadRequestException('Uma categoria selecionada não pertence a este evento.');
    }
    // Compra múltipla (#471) guarda o pagamento no pedido, não no checkout
    // individual da reserva. Uma vaga gratuita no mesmo pedido NÃO é "PAID".
    // O escopo deve acompanhar cada relação para impedir cruzamento de tenants.
    const paidCheckout = { ...scope, status: 'PAID' as const, paidAt: { not: null }, amountCents: { gt: 0 } };
    const payment: Prisma.EventRegistrationReservationWhereInput = input.payment === 'PAID'
      ? {
          finalPriceCents: { gt: 0 },
          OR: [
            { checkout: { is: paidCheckout } },
            { orderEntry: { is: {
              ...scope,
              finalPriceCents: { gt: 0 },
              order: { is: { ...scope, checkout: { is: paidCheckout } } },
            } } },
          ],
        }
      : input.payment === 'ZERO' ? { finalPriceCents: 0 } : {};
    const filters: Prisma.EventRegistrationReservationWhereInput[] = [];
    if (input.payment !== 'ALL') filters.push(payment);
    if (input.categoryIds.length) filters.push({ categoryId: { in: input.categoryIds } });
    const predicates = input.filterMode === 'OR' && filters.length > 1 ? [{ OR: filters }] : filters;
    const rows = await this.prisma.eventRegistrationReservation.findMany({
      where: { AND: [scope, { status: 'CONFIRMED' }, ...predicates] },
      select: { registrationData: true }, orderBy: { id: 'asc' }, take: 5001,
    });
    if (rows.length > 5000) throw new ConflictException('Esta prévia suporta até 5000 inscrições. Selecione categorias para reduzir o público. Nenhuma lista parcial foi gerada.');
    const eligible = consentOnly ? rows.filter(row => hasCommunicationOptIn(row.registrationData)) : rows;
    const { contacts, missingEmail, duplicates } = uniqueCommunicationContacts(eligible);
    return { eventId, audience: 'CONFIRMED_REGISTRATIONS', filters: input, contacts,
      matchedRegistrations: rows.length, missingEmail, duplicates, excludedWithoutConsent: rows.length - eligible.length };
  }

  async preview(userId: string, eventId: string, raw: unknown) {
    const { contacts, ...summary } = await this.snapshot(userId, eventId, raw);
    const page = summary.filters.page;
    return { ...summary, total: contacts.length, page, pageSize: 50,
      items: contacts.slice((page - 1) * 50, page * 50), sendingAvailable: false };
  }
}
