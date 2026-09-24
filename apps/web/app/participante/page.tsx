'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import PublicSiteHeader from '../../components/public-site-header';

type EventItem = { name: string; slug: string; startDate: string | null; venue: string | null };
type Result = { items: EventItem[] };

export default function ParticipantEntryPage() {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: '1', pageSize: '20' });
    if (applied) params.set('q', applied);
    fetch(`/api/public/events?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível buscar eventos.');
        const value = await response.json() as Result;
        if (!Array.isArray(value.items)) throw new Error('Resposta de eventos inválida.');
        setEvents(value.items);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError('Não foi possível carregar os eventos. Tente novamente.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(query.trim().slice(0, 100));
  }

  return <>
    <a className="skip-link" href="#participant-main">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="participante" />
    <main id="participant-main" className="container" tabIndex={-1} style={{ maxWidth: 800, paddingBlock: '3rem' }}>
      <p className="event-status">ÁREA DO PARTICIPANTE</p>
      <h1>Acesse sua inscrição</h1>
      <p>Encontre o evento em que você se inscreveu. Na página dele, entre com o protocolo de inscrição e o documento informado na ficha.</p>
      <form onSubmit={search}>
        <label htmlFor="participant-event-search">Nome do evento</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginBlock: '.75rem 1.5rem' }}>
          <input id="participant-event-search" value={query} maxLength={100}
            onChange={(event) => setQuery(event.target.value)} placeholder="Buscar evento"
            style={{ minHeight: 44, minWidth: 220, flex: 1, padding: '.6rem' }} />
          <button className="btn btn-primary" type="submit">Buscar</button>
        </div>
      </form>
      {loading && <p role="status">Buscando eventos publicados…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && <section aria-labelledby="participant-events-title">
        <h2 id="participant-events-title">{applied ? 'Resultados da busca' : 'Eventos publicados'}</h2>
        {events.length === 0 ? <p>Nenhum evento encontrado. Confira o nome ou procure na página de <Link href="/eventos">eventos</Link>.</p>
          : <ul style={{ listStyle: 'none', padding: 0 }}>
            {events.map((item) => <li key={item.slug} style={{ padding: '1rem', border: '1px solid #a5bec3', borderRadius: '.5rem', marginBottom: '.75rem' }}>
              <strong>{item.name}</strong>
              <div><Link href={`/evento/${encodeURIComponent(item.slug)}/participante`}>Entrar na área deste evento</Link></div>
            </li>)}
          </ul>}
      </section>}
      <p>Seu protocolo e documento serão solicitados somente na página segura do evento.</p>
    </main>
  </>;
}
