import type { PostEventReport } from './post-event-report';

export type ReportInsight = { title: string; value: string; detail: string };
const count = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
export function reportBarPercent(value: number, maximum: number): number {
  return maximum > 0 && Number.isFinite(value) && Number.isFinite(maximum) ? Math.min(100, Math.max(0, 100 * value / maximum)) : 0;
}
export function postEventInsights(report: PostEventReport): ReportInsight[] {
  const insights: ReportInsight[] = [];
  const categories = (report.categories ?? []).filter((row) => row.registered > 0).slice().sort((a, b) => b.registered - a.registered || a.label.localeCompare(b.label, 'pt-BR'));
  if (categories.length && report.registration.confirmed > 0) {
    const maximum = categories[0].registered;
    const leaders = categories.filter((row) => row.registered === maximum);
    insights.push({ title: leaders.length > 1 ? 'Categorias com mais inscrições' : 'Categoria com mais inscrições', value: leaders.map((row) => row.label).join(' · '), detail: `${count(maximum)} inscrições confirmadas${leaders.length > 1 ? ' em cada categoria empatada' : ' nessa categoria'}.` });
  }
  if (report.attendanceEnabled) {
    const hours = (report.firstCheckInByHour ?? []).filter((row) => row.count > 0).slice().sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (hours.length) {
      const leaders = hours.filter((row) => row.count === hours[0].count);
      insights.push({ title: 'Maior primeiro credenciamento por hora', value: leaders.length === 1 ? leaders[0].label : `${leaders.length} horários empatados`, detail: `${count(hours[0].count)} inscrições com primeiro credenciamento${leaders.length > 1 ? ' em cada horário' : ' nesse horário'}. Fuso: ${report.event.timeZone}.` });
    }
  }
  if (report.scientific && Array.isArray(report.scientific.submissions)) {
    const total = report.scientific.submissions.reduce((sum, row) => sum + row.count, 0);
    const accepted = report.scientific.submissions.filter((row) => row.status === 'ACCEPTED' || row.status === 'ACCEPTED_WITH_CHANGES').reduce((sum, row) => sum + row.count, 0);
    insights.push({ title: 'Trabalhos com aceite registrado', value: `${count(accepted)} de ${count(total)}`, detail: 'Inclui aceite com ajustes. Decisão registrada não comprova apresentação.' });
  }
  return insights;
}
