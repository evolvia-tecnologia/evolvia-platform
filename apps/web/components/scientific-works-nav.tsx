'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './scientific-works-nav.module.css';

type NavItem = { href: string; label: string; match?: RegExp };

const OVERVIEW: NavItem = {
  href: 'trabalhos',
  label: 'Visão geral',
  match: /\/cientifico\/trabalhos(?:\/|$)/u,
};

const CONFIG: NavItem[] = [
  { href: 'submissoes#regras', label: 'Submissão e regras' },
  { href: 'submissoes#conteudo', label: 'Conteúdo e limites' },
  { href: 'submissoes#autoria', label: 'Autoria' },
  { href: 'submissoes#areas', label: 'Áreas e subáreas' },
  { href: 'submissoes#formas', label: 'Formas e prazos' },
  { href: 'submissoes#cegamento', label: 'Cegamento e banca' },
  { href: 'submissoes#cartas', label: 'Modelos de cartas' },
  { href: 'avaliacao#criterios', label: 'Critérios de avaliação' },
];

const MANAGEMENT: NavItem[] = [
  { href: 'submissoes#lista', label: 'Lista de trabalhos' },
  { href: 'avaliacao#distribuicao', label: 'Distribuição' },
  { href: 'avaliacao#distribuicao-assistida', label: 'Distribuição assistida' },
  { href: 'avaliacao#acompanhamento', label: 'Acompanhamento' },
  { href: 'avaliacao#decisao', label: 'Decisões' },
  { href: 'submissoes#estacao', label: 'Estação e e-pôster' },
  { href: 'painel/comunicacao', label: 'Comunicação do evento', match: /\/painel\/comunicacao(?:\/|$)/u },
  { href: 'painel/relatorios', label: 'Relatórios', match: /\/painel\/relatorios(?:\/|$)/u },
];

function resolveHref(eventId: string, item: NavItem): string {
  if (item.href.startsWith('painel/')) return `/eventos/${eventId}/${item.href}`;
  return `/eventos/${eventId}/cientifico/${item.href}`;
}

function isActive(pathname: string, hash: string, item: NavItem): boolean {
  if (item.match) return item.match.test(pathname);
  if (item.href.startsWith('painel/')) return false;
  const [path, itemHash] = item.href.split('#');
  const onPath = pathname.includes(`/cientifico/${path}`);
  if (!onPath) return false;
  if (!itemHash) return hash.length === 0;
  return hash === itemHash;
}

export default function ScientificWorksNav({ eventId }: { eventId: string }) {
  const pathname = usePathname() || '';
  const [hash, setHash] = useState('');

  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/u, ''));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  return <nav className={styles.nav} aria-label="Trabalhos científicos">
    <div className={styles.group}>
      <p className={styles.groupLabel}>Visão geral</p>
      <Link
        className={isActive(pathname, hash, OVERVIEW) ? styles.linkActive : styles.link}
        href={resolveHref(eventId, OVERVIEW)}
        aria-current={isActive(pathname, hash, OVERVIEW) ? 'page' : undefined}
      >
        {OVERVIEW.label}
      </Link>
    </div>
    <div className={styles.group}>
      <p className={styles.groupLabel}>Configurações</p>
      <ul className={styles.list}>
        {CONFIG.map((item) => {
          const active = isActive(pathname, hash, item);
          return <li key={item.href}>
            <Link className={active ? styles.linkActive : styles.link} href={resolveHref(eventId, item)} aria-current={active ? 'page' : undefined}>
              {item.label}
            </Link>
          </li>;
        })}
      </ul>
    </div>
    <div className={styles.group}>
      <p className={styles.groupLabel}>Gerenciamento</p>
      <ul className={styles.list}>
        {MANAGEMENT.map((item) => {
          const active = isActive(pathname, hash, item);
          const externalNote = item.href.startsWith('painel/')
            ? item.href.includes('comunicacao')
              ? ' (painel)'
              : ' (pós-evento)'
            : '';
          return <li key={item.href}>
            <Link className={active ? styles.linkActive : styles.link} href={resolveHref(eventId, item)} aria-current={active ? 'page' : undefined}>
              {item.label}{externalNote}
            </Link>
          </li>;
        })}
      </ul>
    </div>
  </nav>;
}

/** Scrolls to hash after async scientific pages mount. */
export function useScientificHashScroll(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const id = window.location.hash.replace(/^#/u, '');
    if (!id) return;
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [ready]);
}
