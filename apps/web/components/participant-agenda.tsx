'use client';

import Link from 'next/link';
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
type Agenda = {
  timeZone: string | null;
  confirmationRequired?: boolean;
  speaking: Speaking[];
  enrolled: Slot[];
  requested?: Slot[];
  open: OpenSlot[];
};

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
      <p>{agenda?.confirmationRequired
        ? 'Indicar preferência ainda não reserva a vaga. A organização confirma o horário. A entrada no dia continua no credenciamento.'
        : 'A vaga fica na sua agenda. A entrada no dia continua no credenciamento e não é registrada aqui.'}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!agenda && !error && <p role="status">Carregando agenda…</p>}
      {/* A resposta devolve a agenda inteira, então uma mudança por vez. O aviso
          existe para a espera não parecer que os outros botões quebraram. */}
      {busy && <p role="status" className={styles.session}>Atualizando sua agenda. Os outros botões voltam quando esta mudança terminar.</p>}
      {agenda && <>
        <section aria-labelledby="participant-agenda-speaking">
          <h3 id="participant-agenda-speaking">Onde você apresenta</h3>
          {agenda.speaking.length === 0 ? <p>Nenhuma atividade publicada está ligada ao e-mail desta inscrição.</p> : <ul className={styles.agendaList}>
            {agenda.speaking.map((item) => <li key={item.id} className={styles.agendaItem}>
              <strong>{item.title}</strong>
              <span>{agendaRole(item.participationType, item.customRoleLabel)} · {when(item, zone)}{item.spaceName ? ` · ${item.spaceName}` : ''}</span>
            </li>)}
          </ul>}
        </section>
        <section aria-labelledby="participant-agenda-enrolled">
          <h3 id="participant-agenda-enrolled">Atividades escolhidas</h3>
          {agenda.enrolled.length === 0 ? <p>Você ainda não reservou vaga em uma atividade.</p> : <ul className={styles.agendaList}>
            {agenda.enrolled.map((item) => <li key={item.id} className={styles.agendaItem}>
              <strong>{item.title}</strong>
              <span>{when(item, zone)}{item.spaceName ? ` · ${item.spaceName}` : ''}</span>
              <button type="button" disabled={Boolean(busy)} onClick={() => void change(item.id, 'DELETE')}>{busy === item.id ? 'Saindo…' : 'Sair desta atividade'}</button>
            </li>)}
          </ul>}
        </section>
        {(agenda.confirmationRequired || (agenda.requested ?? []).length > 0) && <section aria-labelledby="participant-agenda-requested">
          <h3 id="participant-agenda-requested">Aguardando confirmação</h3>
          {(agenda.requested ?? []).length === 0 ? <p>Nenhuma preferência está aguardando a organização.</p> : <ul className={styles.agendaList}>
            {(agenda.requested ?? []).map((item) => <li key={item.id} className={styles.agendaItem}>
              <strong>{item.title}</strong>
              <span>{when(item, zone)}{item.spaceName ? ` · ${item.spaceName}` : ''}</span>
              <button type="button" disabled={Boolean(busy)} onClick={() => void change(item.id, 'DELETE')}>{busy === item.id ? 'Retirando…' : 'Retirar preferência'}</button>
            </li>)}
          </ul>}
        </section>}
        <section aria-labelledby="participant-agenda-open">
          <h3 id="participant-agenda-open">Atividades com vaga</h3>
          {agenda.open.length === 0 ? <p>Nenhuma atividade publicada tem vaga aberta além das que já estão na sua agenda.</p> : <ul className={styles.agendaList}>
            {agenda.open.map((item) => <li key={item.id} className={styles.agendaItem}>
              <strong>{item.title}</strong>
              <span>{when(item, zone)}{item.spaceName ? ` · ${item.spaceName}` : ''} · {item.remaining} {item.remaining === 1 ? 'vaga' : 'vagas'}</span>
              {item.reason ? <span className={styles.agendaReason}>{item.reason}</span> : <button type="button" disabled={Boolean(busy)} onClick={() => void change(item.id, 'POST')}>{busy === item.id ? (agenda.confirmationRequired ? 'Enviando…' : 'Reservando…') : (agenda.confirmationRequired ? 'Indicar preferência' : 'Entrar na agenda')}</button>}
            </li>)}
          </ul>}
          {/* A fila tem tela e sessão próprias: a área nunca apontava para ela,
              e quem via "sem vaga" não tinha como entrar na espera. */}
          <p>Atividade sem vaga não aparece aqui para reserva. Para entrar na espera, abra a <Link href={`/evento/${encodeURIComponent(slug)}/participante/fila`}>fila da atividade</Link>. Ela pede o código da inscrição outra vez, porque é outra tela de acesso.</p>
        </section>
      </>}
    </section>
    {!embedded && <ScientificEvaHelp
      context="Agenda do participante"
      intro="Posso explicar a sua agenda neste evento. Não mostro a agenda, o documento ou a inscrição de outra pessoa."
      questions={[
        { question: 'O que aparece aqui?', answer: 'As atividades publicadas em que você apresenta, pelo e-mail desta inscrição, e as vagas que você mesmo reservou.' },
        { question: 'Entrar na agenda marca presença?', answer: 'Não. Sem confirmação da organização, a vaga entra na agenda. Com essa opção ligada, a preferência espera a confirmação e a presença continua no credenciamento.' },
        { question: 'Por que uma atividade não tem vaga?', answer: 'A atividade precisa estar publicada em um espaço com capacidade. Horário cruzado com a sua agenda também bloqueia a reserva. Se o evento limitou a quantidade, a reserva para quando você atinge esse número.' },
      ]}
    />}
  </>;
}
