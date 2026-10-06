import { postEventInsights, reportBarPercent } from '../lib/post-event-insights';
import { reportPercent, submissionStatusLabels, type PostEventReport } from '../lib/post-event-report';
import styles from './post-event-reports.module.css';

const count = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
function Bars({ title, rows, note }: { title: string; rows: Array<{ label: string; count: number }>; note: string }) {
  const maximum = Math.max(0, ...rows.map((row) => row.count));
  return <section className={styles.chart} aria-label={title}><h3>{title}</h3><p className={styles.help}>{note}</p>
    {maximum > 0 ? <ul className={styles.bars}>{rows.map((row, index) => <li key={`${row.label}-${index}`}><div className={styles.barLabel}><span>{row.label}</span><strong>{count(row.count)}</strong></div><div className={styles.barTrack} aria-hidden="true"><span style={{ width: `${reportBarPercent(row.count, maximum)}%` }} /></div></li>)}</ul> : <p className={styles.chartEmpty}>Ainda não há registros para este gráfico.</p>}
  </section>;
}
export default function PostEventOverview({ report }: { report: PostEventReport }) {
  const r = report.registration;
  const insights = postEventInsights(report);
  const categories = (report.categories ?? []).slice().sort((a, b) => b.registered - a.registered || a.label.localeCompare(b.label, 'pt-BR'));
  const hours = report.attendanceEnabled ? (report.firstCheckInByHour ?? []).slice().sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) : [];
  return <section aria-labelledby="results-overview-title" className={styles.overview}>
    <header className={styles.overviewHeading}><div><span className={styles.eyebrow}>VISÃO EXECUTIVA</span><h2 id="results-overview-title">Do registro ao resultado</h2><p>Uma leitura visual dos dados disponíveis neste evento.</p></div><span className={styles.overviewBadge}>Dados da consulta atual</span></header>
    {report.attendanceEnabled && <section className={styles.attendanceOverview} aria-label="Credenciamento das inscrições confirmadas"><div><span>Taxa de credenciamento</span><strong>{reportPercent(r.present, r.confirmed)}</strong><p>{count(r.present)} presentes de {count(r.confirmed)} inscrições confirmadas</p></div><div className={styles.attendanceBar}><div className={styles.barTrack} aria-hidden="true"><span style={{ width: `${reportBarPercent(r.present, r.confirmed)}%` }} /></div><p>{r.confirmed ? `${count(r.absent)} inscrições ainda sem primeiro credenciamento` : 'Sem inscrições confirmadas para calcular a taxa.'}</p></div></section>}
    <div className={styles.chartGrid}>
      <Bars title="Inscrições por categoria" rows={categories.slice(0, 8).map((row) => ({ label: row.label, count: row.registered }))} note={categories.length > 8 ? 'As oito maiores categorias. Todas estão na tabela e no CSV.' : 'Somente inscrições confirmadas. Comprimento relativo à maior categoria.'} />
      {report.attendanceEnabled && <Bars title="Horários com mais primeiro credenciamento" rows={hours.slice(0, 6)} note={`Até seis horários com mais registros, em ${report.event.timeZone}. Cada inscrição conta uma vez.`} />}
      {Array.isArray(report.scientific?.submissions) && <Bars title="Panorama dos trabalhos científicos" rows={report.scientific!.submissions.map((row) => ({ label: submissionStatusLabels[row.status] ?? row.status, count: row.count }))} note="Estados registrados nos trabalhos. Não representam apresentações realizadas." />}
    </div>
    {insights.length > 0 && <section className={styles.insightSection} aria-labelledby="eva-results-title"><div className={styles.evaHeader}><span className={styles.evaMark} aria-hidden="true">EVA</span><div><h3 id="eva-results-title">Síntese dos registros</h3><p>Cálculos a partir dos agregados desta consulta.</p></div></div><div className={styles.insights}>{insights.map((insight) => <article key={insight.title}><span>{insight.title}</span><strong>{insight.value}</strong><p>{insight.detail}</p></article>)}</div></section>}
    <p className={styles.help}>Os detalhamentos abaixo preservam as populações e os critérios de cada relatório.</p>
  </section>;
}
