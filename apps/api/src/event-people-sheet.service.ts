import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import {
  PEOPLE_LIST_MAX,
  PEOPLE_SHEET_MAX,
  PeopleSheetField,
  enabledPeopleFields,
  peopleCsv,
  peopleDisplayName,
  peopleSheetHeaders,
  peopleSheetValues,
} from './event-people-sheet.policy';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { reportingTimeZone } from './post-event-report-policy';
import { PrismaService } from './prisma.service';
import { ESSENTIAL_FIELDS } from './registration-forms.service';

const PEOPLE_SELECT = {
  protocol: true,
  confirmedAt: true,
  registrationData: true,
  category: { select: { name: true } },
} satisfies Prisma.EventRegistrationReservationSelect;

@Injectable()
export class EventPeopleSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const where = this.confirmedWhere(event.id, event.organizationId);
    const [total, rows, fields] = await Promise.all([
      this.prisma.eventRegistrationReservation.count({ where }),
      this.prisma.eventRegistrationReservation.findMany({
        where,
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
        take: PEOPLE_LIST_MAX,
        select: PEOPLE_SELECT,
      }),
      this.fieldsFor(event.id, event.organizationId),
    ]);
    return {
      total,
      shown: rows.length,
      truncated: total > rows.length,
      columns: peopleSheetHeaders(fields),
      people: rows.map((row) => ({
        protocol: row.protocol,
        displayName: peopleDisplayName(row.registrationData),
        categoryName: row.category.name,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
      })),
    };
  }

  async sheet(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const where = this.confirmedWhere(event.id, event.organizationId);
    const [total, rows, fields] = await Promise.all([
      this.prisma.eventRegistrationReservation.count({ where }),
      this.prisma.eventRegistrationReservation.findMany({
        where,
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
        take: PEOPLE_SHEET_MAX,
        select: PEOPLE_SELECT,
      }),
      this.fieldsFor(event.id, event.organizationId),
    ]);
    const zone = reportingTimeZone(event.timeZone);
    const headers = peopleSheetHeaders(fields);
    const records = rows.map((row) => peopleSheetValues(fields, {
      protocol: row.protocol,
      categoryName: row.category.name,
      confirmedAt: row.confirmedAt,
      registrationData: row.registrationData,
    }, this.confirmedLabel(row.confirmedAt, zone)));
    const truncated = total > records.length;
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId: userId,
        action: 'people.sheet_exported',
        entityType: 'Event',
        entityId: event.id,
        metadata: {
          confirmedCount: total,
          exportedCount: records.length,
          truncated,
          columnCount: headers.length,
        } as Prisma.InputJsonObject,
      },
    });
    return { csv: peopleCsv(headers, records), truncated, exportedCount: records.length };
  }

  private confirmedWhere(eventId: string, organizationId: string) {
    return { eventId, organizationId, status: RegistrationReservationStatus.CONFIRMED };
  }

  private confirmedLabel(value: Date | null, zone: string): string {
    if (!value || Number.isNaN(value.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' }).format(value);
  }

  private async fieldsFor(eventId: string, organizationId: string): Promise<PeopleSheetField[]> {
    const form = await this.prisma.eventRegistrationForm.findUnique({
      where: { eventId_organizationId: { eventId, organizationId } },
      select: { fields: true },
    });
    const stored = Array.isArray(form?.fields) ? form.fields as PeopleSheetField[] : ESSENTIAL_FIELDS;
    return enabledPeopleFields(stored.filter((field) => field && typeof field.code === 'string' && typeof field.label === 'string' && typeof field.type === 'string'));
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, timeZone: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId, timeZone: event.timeZone };
  }
}
