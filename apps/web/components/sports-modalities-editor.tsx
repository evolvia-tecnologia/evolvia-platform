'use client';

import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { PublicationSection } from './publication-sections-editor';
import {
  chooseModalitySection,
  missingSportsSections,
  modalityDraftErrors,
  modalitySectionContent,
  sportsModalityId,
  sportsSectionDraft,
  sportsStarterModalities,
  type SportsModality,
} from '../lib/sports-public-profile';
import styles from './sports-modalities-editor.module.css';

type Kind = SportsModality['kind'];
type Row = { key: string; id: string; name: string; distance: string; kind: Kind; capacity: string };

const KIND_OPTIONS: Array<{ value: Kind; label: string }> = [
  { value: 'RUN', label: 'Corrida' },
  { value: 'WALK', label: 'Caminhada' },
  { value: 'TRAIL', label: 'Trilha' },
];

function rowKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blankRow(): Row {
  return { key: rowKey(), id: '', name: '', distance: '', kind: 'RUN', capacity: '' };
}

function rowsFrom(modalities: SportsModality[]): Row[] {
  return modalities.map((modality) => ({
    key: modality.id,
    id: modality.id,
    name: modality.name,
    distance: String(modality.distanceKm).replace('.', ','),
    kind: modality.kind,
    capacity: modality.capacity ? String(modality.capacity) : '',
  }));
}

function savedModalities(section: PublicationSection | null): SportsModality[] {
  const content = section?.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return [];
  const modalities = (content as { modalities?: unknown }).modalities;
  return modalityDraftErrors(modalities).length === 0 && Array.isArray(modalities) ? modalities as SportsModality[] : [];
}

function distanceOf(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function toModalities(rows: Row[]): { modalities: SportsModality[]; errors: string[] } {
  const used = new Set<string>();
  const modalities: SportsModality[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const distanceKm = distanceOf(row.distance);
    const capacityText = row.capacity.trim();
    const capacity = capacityText === '' ? null : Number(capacityText);
    if (distanceKm === null) errors.push(`Modalidade ${index + 1}: distância inválida.`);
    if (capacityText !== '' && !Number.isSafeInteger(capacity)) errors.push(`Modalidade ${index + 1}: capacidade inválida.`);
    const id = row.id || sportsModalityId(row.name, used);
    used.add(id);
    modalities.push({
      id,
      name: row.name.trim(),
      distanceKm: distanceKm ?? 0,
      kind: row.kind,
      ...(capacityText === '' ? {} : { capacity: capacity ?? undefined }),
    });
  });
  return { modalities, errors: [...errors, ...modalityDraftErrors(modalities)] };
}

