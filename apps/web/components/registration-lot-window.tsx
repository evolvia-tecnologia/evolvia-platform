'use client';

import { useEffect, useState } from 'react';
import { formatEventDate } from '../lib/event-time-zone';
import styles from './registration-lot-window.module.css';

type Step = {
  categoryName: string;
  lotName: string;
  priceCents: number;
  remaining: number | null;
  startsAt: string;
  endsAt: string;
  state: 'OPEN' | 'UPCOMING';
};

type WindowPayload = {
  event: { timeZone?: string | null };
  mode?: 'CURRENT' | 'LADDER';
  closesAt?: string | null;
  schedule?: Step[];
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function price(cents: number): string {
  return money.format(cents / 100);
}

function seats(remaining: number | null): string {
  if (remaining === null) return 'Vagas em aberto';
  if (remaining === 1) return '1 vaga restante';
  return `${new Intl.NumberFormat('pt-BR').format(remaining)} vagas restantes`;
}

function when(value: string, timeZone: string | null | undefined): string {
  return formatEventDate(value, timeZone ?? null, { dateStyle: 'long', timeStyle: 'short' }) ?? value;
}

export default function RegistrationLotWindow({ slug }: { slug: string }) {
  const [payload, setPayload] = useState<WindowPayload | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/public/events/${encodeURIComponent(slug)}/registration`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<WindowPayload>;
      })
      .then((data) => { if (active) setPayload(data); })
      .catch(() => { if (active) setPayload(null); });
    return () => { active = false; };
  }, [slug]);

  const schedule = payload?.schedule ?? [];
  if (!payload || schedule.length === 0) return null;
  const timeZone = payload.event.timeZone;
  const ladder = payload.mode === 'LADDER';

  return <section className={styles.window} aria-labelledby="lot-window-title">
    <div className={styles.panel}>
      <p className={styles.eyebrow}>PRAZO DA INSCRIÇÃO</p>
      <h2 id="lot-window-title">{ladder ? 'Escada de preços' : 'Lote atual'}</h2>
      {payload.closesAt && <p>O primeiro lote em exibição encerra em {when(payload.closesAt, timeZone)}.</p>}
      {ladder
        ? <ol className={styles.stairs}>
          {schedule.map((step, index) => <li
            className={styles.step}
            key={`${step.categoryName}-${step.lotName}-${step.startsAt}`}
            style={{ ['--stair' as string]: Math.min(index, 4) }}
          >
            <strong>{step.categoryName} · {step.lotName}</strong>
            <span>{price(step.priceCents)} · {seats(step.remaining)}</span>
            <p>{step.state === 'UPCOMING' ? `Abre em ${when(step.startsAt, timeZone)}` : `Até ${when(step.endsAt, timeZone)}`}</p>
          </li>)}
        </ol>
        : <ul className={styles.stairs}>
          {schedule.map((step) => <li className={styles.current} key={`${step.categoryName}-${step.lotName}-${step.startsAt}`}>
            <strong>{step.categoryName} · {step.lotName}</strong>
            <span>{price(step.priceCents)} · {seats(step.remaining)}</span>
            <p>Até {when(step.endsAt, timeZone)}</p>
          </li>)}
        </ul>}
    </div>
  </section>;
}
