'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken } from '../../../../../lib/api';

type EventItem = { id: string; name: string; organizationId: string };
type Member = { userId: string; role: string; status: string; user: { name: string; email: string } };
type Assignment = { userId: string; permissions: string[]; active: boolean; expiresAt: string | null };
const available = [
  { code: 'CHECK_IN', label: 'Leitura e check-in' },
  { code: 'ACCREDITATION', label: 'Consulta operacional de inscrições' },
];

export default function EquipeOperacionalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    api<EventItem[]>('/events').then(async (events) => {
      const current = events.find((item) => item.id === id);
      if (!current?.organizationId) throw new Error('Evento não encontrado.');
      const [staff, grants] = await Promise.all([
        api<Member[]>(`/organizations/${encodeURIComponent(current.organizationId)}/members`),
        api<Assignment[]>(`/events/${encodeURIComponent(id)}/operator-assignments`),
      ]);
      setEvent(current);
      setMembers(staff.filter((item) => item.role === 'OPERATOR' && item.status === 'ACTIVE'));
      setAssignments(grants);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a equipe.'));
  }, [id, router]);

  function choose(userId: string) {
    setSelected(userId);
    setPermissions(assignments.find((item) => item.userId === userId && item.active)?.permissions ?? []);
    setMessage('');
  }

  async function save() {
    if (!selected || permissions.length === 0) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const updated = await api<Assignment>(`/events/${encodeURIComponent(id)}/operator-assignments/${encodeURIComponent(selected)}`, {
        method: 'PUT', body: JSON.stringify({ permissions }),
      });
      setAssignments((current) => [...current.filter((item) => item.userId !== selected), updated]);
      setMessage('Funções atribuídas. O acesso passa a valer imediatamente.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  async function revoke() {
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/events/${encodeURIComponent(id)}/operator-assignments/${encodeURIComponent(selected)}`, { method: 'DELETE' });
      setAssignments((current) => current.map((item) => item.userId === selected ? { ...item, active: false } : item));
      setPermissions([]);
      setMessage('Acesso revogado imediatamente.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível revogar.');
    } finally { setBusy(false); }
  }

  return <main className="container dashboard-page" style={{ maxWidth: 880 }}>
    <Link href={`/eventos/${encodeURIComponent(id)}/painel`}>← Voltar ao painel do evento</Link>
    <p className="eyebrow" style={{ marginTop: 32 }}>Equipe do evento</p>
    <h1>Permissões de operação</h1>
    <p className="muted">Cada operador usa sua própria conta. Atribua funções somente para este evento; nenhuma função é concedida automaticamente pelo papel na organização.</p>
    {event && <h2>{event.name}</h2>}
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="success">{message}</p>}
    {event && <section className="card" style={{ padding: 24 }}>
      <div className="form-group">
        <label htmlFor="operator-user">Operador da organização</label>
        <select className="select" id="operator-user" value={selected} onChange={(e) => choose(e.target.value)}>
          <option value="">Selecione uma conta</option>
          {members.map((member) => <option key={member.userId} value={member.userId}>{member.user.name} — {member.user.email}</option>)}
        </select>
        <p className="field-help">O operador precisa ter uma conta e ser adicionado à organização antes de receber funções.</p>
      </div>
      {selected && <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 }}>
        <legend>Funções autorizadas</legend>
        {available.map((item) => <label key={item.code} style={{ display: 'flex', gap: 10, minHeight: 44, alignItems: 'center' }}>
          <input type="checkbox" checked={permissions.includes(item.code)} onChange={(e) => setPermissions((current) =>
            e.target.checked ? [...current, item.code] : current.filter((code) => code !== item.code))} />{item.label}
        </label>)}
      </fieldset>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
        <button className="btn btn-primary" type="button" disabled={!selected || !permissions.length || busy} onClick={() => { void save(); }}>Salvar funções</button>
        <button className="btn btn-secondary" type="button" disabled={!selected || busy || !assignments.some((item) => item.userId === selected && item.active)} onClick={() => { void revoke(); }}>Revogar acesso</button>
      </div>
      <p className="field-help" style={{ marginTop: 16 }}>Nova inscrição, impressão e autoatendimento terão permissões próprias quando seus fluxos estiverem ativos.</p>
    </section>}
  </main>;
}
