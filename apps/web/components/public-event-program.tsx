import { publicProgramDays, publicProgramTimeZone, type PublicProgram } from '../lib/public-event-program';
import styles from './public-event-program.module.css';

export default function PublicEventProgram({ program, wide = false }: { program: PublicProgram; wide?: boolean }) {
  const days = publicProgramDays(program);
  if (!days.length) return null;
  const zone = publicProgramTimeZone(program.event.timeZone);
  const hasOnline = days.some((day) => day.activities.some((activity) => activity.online));

  return <section className={`${styles.program} ${wide ? styles.wide : ''}`} id="programacao" aria-labelledby="program-title">
    <header className={styles.heading}>
      <h2 id="program-title">Programação</h2>
      <p>Horários em {zone.label}{!zone.confirmed && ' · fuso ainda não confirmado pela organização'}.</p>
      {hasOnline && <p>Atividades online: o acesso é liberado na área do participante para inscrições confirmadas.</p>}
    </header>

    {days.length > 1 && <nav className={styles.days} aria-label="Dias da programação">
      {days.map((day) => <a key={day.key} href={`#programacao-${day.key}`}>{day.label}</a>)}
    </nav>}

    {days.map((day) => <section key={day.key} id={`programacao-${day.key}`} className={styles.day} aria-labelledby={`programacao-${day.key}-titulo`}>
      <h3 id={`programacao-${day.key}-titulo`}>{day.label}</h3>
      <ol className={styles.timeline}>
        {day.activities.map((activity) => <li key={activity.id} className={styles.activity}>
          <p className={styles.time}>
            <time dateTime={activity.startAt}>{activity.startLabel}</time>
            <span>até <time dateTime={activity.endAt}>{activity.endLabel}</time>{activity.endsOnAnotherDay && ` de ${activity.endsOnAnotherDay}`}</span>
          </p>
          <div className={styles.content}>
            <ul className={styles.tags} aria-label="Detalhes da atividade">
              <li>{activity.activityType}</li>
              {activity.online ? <li>Online</li> : activity.space && <li>{activity.space.name}{activity.space.location ? ` · ${activity.space.location}` : ''}</li>}
              {activity.area && <li>{activity.area}</li>}
            </ul>
            <h4>{activity.title}</h4>
            {activity.description && <p className={styles.description}>{activity.description}</p>}
            {activity.people.length > 0 && <ul className={styles.people} aria-label="Participantes confirmados">
              {activity.people.map((person, index) => <li key={`${person.name}-${index}`}><strong>{person.name}</strong><span>{person.detail}</span></li>)}
            </ul>}
          </div>
        </li>)}
      </ol>
    </section>)}
  </section>;
}
