'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
  const [verificationNotice, setVerificationNotice] = useState('');
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [organizationName, setOrganizationName] = useState('');
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState('');
  const creatingRef = useRef(false);
  const creationAttempt = useRef<{ name: string; key: string } | null>(null);

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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verificacao') === 'envio-indisponivel') {
      setVerificationNotice('A conta foi criada, mas não foi possível enviar o e-mail de confirmação. Você pode tentar novamente sem criar outra conta.');
      params.delete('verificacao');
      const remaining = params.toString();
      window.history.replaceState(null, '', window.location.pathname
        + (remaining ? `?${remaining}` : '') + window.location.hash);
    }
  }, []);

  async function resendVerification() {
    if (verificationBusy) return;
    setVerificationBusy(true);
    try {
      await api('/auth/email-verification/request', { method: 'POST', body: '{}' });
      setVerificationNotice('O pedido de envio foi aceito. Confira sua caixa de entrada e a pasta de spam.');
    } catch (reason) {
      setVerificationNotice(reason instanceof Error ? reason.message : 'Não foi possível enviar o link de confirmação.');
    } finally {
      setVerificationBusy(false);
    }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingRef.current || !me || me.memberships.length > 0) return;
    const name = organizationName.trim();
    if (name.length < 2 || name.length > 120) {
      setCreationError('Informe um nome de 2 a 120 caracteres.'); return;
    }
    let attempt = creationAttempt.current?.name === name ? creationAttempt.current : null;
    if (!attempt) {
      if (!globalThis.crypto?.getRandomValues) {
        setCreationError('Não foi possível iniciar a criação com segurança neste navegador. Use uma conexão segura e tente novamente.');
        return;
      }
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
      attempt = { name, key: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') };
      creationAttempt.current = attempt;
    }
    creatingRef.current = true; setCreating(true); setCreationError('');
    try {
      const result = await api<{ id: string }>('/organizations', {
        method: 'POST', headers: { 'idempotency-key': attempt.key }, body: JSON.stringify({ name }),
      });
      if (!result.id) throw new Error('A organização foi enviada, mas a resposta não pôde ser confirmada.');
      router.push('/painel');
    } catch (reason) {
      if (reason instanceof ApiError && reason.status >= 400 && reason.status < 500) {
        setCreationError(reason.message);
        return;
      }
      // Uma resposta de rede pode se perder após a transação: confira o vínculo antes de permitir novo envio.
      try {
        const account = await api<Me>('/me');
        if (account.memberships.length > 0) { router.push('/painel'); return; }
      } catch {
        setCreationError('Não foi possível confirmar a criação. Consulte seus acessos antes de tentar novamente.');
        return;
      }
      setCreationError(reason instanceof Error ? reason.message : 'Não foi possível criar a organização.');
    } finally {
      creatingRef.current = false; setCreating(false);
    }
  }

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="login" />
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <p className={styles.eyebrow}>SUA CONTA EVOLVIA</p>
      <h1>Onde você quer continuar?</h1>
      <p>Uma única conta permite participar de eventos e organizar aqueles em que você tem acesso. Você pode trocar de área a qualquer momento.</p>
      {verificationNotice && <div role="alert" className={styles.alert}>
        <p>{verificationNotice}</p>
        <button type="button" disabled={verificationBusy || loading} onClick={() => void resendVerification()}>
          {verificationBusy ? 'Solicitando…' : 'Reenviar e-mail de confirmação'}
        </button>
      </div>}
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
            : me ? <form className={styles.createForm} onSubmit={createOrganization}>
                <p className={styles.detail}>Comece a organizar com esta mesma conta. Suas inscrições continuam na área do participante.</p>
                <label htmlFor="organization-name">Nome da organização</label>
                <input id="organization-name" required minLength={2} maxLength={120} autoComplete="organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Ex.: Minha empresa ou projeto" />
                {creationError && <p className={styles.formError} role="alert">{creationError}</p>}
                <button className={styles.action} type="submit" disabled={creating}>{creating ? 'Criando…' : 'Criar organização e continuar'}</button>
              </form>
            : <p className={styles.detail}>Não foi possível consultar suas organizações agora.</p>}
        </section>
      </div>}
      <Link className={styles.secondary} href="/eventos">Explorar eventos publicados</Link>
    </main>
  </>;
}
