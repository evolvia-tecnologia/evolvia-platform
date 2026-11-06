import Link from 'next/link';
import type { PublicEventPresentationData } from './public-event-presentation';
import { readSportsCatalog } from '../lib/sports-public-catalog';
import type { PublishedShirtSize } from '../lib/sports-athlete-and-kits';
import styles from './public-sports-landing.module.css';

const KIND_LABEL = { RUN: 'Corrida', WALK: 'Caminhada', TRAIL: 'Trilha' } as const;

/** Modalidades salvas e tamanhos já publicados na ficha. O texto das seções permanece na apresentação do evento. */
export default function PublicSportsLanding({ event, registrationOpen, shirtSizes }: {
  event: PublicEventPresentationData;
  registrationOpen: boolean;
  shirtSizes: PublishedShirtSize[];
}) {
  const catalog = readSportsCatalog(event.sections);
  const registrationHref = `/evento/${encodeURIComponent(event.event.slug)}/inscricao`;

  return <section className={styles.sports} aria-label="Informações da corrida">
    <div className={styles.intro}>
      <span className={styles.eyebrow}>EVOLVIA SPORTS · CORRIDAS E CAMINHADAS</span>
      <h2>Prepare-se para sua próxima conquista</h2>
      <p>Conheça as modalidades, os kits e as informações oficiais antes de confirmar a inscrição.</p>
      {registrationOpen
        ? <Link className={styles.cta} href={registrationHref}>Escolher minha inscrição</Link>
        : <p className={styles.closed} role="status">Inscrições indisponíveis neste momento. Consulte as informações oficiais do evento.</p>}
      <p>A camiseta e o kit, quando existirem, são escolhidos na inscrição já configurada para este evento. Esta página não reserva estoque nem cobra.</p>
    </div>
    {catalog.modalities.length > 0 && <section className={styles.detail} aria-labelledby="sports-modalities-title">
      <h3 id="sports-modalities-title">Modalidades publicadas</h3>
      <ul className={styles.offer}>
        {catalog.modalities.map((modality) => <li key={modality.id}>
          <strong>{modality.name}</strong>
          <span>{KIND_LABEL[modality.kind]} · {modality.distanceKm} km{modality.capacity ? ` · até ${modality.capacity} atletas` : ''}</span>
        </li>)}
      </ul>
    </section>}
    {shirtSizes.length > 0 && <section className={styles.detail} aria-labelledby="sports-kits-title">
      <h3 id="sports-kits-title">Tamanhos publicados na ficha</h3>
      <ul className={styles.offer}>
        {shirtSizes.map((size) => <li key={size.id}>
          <strong>{size.label}</strong>
          <span>A escolha fica gravada na inscrição. Ela não reserva estoque.</span>
        </li>)}
      </ul>
    </section>}
  </section>;
}
