export type ReportPaymentCategory = { label: string; confirmed: number; paid: number; exempt: number; review: number; unverified: number; receivedCents: number; confirmedPriceCents: number };
export type PostEventBucket = { label: string; registered: number; present: number };
export type PostEventReport = {
  event: { id: string; name: string; profileCode: string; profileLabel: string; status: string; startDate: string | null; endDate: string | null; timeZone: string; timeZoneConfirmed: boolean };
  generatedAt: string; formRevision: number; publishedFormVersion: number; ageReferenceDay: string | null; enabledModules: string[]; attendanceEnabled: boolean;
  registration: { confirmed: number; present: number; absent: number; pending: number; expired: number; cancelled: number; attendancePercent: number | null };
  payment: { paid: number; exempt: number; review: number; unverified: number; receivedCents: number; confirmedPriceCents: number; categories?: ReportPaymentCategory[] } | null;
  categories: PostEventBucket[];
  firstCheckInByDay: Array<{ label: string; count: number }>;
  firstCheckInByHour: Array<{ label: string; count: number }>;
  fields: Array<{ code: string; label: string; multiple: boolean; eligible: number; presentEligible: number; notCollected: number; notApplicable: number; buckets: PostEventBucket[] }>;
  scientific: { submissions: Array<{ status: string; count: number }>; plannedActivities: number | null } | null;
  visits?: { total: number; byDay: Array<{ label: string; count: number }> };
  salesByDay?: Array<{ label: string; sales: number; receivedCents: number }>;
  limitations: string[];
};
export const submissionStatusLabels: Record<string, string> = { DRAFT: 'Rascunho', INCOMPLETE: 'Incompleto', SUBMITTED: 'Submetido', UNDER_REVIEW: 'Em avaliação', ACCEPTED: 'Aceito', REJECTED: 'Recusado', ACCEPTED_WITH_CHANGES: 'Aceito com ajustes' };
export function reportPercent(count: number, total: number): string {
  return total > 0 ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(100 * count / total)}%` : '—';
}
export function reportCsvCell(value: unknown): string {
  let text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '');
  if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
export function postEventReportCsv(report: PostEventReport): string {
  const rows: unknown[][] = [
    ['Evento', report.event.name], ['Perfil', report.event.profileLabel], ['Gerado em UTC', report.generatedAt], ['Fuso do evento', report.event.timeZone], ['Revisão da ficha', report.formRevision], ['Data de referência da idade', report.ageReferenceDay],
    ['Relatório', 'Grupo', 'Inscrições confirmadas', 'Presentes', '% inscritos', '% presentes'],
  ];
  const add = (title: string, buckets: PostEventBucket[], registered: number, present: number) => (buckets ?? []).forEach((b) => rows.push([title, b.label, b.registered, report.attendanceEnabled ? b.present : 'Não habilitado', reportPercent(b.registered, registered), report.attendanceEnabled ? reportPercent(b.present, present) : 'Não habilitado']));
  const r = report.registration;
  rows.push(['Resumo', 'Confirmados / presentes', r.confirmed, report.attendanceEnabled ? r.present : 'Não habilitado', '', report.attendanceEnabled ? reportPercent(r.present, r.confirmed) : 'Não habilitado'], ['Resumo', 'Sem primeiro credenciamento', report.attendanceEnabled ? r.absent : 'Não habilitado'], ['Reservas', 'Pendentes', r.pending], ['Reservas', 'Expiradas', r.expired], ['Reservas', 'Canceladas', r.cancelled]);
  add('Categoria', report.categories, r.confirmed, r.present);
  report.fields.forEach((field) => {
    rows.push([field.label, 'Elegíveis / presentes elegíveis', field.eligible, report.attendanceEnabled ? field.presentEligible : 'Não habilitado'], [field.label, 'Não coletado nessa versão', field.notCollected], [field.label, 'Não se aplica', field.notApplicable]);
    add(field.label, field.buckets, field.eligible, field.presentEligible);
  });
  (report.attendanceEnabled ? (report.firstCheckInByDay ?? []) : []).forEach((b) => rows.push(['Primeiro credenciamento por dia', b.label, b.count]));
  (report.attendanceEnabled ? (report.firstCheckInByHour ?? []) : []).forEach((b) => rows.push(['Primeiro credenciamento por hora', b.label, b.count]));
  if (report.payment) {
    const p = report.payment;
    rows.push(['Pagamentos', 'Pagos (checkout PAID)', p.paid], ['Pagamentos', 'Isentos', p.exempt], ['Pagamentos', 'Em revisão', p.review], ['Pagamentos', 'Sem confirmação de checkout', p.unverified], ['Pagamentos', 'Valor pago em centavos', p.receivedCents], ['Pagamentos', 'Preço de inscrições confirmadas em centavos', p.confirmedPriceCents]);
    if (p.categories) {
      rows.push(['Pagamentos por categoria', 'Categoria', 'Confirmadas', 'Pagas', 'Isentas', 'Em revisão', 'Sem confirmação de pagamento', 'Recebido em centavos', 'Previsto em centavos']);
      p.categories.forEach((row) => rows.push(['Pagamentos por categoria', row.label, row.confirmed, row.paid, row.exempt, row.review, row.unverified, row.receivedCents, row.confirmedPriceCents]));
    }
  }
  (report.visits?.byDay ?? []).forEach((row) => rows.push(['Visitas da página', row.label, row.count]));
  if (report.visits) rows.push(['Visitas da página', 'Total', report.visits.total], ['Visitas da página', 'Critério', 'Quantidade agregada. Não identifica visitante.']);
  (report.salesByDay ?? []).forEach((row) => rows.push(['Vendas no período', row.label, row.sales, row.receivedCents]));
  if (report.salesByDay) rows.push(['Vendas no período', 'Critério', 'A soma dos dias equivale ao valor recebido. Checkout sem data de confirmação entra em Não informada. Não identifica comprador.']);
  report.scientific?.submissions.forEach((b) => rows.push(['Científico', submissionStatusLabels[b.status] ?? b.status, b.count]));
  report.limitations.forEach((text) => rows.push(['Como interpretar', text]));
  return '\uFEFF' + rows.map((row) => row.map(reportCsvCell).join(';')).join('\r\n') + '\r\n';
}
