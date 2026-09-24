'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PublicSiteHeader from '../../components/public-site-header';
import { ApiError, api, clearSession, getToken } from '../../lib/api';
import styles from './page.module.css';

type Me = { name: string; memberships: { id: string }[] };
type Participant = { linked: boolean; events: { slug: string }[] };

export default function AccessPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAccess = useCallback(async () => {
    if (!getToken()) { router.replace('/login'); return; }
    setLoading(true); setError('');
    const [account, area] = await Promise.allSettled([api<Me>('/me'), api<Participant>('/participant/me')]);
    const failures = [account, area].filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    if (failures.some((result) => result.reason instanceof ApiError && result.reason.status === 401)) {
      clearSession(); router.replace('/login'); return;
    }
    setMe(account.status === 'fulfilled' ? account.value : null);
    setParticipant(area.status === 'fulfilled' ? area.value : null);
    if (failures.length) setError('Alguns acessos não puderam ser carregados. Você ainda pode entrar na área disponível e tentar novamente.');
    setLoading(false);
  }, [router]);

  useEffect(() => { void loadAccess(); }, [loadAccess]);

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="login" />
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <p className={styles.eyebrow}>SUA CONTA EVOLVIA</p>
      <h1>Onde você quer continuar?</h1>
      <p>Uma única conta permite participar de eventos e organizar aqueles em que você tem acesso. Você pode trocar de área a qualquer momento.</p>
      {loading && <p role="status">Carregando seus acessos…</p>}
      {error && <div role="alert" className={styles.alert}>{error}<button type="button" disabled={loading} onClick={() => void loadAccess()}>Tentar novamente</button></div>}
      {(me || participant) && <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="participant-title">
          <span className={styles.icon} aria-hidden="true">01</span>
          <h2 id="participant-title">Área do participante</h2>
          <p>Veja suas inscrições ativas, pagamentos, credenciais de entrada e trabalhos científicos quando o evento oferecer essa função.</p>
          {participant ? <p className={styles.detail}>{participant.linked ? `${participant.events.length} evento(s) ativo(s) na sua conta` : 'Confirme sua primeira inscrição para reunir seus eventos.'}</p> : <p className={styles.detail}>Não foi possível consultar suas inscrições agora.</p>}
          <Link className={styles.action} href="/participante">Acessar meus eventos</Link>
        </section>
        <section className={styles.card} aria-labelledby="organizer-title">
          <span className={styles.icon} aria-hidden="true">02</span>
          <h2 id="organizer-title">Área do organizador</h2>
          <p>Crie e gerencie eventos, inscrições, pagamentos e credenciamento nas organizações das quais você participa.</p>
          {me && me.memberships.length > 0
            ? <><p className={styles.detail}>Acesso a {me.memberships.length} organização(ões).</p><Link className={styles.action} href="/painel">Acessar organização</Link></>
            : <p className={styles.detail}>{me ? 'Você ainda não tem acesso de organizador. Um administrador poderá convidar esta mesma conta.' : 'Não foi possível consultar suas organizações agora.'}</p>}
        </section>
      </div>}
      <Link className={styles.secondary} href="/eventos">Explorar eventos publicados</Link>
    </main>
  </>;
}
