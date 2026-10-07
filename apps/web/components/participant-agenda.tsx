'use client';

import { useEffect, useState } from 'react';
import { agendaDateLabel, agendaHour, agendaRole } from '../lib/scientific-program-agenda';
import ScientificEvaHelp from './scientific-eva-help';
import styles from './participant-area.module.css';

type Slot = {
  id: string;
  title: string;
  activityType: string;
  startAt: string;
  endAt: string;
  spaceName: string | null;
};
type Speaking = Slot & { participationType: string; customRoleLabel: string | null };
type OpenSlot = Slot & { remaining: number; reason: string | null };
type Agenda = { timeZone: string | null; speaking: Speaking[]; enrolled: Slot[]; open: OpenSlot[] };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

function when(slot: Slot, timeZone: string | null) {
  return `${agendaDateLabel(slot.startAt, timeZone ?? 'UTC')} · ${agendaHour(slot.startAt, timeZone ?? 'UTC')}–${agendaHour(slot.endAt, timeZone ?? 'UTC')}`;
}

export default function ParticipantAgenda({ slug, token, embedded = false }: { slug: string; token: string; embedded?: boolean }) {
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const url = `/api/public/events/${encodeURIComponent(slug)}/participant/agenda`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        const payload = await readJson(response);
        if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível carregar a agenda.');
        if (!controller.signal.aborted) setAgenda(payload as unknown as Agenda);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a agenda.');
      });
    return () => controller.abort();
  }, [url, token]);

  async function change(activityId: string, method: 'POST' | 'DELETE') {
    if (busy) return;
    setBusy(activityId);
    setError('');
    try {
      const response = await fetch(`${url}/${encodeURIComponent(activityId)}`, {
        method,
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível atualizar a agenda.');
      setAgenda(payload as unknown as Agenda);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar a agenda.');
    } finally { setBusy(''); }
  }

  const zone = agenda?.timeZone ?? null;

  return <>
    <section className={styles.card} aria-labelledby="participant-agenda-title">
      <p className={styles.eyebrow}>MINHA AGENDA</p>
      <h2 id="participant-agenda-title">Atividades desta inscrição</h2>
      <p>A vaga fica na sua agenda. A entrada no dia continua no credenciamento e não é registrada aqui.</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!agenda && !error && <p role="status">Carregando agenda…</p>}
      {agenda && <>
        <h3>Onde você apresenta</h3>
        {agenda.speaking.length === 0 ? <p>Nenhuma atividade publicada está ligada ao e-mail desta inscrição.</p> : <ul className={styles.submissions}>
          {agenda.speaking.map((item) => <li key={item.id}>
            <strong>{item.title}</strong>
            <span>{agendaRole(item.participationType, item.customRoleLabel)} · {when(item, zone)}{item.spaceName ? ` · ${item.spaceName}` : ''}</span>
          </li>)}
        </ul>}
        <h3>Atividades escolhidas</h3>
        {agenda.enrolled.length === 0 ? <p>Você ainda não reservou vaga em uma atividade.</p> : <ul className={styles.submissions}>
          {agenda.enrolled.map((item) => <li key={item.id}>
            <strong>{item.title}</strong>
            <span>{when(item, zone)}{item.spaceName ? ` · ${item.spaceName}` : ''}</span>
            <button type="button" disabled={Boolean(busy)} onClick={() => void change(item.id, 'DELETE')}>{busy === item.id ? 'Saindo…' : 'Sair desta atividade'}</button>
          </li>)}
        </ul>}
        <h3>Atividades com vaga</h3>
        {agenda.open.length === 0 ? <p>Nenhuma atividade publicada tem vaga aberta além das que já estão na sua agenda.</p> : <ul className={styles.submissions}>
          {agenda.open.map((item) => <li key={item.id}>
            <strong>{item.title}</strong>
            <span>{when(item, zone)}{item.spaceName ? ` · ${item.spaceName}` : ''} · {item.remaining} {item.remaining === 1 ? 'vaga' : 'vagas'}</span>
            {item.reason ? <span>{item.reason}</span> : <button type="button" disabled={Boolean(busy)} onClick={() => void change(item.id, 'POST')}>{busy === item.id ? 'Reservando…' : 'Entrar na agenda'}</button>}
          </li>)}
        </ul>}
      </>}
    </section>
    {!embedded && <ScientificEvaHelp
      context="Agenda do participante"
      intro="Posso explicar a sua agenda neste evento. Não mostro a agenda, o documento ou a inscrição de outra pessoa."
      questions={[
        { question: 'O que aparece aqui?', answer: 'As atividades publicadas em que você apresenta, pelo e-mail desta inscrição, e as vagas que você mesmo reservou.' },
        { question: 'Entrar na agenda marca presença?', answer: 'Não. A vaga só reserva o lugar. A presença é registrada no credenciamento, em outro momento.' },
        { question: 'Por que uma atividade não tem vaga?', answer: 'A atividade precisa estar publicada em um espaço com capacidade. Horário cruzado com a sua agenda também bloqueia a reserva.' },
      ]}
    />}
  </>;
}
