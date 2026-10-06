'use client';
import type { ReportOption } from '../lib/post-event-report-options';
import styles from './post-event-reports.module.css';
export default function ReportCatalog({ options, selected, onSelect }: { options: ReportOption[]; selected: string; onSelect: (id: string) => void }) {
  const groups = [...new Set(options.map((option) => option.group))];
  return <section className={styles.catalog} aria-labelledby="report-catalog-title"><h2 id="report-catalog-title">Escolha um relatório</h2><p className={styles.help}>As opções seguem os módulos e os campos habilitados neste evento.</p>
    {groups.map((group) => <section key={group} aria-label={group}><h3>{group}</h3><div className={styles.reportOptions}>{options.filter((option) => option.group === group).map((option) => <button type="button" key={option.id} className={styles.reportOption} aria-pressed={selected === option.id} onClick={() => onSelect(option.id)}><strong>{option.title}</strong><span>{option.description}</span></button>)}</div></section>)}
  </section>;
}
