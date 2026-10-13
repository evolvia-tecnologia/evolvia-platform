'use client';

import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './event-people-sheet.module.css';

type PeopleList = {
  total: number;
  shown: number;
  truncated: boolean;
  columns: string[];
  people: Array<{ protocol: string; displayName: string; categoryName: string; confirmedAt: string | null }>;
};

export default function EventPeopleSheet({ eventId }: { eventId: string }) {
  const [data, setData] = useState<PeopleList | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) return undefined;
    let active = true;
    api<PeopleList>(`/events/${encodeURIComponent(eventId)}/people`)
      .then((result) => { if (active) setData(isPeopleList(result) ? result : null); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os inscritos.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function download() {
    if (busy || !eventId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const headers = new Headers();
      const token = getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/people/sheet`, { headers, cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inscritos.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(response.headers.get('X-Evolvia-Truncated') === '1'
        ? 'Planilha gerada com os primeiros 5.000 inscritos confirmados deste evento.'
        : 'Planilha gerada só com os inscritos confirmados deste evento.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível exportar a planilha.');
    } finally { setBusy(false); }
  }

  return <section className={styles.page} aria-labelledby="people-sheet-title">
    <p className={styles.eyebrow}>PESSOAS DO EVENTO</p>
    <h1 id="people-sheet-title">Inscritos confirmados</h1>
    <p>A lista mostra nome, categoria e protocolo. A planilha traz uma linha por inscrição confirmada e uma coluna por campo habilitado da ficha. Outro evento e o histórico do documento não entram. Foto não entra.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <p>{data ? `${data.total} inscrição(ões) confirmada(s).` : 'Carregando inscritos…'}</p>
    <button className={styles.primary} type="button" disabled={busy || !data} onClick={() => void download()}>
      {busy ? 'Gerando planilha…' : 'Exportar planilha'}
    </button>
    <div className={styles.scroll}>
      <table>
        <caption>Primeiros inscritos confirmados deste evento</caption>
        <thead><tr><th scope="col">Nome</th><th scope="col">Categoria</th><th scope="col">Protocolo</th><th scope="col">Confirmado em</th></tr></thead>
        <tbody>
          {data && data.people.length === 0 && <tr><td colSpan={4}>Nenhuma inscrição confirmada neste evento.</td></tr>}
          {data?.people.map((person) => <tr key={person.protocol}>
            <th scope="row">{person.displayName}</th>
            <td>{person.categoryName}</td>
            <td><code>{person.protocol}</code></td>
            <td>{person.confirmedAt ? new Date(person.confirmedAt).toLocaleString('pt-BR') : 'Não informada'}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {data && data.truncated && <p>A tela mostra {data.shown} de {data.total}. A planilha segue até 5.000 linhas.</p>}
    {data && <p>Colunas da planilha: {data.columns.join(', ')}.</p>}
  </section>;
}

function isPeopleList(value: PeopleList): value is PeopleList {
  return Boolean(value)
    && typeof value.total === 'number'
    && Array.isArray(value.people)
    && Array.isArray(value.columns)
    && !('registrationData' in value)
    && !('email' in value);
}

async function readError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') return 'Não foi possível exportar a planilha.';
  const record = payload as { message?: unknown; error?: { message?: unknown } };
  if (typeof record.error?.message === 'string' && record.error.message.trim()) return record.error.message;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  return 'Não foi possível exportar a planilha.';
}
