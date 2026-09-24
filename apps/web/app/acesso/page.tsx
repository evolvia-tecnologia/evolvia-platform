'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    Promise.all([api<Me>('/me'), api<Participant>('/participant/me')])
      .then(([account, area]) => { setMe(account); setParticipant(area); })
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          clearSession(); router.replace('/login'); return;
        }
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar seus acessos.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="login" />
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <p className={styles.eyebrow}>SUA CONTA EVOLVIA</p>
      <h1>Onde você quer continuar?</h1>
      <p>Uma única conta permite participar de eventos e organizar aqueles em que você tem acesso. Você pode trocar de área a qualquer momento.</p>
      {loading && <p role="status">Carregando seus acessos…</p>}
      {error && <div role="alert" className={styles.alert}>{error}<button type="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>}
      {me && participant && <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="participant-title">
          <span className={styles.icon} aria-hidden="true">01</span>
          <h2 id="participant-title">Área do participante</h2>
          <p>Veja suas inscrições ativas, pagamentos, credenciais de entrada e trabalhos científicos quando o evento oferecer essa função.</p>
          <p className={styles.detail}>{participant.linked ? `${participant.events.length} evento(s) ativo(s) na sua conta` : 'Confirme sua primeira inscrição para reunir seus eventos.'}</p>
          <Link className={styles.action} href="/participante">Acessar meus eventos</Link>
        </section>
        <section className={styles.card} aria-labelledby="organizer-title">
          <span className={styles.icon} aria-hidden="true">02</span>
          <h2 id="organizer-title">Área do organizador</h2>
          <p>Crie e gerencie eventos, inscrições, pagamentos e credenciamento nas organizações das quais você participa.</p>
          {me.memberships.length > 0
            ? <><p className={styles.detail}>Acesso a {me.memberships.length} organização(ões).</p><Link className={styles.action} href="/painel">Acessar organização</Link></>
            : <p className={styles.detail}>Você ainda não tem acesso de organizador. Um administrador poderá convidar esta mesma conta.</p>}
        </section>
      </div>}
      <Link className={styles.secondary} href="/eventos">Explorar eventos publicados</Link>
    </main>
  </>;
}
