import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';
import { eventReportDay, PostEventReportAccumulator, reportFields, reportingTimeZone } from './post-event-report-policy';

type ReportEvent = { id: string; organizationId: string | null; name: string; profileCode: string | null; status: string; startDate: Date | null; endDate: Date | null; timeZone: string | null; registrationMode: string };
const MAX_REGISTRATIONS = 50_000;
const profileLabels: Record<string, string> = { SCIENTIFIC_EVENT: 'Científico e acadêmico', CORPORATE_TRAINING: 'Corporativo e capacitação', FAIR_EXHIBITION: 'Feira e exposição', ENTERTAINMENT: 'Entretenimento', SOCIAL_COMMUNITY: 'Comunidade, causa e esporte', OTHER: 'Outro perfil' };

/** Caller must authorize the event first. All reads use one scoped DB snapshot. */
export async function readPostEventReport(prisma: PrismaService, event: ReportEvent) {
  if (!event.organizationId) throw new BadRequestException('O evento precisa estar vinculado a uma organização.');
  const scope = { eventId: event.id, organizationId: event.organizationId };
  const now = new Date();
  const zone = reportingTimeZone(event.timeZone);
  const referenceDay = event.startDate ? eventReportDay(event.startDate, zone) : null;
  return prisma.$transaction(async (tx) => {
    const [form, versions, capabilities, views] = await Promise.all([
      tx.eventRegistrationForm.findUnique({ where: { eventId_organizationId: scope }, select: { fields: true, revision: true, publishedVersion: true } }),
      tx.eventRegistrationFormVersion.findMany({ where: scope, select: { version: true, schema: true } }),
      tx.eventCapability.findMany({ where: { eventId: event.id, event: { organizationId: scope.organizationId }, status: 'ACTIVE' }, select: { code: true } }),
      tx.eventPublicPageView.findMany({ where: scope, select: { day: true, count: true }, orderBy: { day: 'asc' } }),
    ]);
    const fields = reportFields(form?.fields);
    const schemas = new Map(versions.map((v) => [v.version, reportFields(v.schema)]));
    const enabled = new Set(capabilities.map((c) => c.code));
    const accumulator = new PostEventReportAccumulator(fields, schemas, referenceDay, zone, now);
    let cursor: string | undefined;
    let read = 0;
    while (true) {
      const rows = await tx.eventRegistrationReservation.findMany({
        where: scope, orderBy: { id: 'asc' }, take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, status: true, expiresAt: true, categoryId: true, category: { select: { name: true } }, finalPriceCents: true, registrationData: true, registrationFormVersion: true, checkIn: { select: { checkedInAt: true, reversedAt: true } }, checkout: { select: { status: true, amountCents: true, paidAt: true } } },
      });
      read += rows.length;
      if (read > MAX_REGISTRATIONS) throw new BadRequestException('Este evento ultrapassa o limite de 50 mil registros da consulta imediata. O relatório exige processamento em lote.');
      for (const row of rows) accumulator.add({ ...row, checkIn: row.checkIn && !row.checkIn.reversedAt ? { checkedInAt: row.checkIn.checkedInAt } : null });
      if (rows.length < 500) break;
      cursor = rows[rows.length - 1].id;
    }
    const scientificEnabled = enabled.has('scientific_submission');
    const science = scientificEnabled ? await tx.scientificSubmission.groupBy({ by: ['status'], where: scope, _count: { _all: true } }) : null;
    const activities = scientificEnabled ? await tx.scientificProgramActivity.count({ where: scope }) : null;
    const result = accumulator.finish();
    return {
      event: { id: event.id, name: event.name, profileCode: event.profileCode ?? 'OTHER', profileLabel: profileLabels[event.profileCode ?? 'OTHER'] ?? 'Outro perfil', status: event.status, startDate: event.startDate?.toISOString() ?? null, endDate: event.endDate?.toISOString() ?? null, timeZone: zone, timeZoneConfirmed: event.timeZone === zone },
      generatedAt: now.toISOString(), formRevision: form?.revision ?? 0, publishedFormVersion: form?.publishedVersion ?? 0, ageReferenceDay: referenceDay,
      enabledModules: [...enabled].sort(), attendanceEnabled: enabled.has('credential') || enabled.has('access_control'), ...result,
      payment: event.registrationMode === 'PAID' || enabled.has('payment') ? result.payment : null,
      visits: { total: views.reduce((sum, row) => sum + row.count, 0), byDay: views.map((row) => ({ label: row.day, count: row.count })) },
      salesByDay: result.salesByDay,
      scientific: science ? { submissions: science.map((row) => ({ status: row.status, count: row._count._all })), plannedActivities: activities } : null,
      limitations: [
        'Inscritos e perfis da ficha consideram somente inscrições confirmadas. Reservas pendentes, expiradas e canceladas são apresentadas separadamente.',
        'Presença significa primeiro credenciamento registrado; não comprova participação diária, permanência nem presença em atividades.',
        'Valores pagos consideram checkouts PAID; não representam caixa presencial, receita líquida ou emissão fiscal.',
        'Campos estatísticos seguem a ficha atual habilitada, com opções e condições da versão coletada. Nomes, documentos, contatos, fotos e texto de acessibilidade não são exportados.',
        'A consulta é um retrato dos dados atuais; não encerra o evento nem emite certificados.',
        'Visitas são aberturas agregadas da página pública. Não identificam pessoa, navegador, IP nem origem.',
        'Vendas no período usam a data de confirmação do checkout pago, no fuso do evento. Confirmação sem data entra no dia Não informada, e a soma dos dias equivale ao valor recebido. Não representam caixa presencial nem receita líquida.',
      ],
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
