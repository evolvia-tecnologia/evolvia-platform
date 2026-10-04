import Link from 'next/link';
import PublicSiteHeader from './public-site-header';
import type { PublicHelpArticle } from '../lib/public-help';
import styles from './public-help-article.module.css';

export default function PublicHelpArticleView({ article }: { article: PublicHelpArticle }) {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="ajuda" />
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.back} href="/ajuda">← Toda a ajuda</Link>
        <p className={styles.eyebrow}>AJUDA DA EVOLVIA</p>
        <h1>{article.title}</h1>
        <p className={styles.lead}>{article.description}</p>
        {article.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <ul>
          {article.points.map((point) => <li key={point}>{point}</li>)}
        </ul>
        <div className={styles.actions}>
          <Link href="/eventos">Ver eventos publicados</Link>
          <Link href="/participante">Área do participante</Link>
          <Link href="/login">Área do organizador</Link>
        </div>
      </article>
    </main>
  </>;
}
