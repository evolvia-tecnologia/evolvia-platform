import PublicEventCollections from './public-event-collections';
import styles from './public-discovery-strip.module.css';

export default function PublicDiscoveryStrip() {
  return <section className={styles.strip} aria-labelledby="discovery-strip-title">
    <div className={styles.inner}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>EVENTOS PUBLICADOS</p>
        <h1 id="discovery-strip-title">Encontre o que está acontecendo</h1>
      </div>
      <form className={styles.search} action="/eventos" method="get" role="search">
        <label className={styles.field}>
          <span>Nome, cidade ou tipo</span>
          <input type="search" name="q" maxLength={120} placeholder="Ex.: congresso, São Paulo, saúde" />
        </label>
        <button type="submit">Buscar eventos</button>
      </form>
      <PublicEventCollections />
    </div>
  </section>;
}
