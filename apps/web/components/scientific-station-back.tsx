'use client';

import { useRouter } from 'next/navigation';
import styles from './scientific-station.module.css';

export default function ScientificStationBack({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  return <button className={styles.return} type="button" onClick={() => {
    const previous = document.referrer;
    try {
      if (previous && new URL(previous).origin === window.location.origin) {
        router.back();
        return;
      }
    } catch {
      // A referência anterior não é um endereço utilizável.
    }
    router.push(fallback);
  }}>{label}</button>;
}
