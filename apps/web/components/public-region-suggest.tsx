'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { publicRegionLabel, suggestBrazilianRegion } from '../lib/public-discovery';
import styles from '../app/eventos/page.module.css';

export default function PublicRegionSuggest({ currentSearch = '' }: { currentSearch?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function suggest() {
    if (!navigator.geolocation) {
      setStatus('Este navegador não informa a região. Escolha o estado na lista.');
      return;
    }
    setStatus('Consultando a região neste aparelho…');
    navigator.geolocation.getCurrentPosition((position) => {
      if (!mounted.current) return;
      const region = suggestBrazilianRegion(position.coords.latitude, position.coords.longitude);
      if (!region) {
        setStatus('Não identificamos um estado do Brasil. Escolha a região na lista.');
        return;
      }
      const next = new URLSearchParams(currentSearch);
      next.set('region', region);
      next.delete('page');
      const query = next.toString();
      setStatus(`Região sugerida: ${publicRegionLabel(region)}.`);
      router.push(query ? `/eventos?${query}` : '/eventos');
    }, () => {
      if (!mounted.current) return;
      setStatus('A localização não foi autorizada. Escolha o estado na lista.');
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  }

  return <div className={styles.suggest}>
    <button className={styles.secondary} type="button" onClick={suggest}>Sugerir minha região</button>
    <p className={styles.suggestStatus} role="status">{status}</p>
  </div>;
}