export default function SportsModalitiesEditor({
  eventId,
  sections,
  canEdit,
  onReload,
}: {
  eventId: string;
  sections: PublicationSection[];
  canEdit: boolean;
  onReload: () => Promise<void>;
}) {
  const host = useMemo(() => chooseModalitySection(sections), [sections]);
  const initial = savedModalities(host);
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const rawModalities = host?.content && typeof host.content === 'object' && !Array.isArray(host.content)
    ? (host.content as { modalities?: unknown }).modalities
    : undefined;
  const savedInvalid = Array.isArray(rawModalities) && rawModalities.length > 0 && modalityDraftErrors(rawModalities).length > 0;

  function update(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
    setStatus('');
  }

  async function createMissingSections() {
    if (!canEdit || busy) return;
    const missing = missingSportsSections(sections);
    if (missing.length === 0) {
      setStatus('As seções da corrida já existem. Ative cada uma na lista de seções quando o texto estiver pronto.');
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      let sortOrder = sections.reduce((highest, section) => Math.max(highest, section.sortOrder), -1) + 1;
      for (const item of missing) {
        await api(`/events/${eventId}/publication/sections`, {
          method: 'POST',
          body: JSON.stringify(sportsSectionDraft(item, sortOrder)),
        });
        sortOrder += 1;
      }
      await onReload();
      setStatus('Seções da corrida criadas ocultas. Nada foi publicado. O estoque da camiseta continua no kit do posto.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar as seções da corrida.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!canEdit || busy) return;
    const { modalities, errors } = toModalities(rows);
    if (errors.length > 0) {
      setError(errors[0]);
      setStatus('');
      return;
    }
    if (!host && modalities.length === 0) {
      setStatus('Nenhuma modalidade para salvar.');
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const content = modalitySectionContent(host?.content, modalities);
      if (!host) {
        const sortOrder = sections.reduce((highest, section) => Math.max(highest, section.sortOrder), -1) + 1;
        if (typeof content.text !== 'string' || !content.text.trim()) content.text = 'Modalidades desta corrida.';
        await api(`/events/${eventId}/publication/sections`, {
          method: 'POST',
          body: JSON.stringify({ kind: 'TEXT', title: 'Modalidades', enabled: true, sortOrder, content }),
        });
      } else {
        await api(`/events/${eventId}/publication/sections/${host.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ revision: host.revision, content }),
        });
      }
      await onReload();
      setStatus(modalities.length === 0
        ? 'Modalidades removidas da seção. A página pública deixa de listá-las. Nada foi publicado automaticamente.'
        : 'Modalidades salvas na seção. A página pública mostra a lista depois da publicação. Nenhum estoque foi reservado.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar as modalidades.');
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.editor} aria-labelledby="sports-modalities-editor-title">
    <p className={styles.hint}>EVOLVIA SPORTS</p>
    <h2 id="sports-modalities-editor-title">Modalidades da corrida</h2>
    <p>Estas modalidades ficam na seção já usada pela página pública. Salvar aqui não publica o evento, não abre inscrição e não reserva vaga.</p>
    {savedInvalid && <p className={styles.error} role="alert">As modalidades salvas não passaram na validação. Revise a lista antes de salvar de novo.</p>}
    {rows.length === 0 && <p>Nenhuma modalidade nesta lista. A página pública não inventa distância nem vaga.</p>}
    <ul className={styles.rows}>
      {rows.map((row, index) => <li className={styles.row} key={row.key}>
        <label>Nome da modalidade {index + 1}
          <input value={row.name} maxLength={120} disabled={!canEdit || busy} onChange={(event) => update(row.key, { name: event.target.value })} />
        </label>
        <label>Distância (km)
          <input inputMode="decimal" value={row.distance} disabled={!canEdit || busy} onChange={(event) => update(row.key, { distance: event.target.value })} />
        </label>
        <label>Tipo
          <select value={row.kind} disabled={!canEdit || busy} onChange={(event) => update(row.key, { kind: event.target.value as Kind })}>
            {KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Público informado (opcional)
          <input inputMode="numeric" value={row.capacity} disabled={!canEdit || busy} onChange={(event) => update(row.key, { capacity: event.target.value })} />
        </label>
        <button type="button" disabled={!canEdit || busy} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>Remover</button>
      </li>)}
    </ul>
    <div className={styles.actions}>
      <button type="button" className={styles.secondary} disabled={!canEdit || busy} onClick={() => setRows((current) => [...current, blankRow()])}>Adicionar modalidade</button>
      <button type="button" className={styles.secondary} disabled={!canEdit || busy || rows.length > 0} onClick={() => setRows(rowsFrom(sportsStarterModalities()))}>Usar exemplos de 4 km e 8 km</button>
      <button type="button" disabled={!canEdit || busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar modalidades'}</button>
      <button type="button" className={styles.secondary} disabled={!canEdit || busy || missingSportsSections(sections).length === 0} onClick={() => void createMissingSections()}>Criar seções ocultas que faltam</button>
      <a href={`/eventos/${encodeURIComponent(eventId)}/painel/check-in#kit`}>Abrir tamanhos e estoque no posto</a>
    </div>
    <p className={styles.hint}>Percurso, regulamento, premiação, perguntas e patrocinadores são seções de texto. Kits e retirada explicam a corrida; o saldo e a baixa continuam no posto.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {status && <p className={styles.status} role="status">{status}</p>}
  </section>;
}
