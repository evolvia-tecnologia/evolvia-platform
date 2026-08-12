'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { PublicationSection } from './publication-sections-editor';
import styles from './publication-sections-editor.module.css';

type CanonicalSourceType = 'SCIENTIFIC_GUEST' | 'SCIENTIFIC_ACTIVITY';

type ScientificGuest = {
  id: string;
  displayName: string | null;
  roleLabel: string;
  invitationStatus: string;
  person: {
    id: string;
    name: string;
    institution: string | null;
  };
};

type ScientificGuestsPayload = {
  guests: ScientificGuest[];
};

type ScientificActivity = {
  id: string;
  title: string;
  activityType: string;
  startAt: string;
  endAt: string;
  status: string;
  space: { name: string } | null;
};

type ScientificProgramPayload = {
  activities: ScientificActivity[];
};

type Option = {
  sourceType: CanonicalSourceType;
  sourceId: string;
  label: string;
  detail: string;
};

function formatActivityDetail(activity: ScientificActivity): string {
  const start = new Date(activity.startAt);
  const parts = [activity.activityType];
  if (!Number.isNaN(start.getTime())) {
    parts.push(start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  }
  if (activity.space?.name) parts.push(activity.space.name);
  return parts.join(' · ');
}

export default function PublicationCanonicalReferencePicker({
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
  const [options, setOptions] = useState<Option[]>([]);
  const [sourceKey, setSourceKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const linked = useMemo(
    () => new Set(
      sections
        .filter((section) => section.kind === 'CANONICAL_REFERENCE' && section.canonicalSourceType && section.canonicalSourceId)
        .map((section) => `${section.canonicalSourceType}:${section.canonicalSourceId}`),
    ),
    [sections],
  );

  const available = useMemo(
    () => options.filter((option) => !linked.has(`${option.sourceType}:${option.sourceId}`)),
    [linked, options],
  );

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [guestsPayload, programPayload] = await Promise.all([
          api<ScientificGuestsPayload>(`/scientific-events/${eventId}/guests`),
          api<ScientificProgramPayload>(`/scientific-events/${eventId}/program`),
        ]);

        if (cancelled) return;
        const guestOptions: Option[] = guestsPayload.guests.map((guest) => ({
          sourceType: 'SCIENTIFIC_GUEST',
          sourceId: guest.id,
          label: guest.displayName || guest.person.name,
          detail: [guest.roleLabel, guest.person.institution].filter(Boolean).join(' · '),
        }));
        const activityOptions: Option[] = programPayload.activities.map((activity) => ({
          sourceType: 'SCIENTIFIC_ACTIVITY',
          sourceId: activity.id,
          label: activity.title,
          detail: formatActivityDetail(activity),
        }));
        setOptions([...guestOptions, ...activityOptions]);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar convidados e programação.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [canEdit, eventId]);

  const add = async () => {
    if (!canEdit || saving || !sourceKey) return;
    const selected = available.find((option) => `${option.sourceType}:${option.sourceId}` === sourceKey);
    if (!selected) {
      setError('Selecione um conteúdo válido do próprio evento.');
      return;
    }

    const nextSortOrder = sections.reduce((highest, section) => Math.max(highest, section.sortOrder), -1) + 1;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api(`/events/${eventId}/publication/sections`, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'CANONICAL_REFERENCE',
          title: null,
          enabled: true,
          sortOrder: nextSortOrder,
          content: {},
          canonicalSourceType: selected.sourceType,
          canonicalSourceId: selected.sourceId,
        }),
      });
      setSourceKey('');
      await onReload();
      setSuccess('Conteúdo vinculado à página sem duplicar os dados da fonte original.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível vincular o conteúdo.');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) return null;

  return <div className={styles.createForm} aria-labelledby="canonical-reference-title">
    <div className={styles.createHeading}>
      <div>
        <strong id="canonical-reference-title">Adicionar conteúdo já existente no evento</strong>
        <p>Vincule convidados ou atividades da programação sem copiar nomes, horários ou outros dados para campos paralelos.</p>
      </div>
    </div>

    {error && <div className={styles.alert} role="alert">{error}</div>}
    {success && <div className={styles.success} role="status" aria-live="polite">{success}</div>}

    <div className={styles.twoColumns}>
      <label className={styles.field}>
        <span>Conteúdo do evento</span>
        <select
          value={sourceKey}
          onChange={(event) => setSourceKey(event.target.value)}
          disabled={loading || saving || available.length === 0}
        >
          <option value="">{loading ? 'Carregando...' : 'Selecione um convidado ou atividade'}</option>
          {available.filter((item) => item.sourceType === 'SCIENTIFIC_GUEST').length > 0 && <optgroup label="Palestrantes e convidados">
            {available.filter((item) => item.sourceType === 'SCIENTIFIC_GUEST').map((item) => <option key={`${item.sourceType}:${item.sourceId}`} value={`${item.sourceType}:${item.sourceId}`}>{item.label}{item.detail ? ` — ${item.detail}` : ''}</option>)}
          </optgroup>}
          {available.filter((item) => item.sourceType === 'SCIENTIFIC_ACTIVITY').length > 0 && <optgroup label="Programação científica">
            {available.filter((item) => item.sourceType === 'SCIENTIFIC_ACTIVITY').map((item) => <option key={`${item.sourceType}:${item.sourceId}`} value={`${item.sourceType}:${item.sourceId}`}>{item.label}{item.detail ? ` — ${item.detail}` : ''}</option>)}
          </optgroup>}
        </select>
      </label>
      <div className={styles.field}>
        <span>Ação</span>
        <button className={styles.primaryButton} type="button" disabled={!sourceKey || loading || saving || sections.length >= 50} onClick={() => void add()}>
          {saving ? 'Vinculando...' : 'Adicionar à página'}
        </button>
      </div>
    </div>

    {!loading && available.length === 0 && <div className={styles.empty}>
      <strong>Nenhum novo conteúdo disponível.</strong>
      <p>Crie ou confirme convidados e atividades nas áreas canônicas do evento; conteúdos já vinculados não aparecem novamente aqui.</p>
    </div>}
  </div>;
}
