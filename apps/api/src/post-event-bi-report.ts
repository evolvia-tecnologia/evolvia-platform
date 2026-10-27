import type { readPostEventReport } from './post-event-report-reader';

type Source = Awaited<ReturnType<typeof readPostEventReport>>;
type Row = { metric: string; dimension: string | null; value: number; unit: 'count' | 'BRL_cents' };

/** Aggregate-only projection: no source spreads or arbitrary form labels. */
export function postEventBiReport(report: Source) {
  const rows: Row[] = [];
  const add = (metric: string, value: number, unit: Row['unit'] = 'count', dimension: string | null = null) => {
    if (Number.isSafeInteger(value) && value >= 0) rows.push({ metric, dimension, value, unit });
  };
  const r = report.registration;
  add('registration.confirmed', r.confirmed);
  add('reservation.pending', r.pending);
  add('reservation.expired', r.expired);
  add('reservation.cancelled', r.cancelled);
  if (report.attendanceEnabled) {
    add('attendance.present', r.present); add('attendance.absent', r.absent);
    for (const row of report.firstCheckInByDay) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(row.label)) add('attendance.first_by_day', row.count, 'count', row.label);
    }
  }
  if (report.payment) {
    const p = report.payment;
    add('payment.paid', p.paid); add('payment.exempt', p.exempt);
    add('payment.review', p.review); add('payment.unverified', p.unverified);
    add('payment.received', p.receivedCents, 'BRL_cents');
    add('registration.confirmed_price', p.confirmedPriceCents, 'BRL_cents');
  }
  if (report.visits) {
    add('visits.total', report.visits.total);
    for (const row of report.visits.byDay) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(row.label)) add('visits.by_day', row.count, 'count', row.label);
    }
  }
  if (report.scientific) {
    const statuses = new Set(['DRAFT', 'INCOMPLETE', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'ACCEPTED_WITH_CHANGES']);
    for (const row of report.scientific.submissions) {
      if (statuses.has(row.status)) add('scientific.submissions', row.count, 'count', row.status);
    }
    if (report.scientific.plannedActivities !== null) add('scientific.planned_activities', report.scientific.plannedActivities);
  }
  return { schemaVersion: 1, eventId: report.event.id, generatedAt: report.generatedAt, timeZone: report.event.timeZone, rows };
}
