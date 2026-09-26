'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PublicSiteHeader from '../../components/public-site-header';
import { ApiError, api, clearSession, getToken } from '../../lib/api';
import styles from './page.module.css';

type Me = { name: string; memberships: { id: string; role: string; organization: { id: string; name: string } }[] };
type OperatorEvent = { id: string; name: string; organizationId: string; operatorPermissions: string[] };
type Participant = { linked: boolean; events: { slug: string }[] };

export default function AccessPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [operatorEvents, setOperatorEvents] = useState<OperatorEvent[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [organizationName, setOrganizationName] = useState('');
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState('');
  const creatingRef = useRef(false);
  const creationAttempt = useRef<{ name: string; key: string } | null>(null);

  const loadAccess = useCallback(async () => {
    if (!getToken()) { router.replace('/login'); return; }
    setLoading(true); setError('');
    const [account, area, events] = await Promise.allSettled([
      api<Me>('/me'), api<Participant>('/participant/me'), api<OperatorEvent[]>('/events'),
    ]);
    const failures = [account, area, events].filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    if (failures.some((result) => result.reason instanceof ApiError && result.reason.status === 401)) {
      clearSession(); router.replace('/login'); return;
    }
    setMe(account.status === 'fulfilled' ? account.value : null);
    setParticipant(area.status === 'fulfilled' ? area.value : null);
    setOperatorEvents(events.status === 'fulfilled' ? events.value.filter((item) => item.operatorPermissions?.length > 0) : []);
    if (failures.length) setError('Alguns acessos não puderam ser carregados. Você ainda pode entrar na área disponível e tentar novamente.');
    setLoading(false);
  }, [router]);

  useEffect(() => { void loadAccess(); }, [loadAccess]);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingRef.current || !me) return;
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
        const previousIds = new Set(me.memberships.map((membership) => membership.organization.id));
        if (account.memberships.some((membership) => !previousIds.has(membership.organization.id))) { router.push('/painel'); return; }
      } catch {
        setCreationError('Não foi possível confirmar a criação. Consulte seus acessos antes de tentar novamente.');
        return;
      }
      setCreationError(reason instanceof Error ? reason.message : 'Não foi possível criar a organização.');
    } finally {
      creatingRef.current = false; setCreating(false);
    }
  }

  const organizerMemberships = me?.memberships.filter((membership) => ['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) ?? [];
  const hasOperatorMembership = me?.memberships.some((membership) => membership.role === 'OPERATOR') ?? false;

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="login" />
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <p className={styles.eyebrow}>SUA CONTA EVOLVIA</p>
      <h1>Onde você quer continuar?</h1>
      <p>Uma única conta pode ter acessos diferentes. Escolha a área e o evento em que você vai atuar.</p>
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
          <p>Crie e gerencie seus eventos nas organizações em que você tem permissão de gestão.</p>
          {me && organizerMemberships.length > 0
            ? <><p className={styles.detail}>Gestão em {organizerMemberships.map((membership) => membership.organization.name).join(', ')}.</p><Link className={styles.action} href="/painel">Abrir painel de eventos</Link></>
            : me ? <form className={styles.createForm} onSubmit={createOrganization}>
                <p className={styles.detail}>Para organizar seus próprios eventos, crie uma organização. Sua função de operador e suas inscrições continuam separadas.</p>
                <label htmlFor="organization-name">Nome da organização</label>
                <input id="organization-name" required minLength={2} maxLength={120} autoComplete="organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Ex.: Minha empresa ou projeto" />
                {creationError && <p className={styles.formError} role="alert">{creationError}</p>}
                <button className={styles.action} type="submit" disabled={creating}>{creating ? 'Criando…' : 'Criar organização e continuar'}</button>
              </form>
            : <p className={styles.detail}>Não foi possível consultar suas organizações agora.</p>}
        </section>
        {(hasOperatorMembership || operatorEvents.length > 0) && <section className={styles.card} aria-labelledby="operator-title">
          <span className={styles.icon} aria-hidden="true">03</span>
          <h2 id="operator-title">Área do operador</h2>
          <p>Acesse somente os eventos e as funções de credenciamento e check-in atribuídas pelo organizador.</p>
          {operatorEvents.length > 0 ? <>
            <p className={styles.detail}>{operatorEvents.length} evento(s) disponível(is) para operar.</p>
            <ul className={styles.eventLinks}>{operatorEvents.map((event) => <li key={event.id}>
              <Link href={`/eventos/${encodeURIComponent(event.id)}/operacao`}>{event.name} — abrir posto</Link>
            </li>)}</ul>
          </> : <p className={styles.detail}>Ainda não há funções atribuídas. Peça ao organizador o acesso ao evento.</p>}
        </section>}
      </div>}
      <Link className={styles.secondary} href="/eventos">Explorar eventos publicados</Link>
    </main>
  </>;
}
