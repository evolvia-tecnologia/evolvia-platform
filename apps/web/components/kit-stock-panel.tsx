'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import styles from './event-desk.module.css';

export type KitSizeStock = {
  id: string;
  label: string;
  forecast: number;
  delivered: number;
  available: number;
};

export type KitView = {
  name: string;
  shirtsEnabled: boolean;
  sizes: KitSizeStock[];
};

type DraftSize = { key: string; id?: string; label: string; stockQuantity: string };

function draftsFrom(kit: KitView): DraftSize[] {
  return kit.sizes.map((size) => ({
    key: size.id,
    id: size.id,
    label: size.label,
    stockQuantity: String(size.forecast),
  }));
}

export default function KitStockPanel({
  eventId,
  organizer,
  onChange,
  onError,
  onSaved,
}: {
  eventId: string;
  organizer: boolean;
  onChange: (kit: KitView) => void;
  onError: (message: string) => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [shirtsEnabled, setShirtsEnabled] = useState(false);
  const [sizes, setSizes] = useState<DraftSize[]>([]);
  const [stock, setStock] = useState<KitSizeStock[]>([]);
  const [busy, setBusy] = useState(false);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  onChangeRef.current = onChange;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    api<KitView>(`/events/${encodeURIComponent(eventId)}/desk/kit`)
      .then((kit) => {
        if (!active) return;
        setName(kit.name);
        setShirtsEnabled(kit.shirtsEnabled);
        setSizes(draftsFrom(kit));
        setStock(kit.sizes);
        onChangeRef.current(kit);
      })
      .catch((reason: unknown) => {
        if (active) onErrorRef.current(reason instanceof Error ? reason.message : 'Não foi possível abrir o kit.');
      });
    return () => { active = false; };
  }, [eventId]);

  function updateSize(key: string, patch: Partial<DraftSize>) {
    setSizes((current) => current.map((size) => size.key === key ? { ...size, ...patch } : size));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const kit = await api<KitView>(`/events/${encodeURIComponent(eventId)}/desk/kit`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          shirtsEnabled,
          sizes: sizes.map((size) => ({
            ...(size.id ? { id: size.id } : {}),
            label: size.label,
            stockQuantity: Number(size.stockQuantity),
          })),
        }),
      });
      setName(kit.name);
      setShirtsEnabled(kit.shirtsEnabled);
      setSizes(draftsFrom(kit));
      setStock(kit.sizes);
      onChange(kit);
      onSaved('Kit e estoque de camisas salvos. A preferência na ficha não reserva estoque.');
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível salvar o kit.');
    } finally {
      setBusy(false);
    }
  }

  return <form className={styles.kit} onSubmit={(event) => void save(event)} aria-labelledby="kit-title">
    <h3 id="kit-title">Kit e camisas</h3>
    <p>Configure o kit e o estoque por tamanho. A preferência do participante entra na ficha como lista e não reserva estoque.</p>
    {!organizer && <p>A organização configura o kit. A equipe vê o estoque e registra a entrega.</p>}
    <label>Nome do kit
      <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} disabled={!organizer || busy} />
    </label>
    <label className={styles.kitCheck}>
      <input type="checkbox" checked={shirtsEnabled} onChange={(event) => setShirtsEnabled(event.target.checked)} disabled={!organizer || busy} />
      Este evento entrega camisa por tamanho
    </label>
    {shirtsEnabled && <div className={styles.kitRows}>
      {sizes.map((size, index) => <div className={styles.kitRow} key={size.key}>
        <label>Tamanho {index + 1}
          <input value={size.label} onChange={(event) => updateSize(size.key, { label: event.target.value })} required maxLength={40} disabled={!organizer || busy} />
        </label>
        <label>Estoque previsto
          <input inputMode="numeric" value={size.stockQuantity} onChange={(event) => updateSize(size.key, { stockQuantity: event.target.value })} required disabled={!organizer || busy} />
        </label>
        {organizer && <button type="button" className={styles.secondaryAction} disabled={busy} onClick={() => setSizes((current) => current.filter((item) => item.key !== size.key))}>Remover</button>}
      </div>)}
      {organizer && <button type="button" className={styles.secondaryAction} disabled={busy || sizes.length >= 12} onClick={() => setSizes((current) => [...current, { key: `novo-${current.length}-${Date.now()}`, label: '', stockQuantity: '0' }])}>Adicionar tamanho</button>}
    </div>}
    <StockTable sizes={stock} />
    {organizer && <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar kit'}</button>}
  </form>;
}

export function StockTable({ sizes }: { sizes: KitSizeStock[] }) {
  if (sizes.length === 0) return <p>Nenhum tamanho de camisa configurado. A retirada de material continua genérica.</p>;
  return <table className={styles.kitTable}>
    <caption>Estoque de camisas por tamanho</caption>
    <thead>
      <tr><th scope="col">Tamanho</th><th scope="col">Previsto</th><th scope="col">Disponível</th><th scope="col">Entregue</th></tr>
    </thead>
    <tbody>
      {sizes.map((size) => <tr key={size.id}>
        <th scope="row">{size.label}</th>
        <td>{size.forecast}</td>
        <td>{size.available}</td>
        <td>{size.delivered}</td>
      </tr>)}
    </tbody>
  </table>;
}
