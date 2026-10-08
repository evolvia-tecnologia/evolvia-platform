import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from './prisma.service';
import { eventReportDay, reportingTimeZone } from './post-event-report-policy';

const SLUG = /^[a-z0-9-]{3,80}$/u;

/** Conta uma abertura da página pública. Não grava pessoa, IP, navegador nem origem. */
export async function recordPublicPageView(prisma: PrismaService, rawSlug: string, now = new Date()) {
  const slug = rawSlug.trim().toLowerCase();
  if (!SLUG.test(slug) || slug.length > 80) throw new NotFoundException('Evento publicado não encontrado.');
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { id: true, organizationId: true, status: true, timeZone: true },
  });
  if (!event?.organizationId || event.status !== 'PUBLISHED') throw new NotFoundException('Evento publicado não encontrado.');
  const day = eventReportDay(now, reportingTimeZone(event.timeZone));
  await prisma.eventPublicPageView.upsert({
    where: { eventId_day: { eventId: event.id, day } },
    create: { organizationId: event.organizationId, eventId: event.id, day, count: 1 },
    update: { count: { increment: 1 } },
  });
  return { counted: true };
}
