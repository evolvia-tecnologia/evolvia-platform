'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ApiError, api, getToken } from '../lib/api';
import styles from './registration-waitlist.module.css';

type WaitlistStatus = 'WAITING' | 'OFFERED' | 'ACCEPTED' | 'LEFT' | 'OFFER_EXPIRED';
type JoinableLot = { categoryId: string; categoryName: string; lotId: string; lotName: string; priceCents: number; closesAt: string | null; offerMinutes: number | null };
type OwnEntry = {
  lotId: string; lotName: string; categoryName: string; status: WaitlistStatus; position: number | null;
  queuedAt: string; offerExpiresAt: string | null; protocol: string | null; reservationStatus: string | null;
};
type ParticipantState = { event: { name: string; slug: string }; orderLabel: string; lots: JoinableLot[]; entries: OwnEntry[] };

type OrganizerEntry = { code: string; status: WaitlistStatus; position: number | null; queuedAt: string; offerExpiresAt: string | null; protocol: string | null };
type OrganizerLot = {
  lotId: string; lotName: string; categoryName: string; quantity: number | null; categoryCapacity: number | null; endsAt: string;
  reserved: number; offered: number; free: number | null; waiting: number;
  waitlistEnabled: boolean; waitlistOfferMinutes: number | null; waitlistClosesAt: string | null; acceptsEntries: boolean;
  entries: OrganizerEntry[];
};
type OrganizerOverview = { event: { id: string; name: string }; orderLabel: string; canManage: boolean; lots: OrganizerLot[] };

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const time = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const statusLabels: Record<WaitlistStatus, string> = {
  WAITING: 'Aguardando', OFFERED: 'Vaga oferecida', ACCEPTED: 'Aceita pela ficha', LEFT: 'Saiu da fila', OFFER_EXPIRED: 'Prazo vencido',
};

function newKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function message(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function minutesLabel(minutes: number | null): string {
  if (!minutes) return 'prazo definido pela organização';
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 dia' : `${minutes / 1440} dias`;
  if (minutes % 60 === 0) return minutes === 60 ? '1 hora' : `${minutes / 60} horas`;
  return `${minutes} minutos`;
}

function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function RegistrationWaitlist({ slug }: { slug: string }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [state, setState] = useState<ParticipantState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [reload, setReload] = useState(0);
  const eventHref = `/${encodeURIComponent(slug)}`;
  const registrationHref = `/evento/${encodeURIComponent(slug)}/inscricao`;

  useEffect(() => {
    const token = getToken();
    setSignedIn(Boolean(token));
    if (!token) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    api<ParticipantState>(`/participant/events/${encodeURIComponent(slug)}/waitlist`)
      .then((payload) => { if (active) { setState(payload); setError(''); } })
      .catch((reason) => {
        if (!active) return;
        setState(null);
        if (reason instanceof ApiError && reason.status === 401) { setSignedIn(false); return; }
        setError(message(reason, 'Não foi possível carregar a fila de espera.'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, reload]);

  async function join(event: FormEvent<HTMLFormElement>, lot: JoinableLot) {
    event.preventDefault();
    setBusy(lot.lotId); setError(''); setNotice('');
    try {
      const payload = await api<ParticipantState>(`/participant/events/${encodeURIComponent(slug)}/waitlist`, {
        method: 'POST',
        body: JSON.stringify({ lotId: lot.lotId, identityDocument: documents[lot.lotId] ?? '' }),
      });
      setState(payload);
      setDocuments((current) => ({ ...current, [lot.lotId]: '' }));
      setNotice('Você entrou na fila. Acompanhe sua posição nesta página.');
    } catch (reason) {
      setError(message(reason, 'Não foi possível entrar na fila.'));
    } finally {
      setBusy('');
    }
  }

  async function leave(entry: OwnEntry) {
    setBusy(entry.lotId); setError(''); setNotice('');
    try {
      const payload = await api<ParticipantState>(`/participant/events/${encodeURIComponent(slug)}/waitlist/${encodeURIComponent(entry.lotId)}`, { method: 'DELETE' });
      setState(payload);
      setNotice(entry.status === 'OFFERED' ? 'Você recusou a vaga e saiu da fila.' : 'Você saiu da fila.');
    } catch (reason) {
      setError(message(reason, 'Não foi possível sair da fila.'));
    } finally {
      setBusy('');
    }
  }

  const backLinks = <nav className={styles.links} aria-label="Voltar">
    <Link href={registrationHref}>Voltar à inscrição</Link>
    <Link href={eventHref}>Voltar ao evento</Link>
  </nav>;

  if (loading || signedIn === null) return <main className={styles.page}><p role="status">Carregando fila de espera…</p></main>;

  if (!signedIn) return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="waitlist-login-title">
      <p className={styles.eyebrow}>FILA DE ESPERA</p>
      <h1 id="waitlist-login-title">Entre na sua conta para usar a fila</h1>
      <p>A fila guarda o seu lugar pela sua conta. Assim só você vê e confirma a vaga quando ela for oferecida.</p>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/login">Entrar</Link>
        <Link className={styles.secondary} href="/cadastro">Criar conta</Link>
      </div>
      <p className={styles.hint}>Depois de entrar, volte a esta página do evento.</p>
      {backLinks}
    </section>
  </main>;

  if (!state) return <main className={styles.page}>
    <section className={styles.card} role="alert">
      <p className={styles.eyebrow}>FILA DE ESPERA</p>
      <h1>Fila indisponível</h1>
      <p>{error || 'Não foi possível carregar a fila de espera.'}</p>
      <button className={styles.secondary} type="button" onClick={() => setReload((value) => value + 1)}>Tentar de novo</button>
      {backLinks}
    </section>
  </main>;

  const activeLots = new Set(state.entries.filter((entry) => ['WAITING', 'OFFERED', 'ACCEPTED'].includes(entry.status)).map((entry) => entry.lotId));
  const joinable = state.lots.filter((lot) => !activeLots.has(lot.lotId));
  const hasActive = activeLots.size > 0;

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href={registrationHref}>← Voltar à inscrição</Link>
      <p className={styles.eyebrow}>FILA DE ESPERA</p>
      <h1>{state.event.name}</h1>
      <p>{state.orderLabel}</p>
      <p className={styles.hint}>Entrar na fila não cobra nada. Se a inscrição for paga, o pagamento só acontece depois que você confirmar a vaga oferecida.</p>
    </header>

    {notice && <p className={styles.success} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}

    {state.entries.length > 0 && <section aria-labelledby="waitlist-own-title" className={styles.stack}>
      <h2 id="waitlist-own-title">Sua situação</h2>
      {state.entries.map((entry) => <article key={entry.lotId} className={entry.status === 'OFFERED' ? `${styles.card} ${styles.offer}` : styles.card}>
        <p className={styles.eyebrow}>{entry.categoryName} · {entry.lotName}</p>
        <h3>{statusLabels[entry.status]}</h3>
        {entry.status === 'WAITING' && <>
          <p className={styles.position}>Você está na posição <strong>{entry.position}</strong> da fila.</p>
          <p className={styles.hint}>Entrou em {time(entry.queuedAt)}. A organização oferece as vagas liberadas pela ordem de entrada.</p>
          <button className={styles.secondary} type="button" disabled={busy === entry.lotId} onClick={() => void leave(entry)}>{busy === entry.lotId ? 'Saindo…' : 'Sair da fila'}</button>
        </>}
        {entry.status === 'OFFERED' && entry.offerExpiresAt && <>
          <p>Uma vaga foi reservada para você até <strong>{time(entry.offerExpiresAt)}</strong>. Ela só vira inscrição quando você confirmar pela ficha.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={`${registrationHref}?oferta=${encodeURIComponent(entry.lotId)}`}>Confirmar minha vaga</Link>
            <button className={styles.secondary} type="button" disabled={busy === entry.lotId} onClick={() => void leave(entry)}>Recusar e sair da fila</button>
          </div>
        </>}
        {entry.status === 'ACCEPTED' && <>
          <p>{entry.reservationStatus === 'CONFIRMED'
            ? 'Sua inscrição foi confirmada pela fila.'
            : entry.reservationStatus === 'PENDING_PAYMENT'
              ? 'Sua vaga foi reservada pela fila. Conclua o pagamento dentro do prazo da inscrição.'
              : 'A reserva feita pela fila foi encerrada: o prazo de pagamento terminou ou a inscrição foi cancelada.'}
          {entry.protocol && <> Protocolo <strong>{entry.protocol}</strong>.</>}</p>
          {entry.protocol && entry.reservationStatus !== 'EXPIRED' && entry.reservationStatus !== 'CANCELLED'
            && <Link href={`${registrationHref}?protocolo=${encodeURIComponent(entry.protocol)}`}>Ver inscrição e pagamento</Link>}
        </>}
        {entry.status === 'OFFER_EXPIRED' && <p>O prazo para confirmar a vaga terminou. Se a fila continuar aberta, você pode entrar de novo; nesse caso vai para o fim da fila.</p>}
        {entry.status === 'LEFT' && <p>Você saiu desta fila. Se ela continuar aberta, pode entrar de novo pelo fim.</p>}
      </article>)}
    </section>}

    <section aria-labelledby="waitlist-open-title" className={styles.stack}>
      <h2 id="waitlist-open-title">Lotes esgotados com fila aberta</h2>
      {joinable.length === 0
        ? <p className={styles.card}>{state.entries.some((entry) => entry.status === 'WAITING' || entry.status === 'OFFERED')
          ? 'Você já está acompanhando a fila acima.'
          : hasActive
            ? 'Sua vaga neste evento já passou pela fila. Para uma nova inscrição, fale com a organização.'
            : 'Nenhum lote com fila aberta agora. Se ainda houver vagas, faça a inscrição normalmente.'}</p>
        : joinable.map((lot) => <form key={lot.lotId} className={styles.card} onSubmit={(event) => void join(event, lot)}>
          <p className={styles.eyebrow}>{lot.categoryName}</p>
          <h3>{lot.lotName}</h3>
          <p>{lot.priceCents > 0 ? money.format(lot.priceCents / 100) : 'Gratuito'} · Prazo para confirmar quando a vaga for oferecida: {minutesLabel(lot.offerMinutes)}{lot.closesAt ? ` · Fila aberta até ${time(lot.closesAt)}` : ''}</p>
          <label htmlFor={`waitlist-document-${lot.lotId}`}>CPF ou documento estrangeiro
            <input id={`waitlist-document-${lot.lotId}`} required minLength={5} maxLength={50} autoComplete="off"
              value={documents[lot.lotId] ?? ''} onChange={(event) => setDocuments((current) => ({ ...current, [lot.lotId]: event.target.value }))} />
            <small>Use o mesmo documento e o e-mail da sua conta ao confirmar a vaga. O documento não aparece para outras pessoas.</small>
          </label>
          <button className={styles.primary} type="submit" disabled={Boolean(busy) || hasActive}>{busy === lot.lotId ? 'Entrando…' : 'Entrar na fila'}</button>
          {hasActive && <small>Você só pode acompanhar uma fila por evento.</small>}
        </form>)}
    </section>
    {backLinks}
  </main>;
}

type LotDraft = { enabled: boolean; offerMinutes: string; closesAt: string };

export function RegistrationWaitlistOrganizer({ eventId }: { eventId: string }) {
  const [overview, setOverview] = useState<OrganizerOverview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LotDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [promotionKeys, setPromotionKeys] = useState<Record<string, string>>({});
  const [reload, setReload] = useState(0);

  function apply(payload: OrganizerOverview) {
    setOverview(payload);
    setDrafts(Object.fromEntries(payload.lots.map((lot) => [lot.lotId, {
      enabled: lot.waitlistEnabled,
      offerMinutes: lot.waitlistOfferMinutes ? String(lot.waitlistOfferMinutes) : '1440',
      closesAt: toLocalInput(lot.waitlistClosesAt),
    }])));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<OrganizerOverview>(`/events/${encodeURIComponent(eventId)}/registration-waitlist`)
      .then((payload) => { if (active) { apply(payload); setError(''); } })
      .catch((reason) => { if (active) { setOverview(null); setError(message(reason, 'Não foi possível carregar a fila de espera.')); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, reload]);

  async function save(event: FormEvent<HTMLFormElement>, lot: OrganizerLot) {
    event.preventDefault();
    const draft = drafts[lot.lotId];
    setBusy(`save:${lot.lotId}`); setError(''); setNotice('');
    try {
      const payload = await api<OrganizerOverview>(`/events/${encodeURIComponent(eventId)}/registration-waitlist/lots/${encodeURIComponent(lot.lotId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: draft.enabled,
          offerMinutes: draft.offerMinutes ? Number(draft.offerMinutes) : null,
          closesAt: draft.closesAt ? new Date(draft.closesAt).toISOString() : null,
        }),
      });
      apply(payload);
      setNotice(`Fila de ${lot.lotName} ${draft.enabled ? 'ativada' : 'desativada'}.`);
    } catch (reason) {
      setError(message(reason, 'Não foi possível salvar a fila.'));
    } finally {
      setBusy('');
    }
  }

  async function promote(lot: OrganizerLot) {
    const key = promotionKeys[lot.lotId] ?? newKey('promote');
    setPromotionKeys((current) => ({ ...current, [lot.lotId]: key }));
    setBusy(`promote:${lot.lotId}`); setError(''); setNotice('');
    try {
      const result = await api<{ code: string; offerExpiresAt: string | null }>(`/events/${encodeURIComponent(eventId)}/registration-waitlist/promote`, {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify({ lotId: lot.lotId }),
      });
      setPromotionKeys((current) => { const next = { ...current }; delete next[lot.lotId]; return next; });
      setNotice(`Vaga oferecida a ${result.code}${result.offerExpiresAt ? ` até ${time(result.offerExpiresAt)}` : ''}. A pessoa precisa confirmar pela ficha.`);
      setReload((value) => value + 1);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status < 500) setPromotionKeys((current) => { const next = { ...current }; delete next[lot.lotId]; return next; });
      setError(message(reason, 'Não foi possível promover a próxima pessoa.'));
    } finally {
      setBusy('');
    }
  }

  return <section aria-labelledby="registration-waitlist-title" className={styles.panel}>
    <div className={styles.panelHeader}>
      <div>
        <h2 id="registration-waitlist-title">Fila de espera por lote</h2>
        <p>{overview?.orderLabel ?? 'Ordem de entrada na fila.'} A promoção é sempre manual: reserva a vaga pelo prazo definido e a pessoa confirma pela ficha. Não marca pagamento nem entrada.</p>
      </div>
      <button className={styles.secondary} type="button" onClick={() => setReload((value) => value + 1)}>Atualizar fila</button>
    </div>
    {notice && <p className={styles.success} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading && <p role="status">Carregando fila de espera…</p>}
    {!loading && overview && overview.lots.length === 0 && <p>Nenhum lote ativo neste evento. Cadastre lotes em Categorias e lotes.</p>}
    {!loading && overview && overview.lots.map((lot) => {
      const draft = drafts[lot.lotId];
      const full = lot.free === 0;
      return <article key={lot.lotId} className={styles.lot}>
        <header className={styles.lotHeader}>
          <div>
            <p className={styles.eyebrow}>{lot.categoryName}</p>
            <h3>{lot.lotName}</h3>
          </div>
          <span className={full ? `${styles.badge} ${styles.badgeFull}` : styles.badge}>{full ? 'Lotado' : lot.free === null ? 'Sem limite' : `${lot.free} vaga(s) livre(s)`}</span>
        </header>
        <dl className={styles.metrics}>
          <div><dt>Vagas do lote</dt><dd>{lot.quantity ?? 'Sem limite'}</dd></div>
          <div><dt>Inscrições ativas</dt><dd>{lot.reserved}</dd></div>
          <div><dt>Ofertas em aberto</dt><dd>{lot.offered}</dd></div>
          <div><dt>Aguardando</dt><dd>{lot.waiting}</dd></div>
        </dl>
        {overview.canManage && draft && <form className={styles.config} onSubmit={(event) => void save(event, lot)}>
          <label className={styles.check}><input type="checkbox" checked={draft.enabled} onChange={(event) => setDrafts((current) => ({ ...current, [lot.lotId]: { ...draft, enabled: event.target.checked } }))} /> Aceitar fila quando lotar</label>
          <label htmlFor={`waitlist-minutes-${lot.lotId}`}>Prazo para confirmar a vaga
            <select id={`waitlist-minutes-${lot.lotId}`} value={draft.offerMinutes} onChange={(event) => setDrafts((current) => ({ ...current, [lot.lotId]: { ...draft, offerMinutes: event.target.value } }))}>
              {[30, 60, 180, 720, 1440, 2880, 4320, 10080].map((value) => <option key={value} value={String(value)}>{minutesLabel(value)}</option>)}
              {!['30', '60', '180', '720', '1440', '2880', '4320', '10080'].includes(draft.offerMinutes) && <option value={draft.offerMinutes}>{minutesLabel(Number(draft.offerMinutes))}</option>}
            </select>
          </label>
          <label htmlFor={`waitlist-closes-${lot.lotId}`}>Fechar a fila em (opcional)
            <input id={`waitlist-closes-${lot.lotId}`} type="datetime-local" value={draft.closesAt} max={toLocalInput(lot.endsAt)} onChange={(event) => setDrafts((current) => ({ ...current, [lot.lotId]: { ...draft, closesAt: event.target.value } }))} />
          </label>
          <button className={styles.secondary} type="submit" disabled={busy === `save:${lot.lotId}`}>{busy === `save:${lot.lotId}` ? 'Salvando…' : 'Salvar fila'}</button>
        </form>}
        {!overview.canManage && <p className={styles.hint}>Fila {lot.waitlistEnabled ? `ativa · prazo de ${minutesLabel(lot.waitlistOfferMinutes)}` : 'desativada'}. Só proprietário, administrador ou gestor altera a fila e promove.</p>}
        {lot.waitlistEnabled && !lot.acceptsEntries && <p className={styles.hint}>A fila não aceita novas entradas agora (encerrada ou fora do período do lote).</p>}
        {overview.canManage && lot.waiting > 0 && <button className={styles.primary} type="button" disabled={busy === `promote:${lot.lotId}` || lot.free === 0}
          onClick={() => void promote(lot)}>{busy === `promote:${lot.lotId}` ? 'Promovendo…' : 'Promover próximo da fila'}</button>}
        {overview.canManage && lot.waiting > 0 && lot.free === 0 && <p className={styles.hint}>Sem vaga liberada. A promoção abre quando uma inscrição for cancelada ou expirar.</p>}
        {lot.entries.length === 0 ? <p className={styles.hint}>Ninguém na fila deste lote.</p> : <div className={styles.tableWrap}>
          <table><caption>Fila de {lot.lotName}</caption>
            <thead><tr><th scope="col">Posição</th><th scope="col">Código</th><th scope="col">Situação</th><th scope="col">Entrada na fila</th><th scope="col">Prazo / protocolo</th></tr></thead>
            <tbody>{lot.entries.map((entry) => <tr key={entry.code}>
              <td>{entry.position ?? '—'}</td>
              <th scope="row">{entry.code}</th>
              <td>{statusLabels[entry.status]}</td>
              <td>{time(entry.queuedAt)}</td>
              <td>{entry.offerExpiresAt ? `até ${time(entry.offerExpiresAt)}` : entry.protocol ?? '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </article>;
    })}
  </section>;
}
