'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken } from '../../../../lib/api';

type EventItem = {
  id: string;
  name: string;
  organization?: { name: string };
  operatorPermissions: string[];
};

const labels: Record<string, string> = {
  CHECK_IN: 'Leitura e check-in',
  ACCREDITATION: 'Credenciamento assistido',
  REGISTRATION_CREATE: 'Nova inscrição',
  BADGE_PRINT: 'Impressão de etiqueta',
  KIOSK_OPERATE: 'Operação do autoatendimento',
  KIOSK_CONFIGURE: 'Configuração operacional do autoatendimento',
};

export default function OperacaoDoEventoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    api<EventItem[]>('/events')
      .then((events) => {
        const current = events.find((item) => item.id === id);
        if (current) setEvent(current);
        else setError('Evento não encontrado ou acesso não autorizado.');
      })
      .catch(() => setError('Não foi possível carregar sua área de operação.'))
      .finally(() => setLoading(false));
  }, [id, router]);

  return <main className="container dashboard-page">
    <Link href="/painel">← Voltar aos eventos</Link>
    <p className="eyebrow" style={{ marginTop: 32 }}>Área de operação</p>
    <h1>{event?.name ?? 'Posto do evento'}</h1>
    {event?.organization && <p className="muted">{event.organization.name}</p>}
    {loading && <p role="status">Carregando funções autorizadas…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {event && <section className="card" style={{ padding: 24, maxWidth: 700 }} aria-labelledby="operator-actions">
      <h2 id="operator-actions">Suas funções neste evento</h2>
      {event.operatorPermissions.length === 0 && <p className="muted">Nenhuma função operacional atribuída a esta conta.</p>}
      <ul style={{ display: 'grid', gap: 16, paddingLeft: 22 }}>
        {event.operatorPermissions.map((permission) => <li key={permission}>
          <strong>{labels[permission] ?? permission}</strong>{' '}
          {permission === 'CHECK_IN'
            ? <Link className="btn btn-primary" href={`/eventos/${encodeURIComponent(id)}/painel/check-in`}>Abrir leitor</Link>
            : <span className="muted">Disponível após ativação do respectivo fluxo.</span>}
        </li>)}
      </ul>
      <p className="field-help">O acesso é individual e pode ser revogado pelo organizador. Não compartilhe suas credenciais.</p>
    </section>}
  </main>;
}
