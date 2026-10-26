import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { communicationAudienceInput, uniqueCommunicationContacts } from './event-communication-audience.policy';

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
  async preview(userId: string, eventId: string, raw: unknown) {
    const scope = await this.scope(userId, eventId);
    let input;
    try { input = communicationAudienceInput(raw); } catch (error) { throw new BadRequestException((error as Error).message); }
    if (input.categoryIds.length) {
      const categories = await this.prisma.eventRegistrationCategory.count({ where: { ...scope, id: { in: input.categoryIds } } });
      if (categories !== input.categoryIds.length) throw new BadRequestException('Uma categoria selecionada não pertence a este evento.');
    }
    const payment: Prisma.EventRegistrationReservationWhereInput = input.payment === 'PAID'
      ? { checkout: { is: { ...scope, status: 'PAID', paidAt: { not: null }, amountCents: { gt: 0 } } } }
      : input.payment === 'ZERO' ? { finalPriceCents: 0 } : {};
    const rows = await this.prisma.eventRegistrationReservation.findMany({
      where: { AND: [scope, { status: 'CONFIRMED' }, payment, ...(input.categoryIds.length ? [{ categoryId: { in: input.categoryIds } }] : [])] },
      select: { registrationData: true }, orderBy: { id: 'asc' }, take: 5001,
    });
    if (rows.length > 5000) throw new ConflictException('Esta prévia suporta até 5000 inscrições. Selecione categorias para reduzir o público. Nenhuma lista parcial foi gerada.');
    const { contacts, missingEmail, duplicates } = uniqueCommunicationContacts(rows);
    return { eventId, audience: 'CONFIRMED_REGISTRATIONS', filters: input, total: contacts.length, matchedRegistrations: rows.length, missingEmail, duplicates, page: input.page, pageSize: 50, items: contacts.slice((input.page - 1) * 50, input.page * 50), sendingAvailable: false };
  }
}
