import { randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';
import { eventReportDay, reportingTimeZone } from './post-event-report-policy';

const SLUG = /^[a-z0-9-]{3,80}$/u;

/**
 * Teto de aberturas contadas para o mesmo slug, neste processo, numa janela fixa.
 * Não identifica visitante e não guarda IP. Cada instância da API tem o próprio
 * mapa: o teto efetivo acompanha a quantidade de processos e não é compartilhado.
 * Webhooks e as demais rotas não passam por aqui.
 */
export const PUBLIC_PAGE_VIEW_LIMIT = 120;
export const PUBLIC_PAGE_VIEW_WINDOW_MS = 60_000;
export const PUBLIC_PAGE_VIEW_MAX_SLUGS = 5_000;

type PageViewBucket = { count: number; windowStartedAt: number };
const pageViewBuckets = new Map<string, PageViewBucket>();

export function resetPublicPageViewBudgetForTests(): void {
  pageViewBuckets.clear();
}

function pageViewLimited(): HttpException {
  return new HttpException({
    code: 'RATE_LIMITED',
    message: 'Muitas aberturas em seguida. Aguarde um instante e tente de novo.',
  }, HttpStatus.TOO_MANY_REQUESTS);
}

/** Reserva uma contagem de evento já confirmado como publicado. Recusa sem escrever quando a janela deste processo está cheia. */
export function reservePublicPageView(slug: string, now: Date): void {
  const nowMs = now.getTime();
  const windowStartedAt = Math.floor(nowMs / PUBLIC_PAGE_VIEW_WINDOW_MS) * PUBLIC_PAGE_VIEW_WINDOW_MS;
  const existing = pageViewBuckets.get(slug);
  if (existing?.windowStartedAt === windowStartedAt) {
    if (existing.count >= PUBLIC_PAGE_VIEW_LIMIT) throw pageViewLimited();
    existing.count += 1;
    return;
  }
  if (!existing && pageViewBuckets.size >= PUBLIC_PAGE_VIEW_MAX_SLUGS) {
    for (const [key, bucket] of pageViewBuckets) {
      if (bucket.windowStartedAt + PUBLIC_PAGE_VIEW_WINDOW_MS <= nowMs) pageViewBuckets.delete(key);
    }
    if (pageViewBuckets.size >= PUBLIC_PAGE_VIEW_MAX_SLUGS) throw pageViewLimited();
  }
  pageViewBuckets.set(slug, { count: 1, windowStartedAt });
}

/** Conta uma abertura da página pública. A tabela não grava pessoa, IP, navegador nem origem. */
export async function recordPublicPageView(prisma: PrismaService, rawSlug: string, now = new Date()) {
  const slug = rawSlug.trim().toLowerCase();
  if (!SLUG.test(slug)) throw new NotFoundException('Evento publicado não encontrado.');
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { id: true, organizationId: true, status: true, timeZone: true },
  });
  if (!event?.organizationId || event.status !== 'PUBLISHED') throw new NotFoundException('Evento publicado não encontrado.');
  reservePublicPageView(slug, now);
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
