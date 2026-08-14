import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicSiteShell } from '../../components/public-site-shell';
import styles from '../../components/public-site-shell.module.css';
import eventStyles from './public-events.module.css';

export const metadata: Metadata = {
  title: 'Encontrar eventos',
  description: 'Pesquise eventos publicados por tema, local e formato na Evolvia.',
};

export default function EventsDiscoveryPage() {
  return <PublicSiteShell>
    <div className={styles.page}>
      <p className={styles.eyebrow}>ENCONTRE EVENTOS</p>
      <h1 className={styles.title}>Descubra eventos por tema, formato e lugar.</h1>
      <p className={styles.lead}>A descoberta pública exibirá somente eventos realmente publicados e elegíveis. Filtros podem organizar a busca sem criar páginas vazias ou resultados artificiais.</p>

      <section className={styles.section} aria-labelledby="buscar-eventos">
        <div className={styles.card}>
          <h2 id="buscar-eventos">Buscar no catálogo público</h2>
          <form className={eventStyles.searchForm} action="/eventos" method="get" role="search">
            <label className={eventStyles.field}>
              <span>Evento ou palavra-chave</span>
              <input name="q" placeholder="Ex.: feira de tecnologia" />
            </label>
            <label className={eventStyles.field}>
              <span>Cidade ou região</span>
              <input name="local" placeholder="Ex.: São Paulo" autoComplete="address-level2" />
            </label>
            <button className={eventStyles.submit} type="submit">Buscar</button>
          </form>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="atalhos-eventos">
        <div className={styles.sectionHead}>
          <div><h2 id="atalhos-eventos">Explore por intenção</h2><p>Atalhos de descoberta usam filtros reais; páginas SEO dedicadas só serão abertas ao índice quando houver conteúdo suficiente.</p></div>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}><h3>Por formato</h3><p><Link className={styles.textLink} href="/eventos?formato=presencial">Presenciais</Link> · <Link className={styles.textLink} href="/eventos?formato=online">Online</Link> · <Link className={styles.textLink} href="/eventos?formato=hibrido">Híbridos</Link></p></article>
          <article className={styles.card}><h3>Por oportunidade</h3><p><Link className={styles.textLink} href="/eventos?preco=gratuito">Gratuitos</Link> · <Link className={styles.textLink} href="/eventos?submissoes=abertas">Submissões abertas</Link></p></article>
          <article className={styles.card}><h3>Por perfil</h3><p><Link className={styles.textLink} href="/eventos?tipo=congresso-cientifico">Científicos</Link> · <Link className={styles.textLink} href="/eventos?tipo=corporativo">Corporativos</Link> · <Link className={styles.textLink} href="/eventos?tipo=feira-exposicao">Feiras</Link></p></article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="catalogo-real">
        <div className={styles.card}>
          <h2 id="catalogo-real">Catálogo conectado à publicação</h2>
          <p>O próximo lote conecta esta página ao contrato público de Divulgação. Até essa integração, a Evolvia não exibirá cards fictícios, contagens inventadas nem rankings sem dados reais.</p>
        </div>
      </section>
    </div>
  </PublicSiteShell>;
}
