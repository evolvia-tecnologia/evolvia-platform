'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReportOption } from '../lib/post-event-report-options';
import type { ReportModuleLink } from '../lib/event-report-links';
import styles from './post-event-reports.module.css';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export default function ReportCatalog({ options, selected, onSelect, links = [] }: {
  options: ReportOption[]; selected: string; onSelect: (id: string) => void; links?: ReportModuleLink[];
}) {
  const [query, setQuery] = useState('');
  const matches = (item: { title: string; description: string; group: string }) => normalize(item.group + ' ' + item.title + ' ' + item.description).includes(normalize(query.trim()));
  const available = options.filter(matches);
  const destinations = links.filter(matches);
  const groups = [...new Set(available.map((option) => option.group))];
  const moduleGroups = [...new Set(destinations.map((option) => option.group))];
  return <section className={styles.catalog} aria-labelledby="report-catalog-title">
    <h2 id="report-catalog-title">Relatórios por assunto</h2>
    <p className={styles.help}>As consultas e exportações seguem os recursos e os campos habilitados neste evento.</p>
    <label className={styles.reportSearch}>Buscar relatório
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: categoria, pagamentos, trabalhos" />
    </label>
    <p role="status" className={styles.help}>{available.length} consultas nesta página e {destinations.length} acessos aos módulos.</p>
    {groups.map((group) => <section key={group} aria-label={group}><h3>{group}</h3><div className={styles.reportOptions}>{available.filter((option) => option.group === group).map((option) => <button type="button" key={option.id} className={styles.reportOption} aria-pressed={selected === option.id} onClick={() => onSelect(option.id)}><strong>{option.title}</strong><span>{option.description}</span><small>Consultar e exportar CSV</small></button>)}</div></section>)}
    {moduleGroups.length > 0 && <div className={styles.moduleReports}><h2>Consultas nos módulos</h2><p className={styles.help}>Abra o módulo para consultar os registros e as exportações disponíveis ao seu acesso.</p>
      {moduleGroups.map((group) => <section key={group} aria-label={group}><h3>{group}</h3><div className={styles.reportOptions}>{destinations.filter((item) => item.group === group).map((item) => <Link key={item.id} href={item.href} className={styles.reportOption}><strong>{item.title}</strong><span>{item.description}</span><small>Abrir consulta →</small></Link>)}</div></section>)}
    </div>}
    {!available.length && !destinations.length && <p className={styles.notice}>Nenhum relatório corresponde à busca. Tente outro termo ou limpe o campo.</p>}
  </section>;
}
