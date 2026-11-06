import Link from 'next/link';
import type { PublicEventPresentationData } from './public-event-presentation';
import { SPORTS_PUBLIC_SECTIONS } from '../lib/sports-public-profile';
import styles from './public-sports-landing.module.css';

function sectionDescription(content: unknown): string | null {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return null;
  const row = content as Record<string, unknown>;
  for (const key of ['text', 'description', 'label']) {
    if (typeof row[key] === 'string' && row[key].trim()) return row[key].trim().slice(0, 4000);
  }
  return null;
}

/** O conteúdo é o salvo pelo organizador: sem inventar modalidades, preços ou disponibilidade. */
export default function PublicSportsLanding({ event, registrationOpen }: {
  event: PublicEventPresentationData;
  registrationOpen: boolean;
}) {
  const sections = event.sections
    .map((item) => ({
      title: item.title?.trim() ?? '',
      description: sectionDescription(item.content),
    }))
    .filter((item) => item.title && item.description);
  const registrationHref = `/evento/${encodeURIComponent(event.event.slug)}/inscricao`;

  return <section className={styles.sports} aria-label="Informações da corrida">
    <div className={styles.intro}>
      <span className={styles.eyebrow}>EVOLVIA SPORTS · CORRIDAS E CAMINHADAS</span>
      <h2>Prepare-se para sua próxima conquista</h2>
      <p>Conheça as modalidades, os kits e as informações oficiais antes de confirmar a inscrição.</p>
      {registrationOpen
        ? <Link className={styles.cta} href={registrationHref}>Escolher minha inscrição</Link>
        : <p className={styles.closed} role="status">Inscrições indisponíveis neste momento. Consulte as informações oficiais do evento.</p>}
    </div>
    <nav aria-label="Navegação da corrida" className={styles.nav}>
      {SPORTS_PUBLIC_SECTIONS.map((item) => {
        const match = sections.find((section) =>
          section.title.toLocaleLowerCase('pt-BR').includes(item.label.toLocaleLowerCase('pt-BR')));
        return match ? <a href={`#sports-${item.id}`} key={item.id}>{item.label}</a> : null;
      })}
    </nav>
    {SPORTS_PUBLIC_SECTIONS.map((item) => {
      const match = sections.find((section) =>
        section.title.toLocaleLowerCase('pt-BR').includes(item.label.toLocaleLowerCase('pt-BR')));
      return match ? <section key={item.id} id={`sports-${item.id}`} className={styles.detail}>
        <h3>{match.title}</h3>
        <p>{match.description}</p>
      </section> : null;
    })}
  </section>;
}
