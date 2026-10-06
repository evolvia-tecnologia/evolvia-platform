import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../components/public-site-header';
import { PUBLIC_HELP_ARTICLES } from '../../lib/public-help';
import styles from '../../components/public-help-article.module.css';

export const metadata: Metadata = {
  title: 'Ajuda',
  description: 'Inscrições, programação, credenciamento, trabalhos científicos, evento online e acessibilidade na Evolvia.',
};

export default function HelpIndexPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="ajuda" />
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <article className={styles.article}>
        <p className={styles.eyebrow}>AJUDA DA EVOLVIA</p>
        <h1>Como usar a plataforma</h1>
        <p className={styles.lead}>Explicações curtas sobre o que o participante e o organizador encontram hoje. O planejador de inscrição paga e o de trabalhos científicos continuam disponíveis.</p>
        <ul>
          {PUBLIC_HELP_ARTICLES.map((article) => <li key={article.slug}>
            <Link href={`/ajuda/${article.slug}`}>{article.title}</Link>
            <p>{article.description}</p>
          </li>)}
          <li>
            <Link href="/ajuda/planejar-inscricao-paga">Planejar inscrição paga</Link>
            <p>Organize categorias, lotes e decisões antes de cobrar.</p>
          </li>
          <li>
            <Link href="/ajuda/planejar-trabalhos-cientificos">Planejar trabalhos científicos</Link>
            <p>Prepare critérios e papéis da comissão antes de abrir o envio.</p>
          </li>
          <li>
            <Link href="/ajuda/planejar-eposters">Planejar e-posters</Link>
            <p>Organize a sessão de e-posters antes de abrir o envio.</p>
          </li>
        </ul>
        <div className={styles.actions}>
          <Link href="/eventos">Ver eventos publicados</Link>
          <Link href="/acessibilidade">Acessibilidade</Link>
        </div>
      </article>
    </main>
  </>;
}
