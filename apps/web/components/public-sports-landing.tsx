import type { PublicEventPresentationData } from './public-event-presentation';
import { readSportsCatalog } from '../lib/sports-public-catalog';
import { publishedKitAvailabilityLabel, type PublishedAthletePrompt, type PublishedShirtSize } from '../lib/sports-athlete-and-kits';
import { publishedModalityFacts } from '../lib/sports-public-profile';
import styles from './public-sports-landing.module.css';

/** Modalidades salvas e tamanhos já publicados na ficha. O texto das seções permanece na apresentação do evento. */
export default function PublicSportsLanding({ event, registrationOpen, shirtSizes, athletePrompts, context = 'event' }: {
  event: PublicEventPresentationData;
  registrationOpen: boolean;
  shirtSizes: PublishedShirtSize[];
  athletePrompts: PublishedAthletePrompt[];
  context?: 'event' | 'registration';
}) {
  const catalog = readSportsCatalog(event.sections);

  return <section className={styles.sports} aria-label="Informações da corrida">
    <div className={styles.intro}>
      <span className={styles.eyebrow}>EVOLVIA SPORTS · CORRIDAS E CAMINHADAS</span>
      <h2>Prepare-se para sua próxima conquista</h2>
      <p>{context === 'registration'
        ? 'Confira as modalidades e os tamanhos publicados antes de preencher a ficha.'
        : 'Conheça as modalidades, os kits e as informações oficiais antes de confirmar a inscrição.'}</p>
      {context !== 'registration' && !registrationOpen && <p className={styles.closed} role="status">Inscrições indisponíveis neste momento. Consulte as informações oficiais do evento.</p>}
      <p>A camiseta e o kit, quando existirem, são escolhidos na inscrição já configurada para este evento. Esta página não reserva estoque nem cobra.</p>
    </div>
    {athletePrompts.length > 0 && <section className={styles.detail} aria-labelledby="sports-athlete-title">
      <h3 id="sports-athlete-title">O que a inscrição pede</h3>
      <ul className={styles.offer}>
        {athletePrompts.map((prompt) => <li key={prompt.code}>
          <strong>{prompt.label}</strong>
          <span>{prompt.required ? 'Obrigatório na ficha publicada.' : 'Opcional na ficha publicada.'}</span>
        </li>)}
      </ul>
    </section>}
    {catalog.modalities.length > 0 && <section className={styles.detail} aria-labelledby="sports-modalities-title">
      <h3 id="sports-modalities-title">Modalidades publicadas</h3>
      <ul className={styles.offer}>
        {catalog.modalities.map((modality) => <li key={modality.id}>
          <strong>{modality.name}</strong>
          <span>{publishedModalityFacts(modality)}</span>
        </li>)}
      </ul>
    </section>}
    {catalog.kits.length > 0 && <section className={styles.detail} aria-labelledby="sports-kit-stock-title">
      <h3 id="sports-kit-stock-title">Kits informados pelo evento</h3>
      <p>O saldo é o que o organizador publicou. Ele não reserva peça nem confirma a retirada.</p>
      <ul className={styles.offer}>
        {catalog.kits.map((kit) => <li key={kit.id}>
          <strong>{kit.label}</strong>
          <span>{publishedKitAvailabilityLabel(kit.available)}</span>
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
