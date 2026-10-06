'use client';

import { useState } from 'react';
import { agendaGroups, agendaDay, agendaDateLabel, agendaHour, agendaRole, agendaTimeZone, type AgendaActivity } from '../lib/scientific-program-agenda';
import styles from './scientific-program-agenda.module.css';

export default function ScientificProgramAgenda({ activities = [], timeZone, conflicts = [], onEdit, disabled }: {
  activities: AgendaActivity[]; timeZone?: string | null;
  conflicts: Array<{ severity: string; entityIds?: string[] }>;
  onEdit: (id: string, opener: HTMLButtonElement) => void; disabled: boolean;
}) {
  const [day, setDay] = useState('all');
  const [space, setSpace] = useState('all');
  const [query, setQuery] = useState('');
  const zone = agendaTimeZone(timeZone);
  const all = agendaGroups(activities, zone, { day: 'all', space: 'all', query: '' });
  const groups = agendaGroups(activities, zone, { day, space, query });
  const rooms = [...new Map(activities.filter((a) => a.spaceId).map((a) => [a.spaceId!, a.space?.name ?? 'Espaço sem nome'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const visible = groups.reduce((total, group) => total + group.activities.length, 0);
  const quantity = (value: number, singular: string, plural: string) => `${value} ${value === 1 ? singular : plural}`;
  const reset = () => { setDay('all'); setSpace('all'); setQuery(''); };
  return <section className={styles.panel} aria-labelledby="agenda-title">
    <header className={styles.heading}><div><span className={styles.eyebrow}>SUA PROGRAMAÇÃO, EM UM OLHAR</span><h2 id="agenda-title">Agenda do evento</h2><p>Horários em {zone}{(!timeZone || zone !== timeZone) && ' · fuso não confirmado'}. Grade de planejamento do organizador.</p></div><span className={styles.total}>{quantity(activities.length, 'atividade', 'atividades')} · {quantity(all.length, 'dia', 'dias')}</span></header>
    <div className={styles.filters}>
      <label>Buscar atividade ou pessoa<input type="search" maxLength={180} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título, palestrante ou instituição" /></label>
      <label>Dia<select value={day} onChange={(e) => setDay(e.target.value)}><option value="all">Todos os dias</option>{all.map((g) => <option value={g.day} key={g.day}>{g.label}</option>)}</select></label>
      <label>Sala ou espaço<select value={space} onChange={(e) => setSpace(e.target.value)}><option value="all">Todos os espaços</option>{rooms.map(([id, name]) => <option key={id} value={id}>{name}</option>)}{activities.some((a) => !a.spaceId) && <option value="unassigned">Sem espaço definido</option>}</select></label>
      <button type="button" onClick={reset} className={styles.reset}>Limpar filtros</button>
    </div>
    <p className={styles.result} role="status" aria-live="polite">{visible} de {quantity(activities.length, 'atividade exibida', 'atividades exibidas')}.</p>
    {!groups.length ? <div className={styles.empty}><h3>{activities.length ? 'Nenhuma atividade para estes filtros' : 'Sua agenda começa pela primeira atividade'}</h3><p>{activities.length ? 'Experimente outro dia, espaço ou termo de busca.' : 'Cadastre uma sala, crie uma atividade e vincule os palestrantes nos formulários abaixo.'}</p></div> : groups.map((group) => <section key={group.day} className={styles.day} aria-label={group.label}>
      <h3>{group.label}<span>{quantity(group.activities.length, 'atividade', 'atividades')}</span></h3>
      <div className={styles.timeline}>{group.activities.map((activity) => {
        const issues = conflicts.filter((item) => item.entityIds?.includes(activity.id));
        const blocking = issues.filter((item) => item.severity === 'BLOCKING').length;
        return <article className={styles.activity} key={activity.id}>
          <div className={styles.time}><time dateTime={activity.startAt}>{agendaHour(activity.startAt, zone)}</time><span>até {agendaHour(activity.endAt, zone)}{agendaDay(activity.startAt, zone) !== agendaDay(activity.endAt, zone) && ` · ${agendaDateLabel(activity.endAt, zone)}`}</span></div>
          <div className={styles.content}><div className={styles.tags}><span>{activity.activityType}</span><span>{activity.space?.name ?? 'Espaço a definir'}</span><span className={blocking ? styles.blocked : styles.status}>{blocking ? quantity(blocking, 'pendência bloqueante', 'pendências bloqueantes') : activity.status === 'READY_FOR_REVIEW' ? 'Pronta para revisão' : 'Rascunho'}</span></div><h4>{activity.title}</h4>
            {activity.participants.length ? <ul className={styles.people}>{activity.participants.map((p) => <li key={p.id}><strong>{p.person?.name ?? 'Pessoa não disponível'}</strong><span>{agendaRole(p.participationType, p.customRoleLabel)}{p.person?.institution ? ` · ${p.person.institution}` : ''}</span></li>)}</ul> : <p className={styles.muted}>Pessoas ainda não vinculadas.</p>}
            {issues.length > blocking && <p className={styles.muted}>{issues.length - blocking} alertas para conferir no diagnóstico abaixo.</p>}
          </div><button type="button" className={styles.edit} disabled={disabled} onClick={(event) => onEdit(activity.id, event.currentTarget)}>Editar atividade<span className={styles.srOnly}> {activity.title}</span></button>
        </article>;
      })}</div>
    </section>)}
  </section>;
}
