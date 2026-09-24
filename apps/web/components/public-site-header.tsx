'use client';

import Link from 'next/link';
import styles from './public-site-header.module.css';

export type PublicSiteHeaderCurrent = 'participante' | 'home' | 'login' | 'cadastro' | 'eventos' | 'evento' | 'legal';

type NavItem = {
  href: '/eventos' | '/login' | '/cadastro' | '/participante';
  label: string;
  current?: boolean;
  primary?: boolean;
};

const NAV_BY_ROUTE: Record<PublicSiteHeaderCurrent, readonly NavItem[]> = {
  home: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/participante', label: 'Área do participante' },
    { href: '/login', label: 'Entrar' },
    { href: '/cadastro', label: 'Criar conta', primary: true },
  ],
  login: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/cadastro', label: 'Criar conta', primary: true },
  ],
  cadastro: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/login', label: 'Entrar' },
  ],
  eventos: [
    { href: '/eventos', label: 'Eventos', current: true },
    { href: '/login', label: 'Área do organizador' },
  ],
  evento: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/login', label: 'Área do organizador' },
  ],
  participante: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/participante', label: 'Área do participante', current: true },
    { href: '/login', label: 'Área do organizador' },
  ],
  legal: [
    { href: '/eventos', label: 'Eventos' },
    { href: '/login', label: 'Entrar' },
    { href: '/cadastro', label: 'Criar conta', primary: true },
  ],
};

export default function PublicSiteHeader({ current }: { current: PublicSiteHeaderCurrent }) {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Evolvia — início">
        <span className={styles.brandMark} aria-hidden="true"><span /></span>
        EVOLVIA
      </Link>
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
