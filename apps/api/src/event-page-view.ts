import { randomBytes } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';
import { eventReportDay, reportingTimeZone } from './post-event-report-policy';

const SLUG = /^[a-z0-9-]{3,80}$/u;

/** Conta uma abertura da página pública. Não grava pessoa, IP, navegador nem origem. */
export async function recordPublicPageView(prisma: PrismaService, rawSlug: string, now = new Date()) {
  const slug = rawSlug.trim().toLowerCase();
  if (!SLUG.test(slug)) throw new NotFoundException('Evento publicado não encontrado.');
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { id: true, organizationId: true, status: true, timeZone: true },
  });
  if (!event?.organizationId || event.status !== 'PUBLISHED') throw new NotFoundException('Evento publicado não encontrado.');
  const day = eventReportDay(now, reportingTimeZone(event.timeZone));
  const id = `view_${randomBytes(16).toString('hex')}`;
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "EventPublicPageView" ("id", "organizationId", "eventId", "day", "count", "createdAt", "updatedAt")
    VALUES (${id}, ${event.organizationId}, ${event.id}, ${day}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("eventId", "day") DO UPDATE
    SET "count" = "EventPublicPageView"."count" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
  `);
  return { counted: true };
}
