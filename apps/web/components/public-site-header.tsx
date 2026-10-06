'use client';

import Link from 'next/link';
import styles from './public-site-header.module.css';

export type PublicSiteHeaderCurrent = 'participante' | 'home' | 'login' | 'cadastro' | 'eventos' | 'evento' | 'legal' | 'ajuda';

type NavItem = {
  href: '/eventos' | '/login' | '/cadastro' | '/participante' | '/acesso' | '/ajuda' | '/acessibilidade';
  label: string;
  current?: boolean;
  primary?: boolean;
};

const NAV_BY_ROUTE: Record<PublicSiteHeaderCurrent, readonly NavItem[]> = {
  home: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/ajuda', label: 'Ajuda' },
    { href: '/participante', label: 'Área do participante' },
    { href: '/login', label: 'Entrar' },
    { href: '/cadastro', label: 'Criar conta', primary: true },
  ],
  login: [
    { href: '/participante', label: 'Área do participante' },
    { href: '/eventos', label: 'Eventos' },
    { href: '/cadastro', label: 'Criar conta', primary: true },
  ],
  cadastro: [
    { href: '/participante', label: 'Área do participante' },
    { href: '/eventos', label: 'Eventos' },
    { href: '/login', label: 'Entrar' },
  ],
  eventos: [
    { href: '/participante', label: 'Área do participante' },
    { href: '/ajuda', label: 'Ajuda' },
    { href: '/eventos', label: 'Eventos', current: true },
    { href: '/login', label: 'Área do organizador' },
  ],
  evento: [
    { href: '/participante', label: 'Área do participante' },
    { href: '/ajuda', label: 'Ajuda' },
    { href: '/eventos', label: 'Eventos' },
    { href: '/login', label: 'Área do organizador' },
  ],
  ajuda: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/ajuda', label: 'Ajuda', current: true },
    { href: '/acessibilidade', label: 'Acessibilidade' },
    { href: '/participante', label: 'Área do participante' },
    { href: '/login', label: 'Área do organizador' },
  ],
  participante: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/participante', label: 'Área do participante', current: true },
    { href: '/login', label: 'Área do organizador' },
  ],
  legal: [
    { href: '/participante', label: 'Área do participante' },
    { href: '/eventos', label: 'Eventos' },
    { href: '/login', label: 'Entrar' },
    { href: '/cadastro', label: 'Criar conta', primary: true },
  ],
};

const SEARCHABLE: readonly PublicSiteHeaderCurrent[] = ['home', 'eventos', 'evento', 'ajuda', 'participante', 'legal'];

export default function PublicSiteHeader({ current }: { current: PublicSiteHeaderCurrent }) {
  const showSearch = SEARCHABLE.includes(current);
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Evolvia — início">
        <span className={styles.brandMark} aria-hidden="true"><span /></span>
        EVOLVIA
      </Link>
      {showSearch && <form className={styles.search} action="/eventos" method="get" role="search">
        <label className={styles.searchField}>
          <span>Buscar eventos</span>
          <input type="search" name="q" maxLength={120} placeholder="Nome, cidade ou tipo" />
        </label>
        <button className={styles.searchButton} type="submit">Buscar</button>
      </form>}
      <nav className={styles.nav} aria-label="Navegação principal">
        {NAV_BY_ROUTE[current].map((item) => (
          <Link
            key={`${item.href}:${item.label}`}
            className={item.primary ? styles.primaryAction : styles.action}
            href={item.href}
            aria-current={item.current ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
