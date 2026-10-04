'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { publicRegionLabel, suggestBrazilianRegion } from '../lib/public-discovery';
import styles from '../app/eventos/page.module.css';

export default function PublicRegionSuggest() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState('');

  function suggest() {
    if (!navigator.geolocation) {
      setStatus('Este navegador não informa a região. Escolha o estado na lista.');
      return;
    }
    setStatus('Consultando a região neste aparelho…');
    navigator.geolocation.getCurrentPosition((position) => {
      const region = suggestBrazilianRegion(position.coords.latitude, position.coords.longitude);
      if (!region) {
        setStatus('Não identificamos um estado do Brasil. Escolha a região na lista.');
        return;
      }
      const next = new URLSearchParams(params.toString());
      next.set('region', region);
      next.delete('page');
      const query = next.toString();
      setStatus(`Região sugerida: ${publicRegionLabel(region)}.`);
      router.push(query ? `/eventos?${query}` : '/eventos');
    }, () => {
      setStatus('A localização não foi autorizada. Escolha o estado na lista.');
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  }

  return <div className={styles.suggest}>
    <button className={styles.secondary} type="button" onClick={suggest}>Sugerir minha região</button>
    <p className={styles.suggestStatus} role="status">{status}</p>
  </div>;
}
