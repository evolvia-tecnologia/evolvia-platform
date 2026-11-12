'use client';

import { useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import { communicationDraftId } from '../lib/event-communication-draft';
import EvaScreenSupport from './eva-screen-support';
import EventCommunicationAudience from './event-communication-audience';
import PublicationRichTextField from './publication-rich-text-field';
import styles from './event-communication.module.css';

type Summary = { id: string; subject: string; revision: number; updatedAt: string };
type Draft = Summary & { body: string };
type Listing = { eventId: string; drafts: Summary[]; sendingAvailable: false };
const newDraft = (): Draft => ({ id: communicationDraftId(), subject: '', body: '', revision: 0, updatedAt: '' });

export default function EventCommunication({ eventId }: { eventId: string }) {
  return <ScopedCommunication key={eventId} eventId={eventId} />;
}

function ScopedCommunication({ eventId }: { eventId: string }) {
  const [drafts, setDrafts] = useState<Summary[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'write' | 'drafts'>('write');
  const current = useRef(false);
  const operation = useRef(false);
  const endpoint = `/events/${eventId}/communication/drafts`;

  useEffect(() => {
    current.current = true;
    let active = true;
    if (!getToken()) { setMessage('Entre na sua conta para acessar os rascunhos.'); return () => { current.current = false; }; }
    api<Listing>(endpoint).then((result) => {
      if (!active) return;
      setDrafts(result.drafts); setReady(true);
      try { setDraft(newDraft()); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar um rascunho seguro. Abra um existente.'); }
    }).catch(() => { if (active) setMessage('Não foi possível carregar os rascunhos. Recarregue esta página para tentar novamente.'); });
    return () => { active = false; current.current = false; };
  }, [endpoint]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const warnNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const next = new URL(link.href, window.location.href);
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      if (!window.confirm('Sair desta tela descarta as alterações não salvas. Deseja sair?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', warnNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', warnNavigation, true);
    };
  }, [dirty]);

  async function open(id: string) {
    if (operation.current || dirty) return;
    operation.current = true; setBusy(true); setMessage('');
    try {
      const result = await api<Draft>(`${endpoint}/${id}`);
      if (!current.current) return;
      setDraft(result); setDirty(false); setTab('write');
    } catch { if (current.current) setMessage('Não foi possível abrir o rascunho. O texto atual foi preservado.'); }
    finally { operation.current = false; if (current.current) setBusy(false); }
  }

  async function save() {
    if (operation.current || !draft || !ready || !draft.subject.trim()) return;
    operation.current = true; setBusy(true); setMessage('');
    try {
      const saved = await api<Draft>(`${endpoint}/${draft.id}`, { method: 'PUT', body: JSON.stringify({ subject: draft.subject, body: draft.body, expectedRevision: draft.revision }) });
      if (!current.current) return;
      setDraft(saved); setDirty(false);
      setDrafts((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
      setMessage('Rascunho salvo. Nenhum e-mail foi enviado.');
    } catch (error) {
      if (current.current) setMessage(`${error instanceof Error ? error.message : 'Não foi possível confirmar a gravação.'} Seu texto permanece no editor; copie-o antes de recarregar. Você pode tentar salvar novamente.`);
    } finally { operation.current = false; if (current.current) setBusy(false); }
  }

  function reset() {
    if (busy || (dirty && !window.confirm('Descartar as alterações que ainda não foram salvas?'))) return;
    try { setDraft(newDraft()); setDirty(false); setMessage(''); setTab('write'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar um rascunho seguro.'); }
  }

  const disabled = busy || !ready || !draft;
  return <main className={styles.page}>
    <header><p className={styles.eyebrow}>COMUNICAÇÃO</p><h1>Mensagens do evento</h1><p>Escreva e guarde seus rascunhos com o editor do Evolvia.</p></header>
    <p className={styles.notice}>Envio ainda indisponível. SMTP, destinatários e disparo em lote estão em preparação. Salvar um rascunho não envia e-mail.</p>
    <nav className={styles.actions} aria-label="Seções de comunicação">
      <button type="button" aria-pressed={tab === 'write'} onClick={() => setTab('write')}>Escrever</button>
      <button type="button" aria-pressed={tab === 'drafts'} onClick={() => setTab('drafts')}>Rascunhos ({drafts.length})</button>
    </nav>
    <EventCommunicationAudience eventId={eventId} />
    {message && <p role="status">{message}</p>}
    {dirty && <p role="status">Você tem alterações não salvas. Salve ou use “Novo rascunho” para descartá-las antes de abrir outra mensagem.</p>}
    {tab === 'write' ? <section className={styles.card} aria-label="Editor da mensagem">
      <label htmlFor="communication-subject">Assunto</label>
      <input id="communication-subject" maxLength={180} disabled={disabled} value={draft?.subject ?? ''} onChange={(event) => { setDraft((value) => value && { ...value, subject: event.target.value }); setDirty(true); }} />
      <PublicationRichTextField id="communication-body" label="Mensagem" help="Use a formatação do editor. Não cole HTML nem dados sensíveis desnecessários." value={draft?.body ?? ''} onChange={(body) => { setDraft((value) => value && { ...value, body }); setDirty(true); }} maxLength={20000} disabled={disabled} />
      <div className={styles.actions}>
        <button type="button" disabled={disabled || !draft?.subject.trim() || !dirty} onClick={() => void save()}>{busy ? 'Aguarde…' : 'Salvar rascunho'}</button>
        <button type="button" disabled={!ready || busy} onClick={reset}>Novo rascunho</button>
      </div>
      {draft && draft.revision > 0 && <p>Versão salva: {draft.revision}. Atualizada em {new Date(draft.updatedAt).toLocaleString('pt-BR')}.</p>}
    </section> : <section className={styles.card} aria-label="Rascunhos salvos">
      <h2>Rascunhos salvos</h2>
      {!drafts.length && <p>Nenhum rascunho salvo neste evento.</p>}
      <ul className={styles.list}>{drafts.map((row) => <li key={row.id}><strong>{row.subject}</strong><span>Versão {row.revision} · {new Date(row.updatedAt).toLocaleString('pt-BR')}</span><button type="button" disabled={busy || dirty} onClick={() => void open(row.id)}>Abrir <span className={styles.srOnly}>{row.subject}</span></button></li>)}</ul>
    </section>}
    <EvaScreenSupport guide="communication" />
  </main>;
}
