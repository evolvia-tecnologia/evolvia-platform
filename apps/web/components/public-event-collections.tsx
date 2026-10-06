import Link from 'next/link';
import { PUBLIC_EVENT_COLLECTIONS } from '../lib/public-event-collections';
import styles from './public-event-collections.module.css';

export default function PublicEventCollections({ current = '' }: { current?: string }) {
  const currentParams = new URLSearchParams(current.split('?')[1] ?? '');
  return <nav className={styles.row} aria-label="Coleções de eventos">
    {PUBLIC_EVENT_COLLECTIONS.map((item) => {
      const itemParams = new URLSearchParams(item.href.split('?')[1] ?? '');
      const active = current.startsWith('/eventos') && Array.from(itemParams.entries()).every(([key, value]) => currentParams.get(key) === value);
      return <Link className={styles.chip} href={item.href} aria-current={active ? 'page' : undefined} key={item.href}>{item.label}</Link>;
    })}
  </nav>;
}
