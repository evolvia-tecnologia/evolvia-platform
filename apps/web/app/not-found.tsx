import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './not-found.module.css';

export const metadata: Metadata = {
  title: 'Página não encontrada',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <main id="main-content" className={styles.root} tabIndex={-1}>
      <div className={styles.card}>
        <p className={styles.code} aria-hidden="true">404</p>
        <h1 className={styles.title}>Página não encontrada</h1>
        <p className={styles.description}>
          O endereço que você tentou acessar não existe ou foi removido.
          Use os links abaixo para continuar navegando.
        </p>
        <nav className={styles.actions} aria-label="Ações de recuperação">
          <Link className="btn btn-primary" href="/">Voltar ao início</Link>
          <Link className="btn btn-secondary" href="/eventos">Explorar eventos</Link>
        </nav>
      </div>
    </main>
  </>;
}
