'use client';

import { FormEvent, useMemo, useState } from 'react';
import { api } from '../lib/api';
import styles from './publication-sections-editor.module.css';

export type PublicationSection = {
  id: string;
  kind: 'TEXT' | 'HIGHLIGHT' | 'CANONICAL_REFERENCE';
  title: string | null;
  enabled: boolean;
  sortOrder: number;
  content: Record<string, unknown>;
  canonicalSourceType: 'SCIENTIFIC_GUEST' | 'SCIENTIFIC_ACTIVITY' | null;
  canonicalSourceId: string | null;
  revision: number;
  updatedAt: string | null;
};

type EditableKind = 'TEXT' | 'HIGHLIGHT';

type Draft = {
  kind: EditableKind;
  title: string;
  text: string;
  enabled: boolean;
};

const EMPTY_DRAFT: Draft = {
  kind: 'TEXT',
  title: '',
  text: '',
  enabled: true,
};

function sectionText(section: PublicationSection): string {
  const value = section.content.text;
  return typeof value === 'string' ? value : '';
}

function validateDraft(draft: Draft): string {
  if (draft.title.trim().length > 160) return 'O título deve ter no máximo 160 caracteres.';
  if (!draft.text.trim()) return 'Informe o conteúdo da seção.';
  if (draft.text.length > 10000) return 'O conteúdo deve ter no máximo 10.000 caracteres.';
  return '';
}

export default function PublicationSectionsEditor({
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
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const ordered = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [sections],
  );

  const nextSortOrder = useMemo(
    () => ordered.reduce((highest, section) => Math.max(highest, section.sortOrder), -1) + 1,
    [ordered],
  );

  const editableSections = ordered.filter((section) => section.kind !== 'CANONICAL_REFERENCE');
  const canonicalSections = ordered.filter((section) => section.kind === 'CANONICAL_REFERENCE');

  const reloadAfter = async (message: string) => {
    await onReload();
    setSuccess(message);
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || busy) return;

    const validation = validateDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy('create');
    setError('');
    setSuccess('');
    try {
      await api(`/events/${eventId}/publication/sections`, {
        method: 'POST',
        body: JSON.stringify({
          kind: draft.kind,
          title: draft.title.trim() || null,
          enabled: draft.enabled,
          sortOrder: nextSortOrder,
          content: { text: draft.text.trim() },
        }),
      });
      setDraft(EMPTY_DRAFT);
      await reloadAfter('Seção adicionada. Nada foi publicado automaticamente.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar a seção.');
    } finally {
      setBusy('');
    }
  };

  const updateSection = async (
    section: PublicationSection,
    changes: Partial<{ title: string | null; text: string; enabled: boolean }>,
  ) => {
    if (!canEdit || busy) return;
    const nextText = changes.text ?? sectionText(section);
    if (!nextText.trim()) {
      setError('O conteúdo da seção não pode ficar vazio.');
      return;
    }

    setBusy(section.id);
    setError('');
    setSuccess('');
    try {
      await api(`/events/${eventId}/publication/sections/${section.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          revision: section.revision,
          ...(Object.prototype.hasOwnProperty.call(changes, 'title') ? { title: changes.title } : {}),
          ...(Object.prototype.hasOwnProperty.call(changes, 'enabled') ? { enabled: changes.enabled } : {}),
          ...(Object.prototype.hasOwnProperty.call(changes, 'text')
            ? { content: { ...section.content, text: nextText.trim() } }
            : {}),
        }),
      });
      await reloadAfter('Seção atualizada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a seção.');
    } finally {
      setBusy('');
    }
  };

  const removeSection = async (section: PublicationSection) => {
    if (!canEdit || busy) return;
    const confirmed = window.confirm(`Remover a seção${section.title ? ` “${section.title}”` : ''}? O histórico de auditoria será preservado.`);
    if (!confirmed) return;

    setBusy(section.id);
    setError('');
    setSuccess('');
    try {
      await api(`/events/${eventId}/publication/sections/${section.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ revision: section.revision }),
      });
      await reloadAfter('Seção removida.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover a seção.');
    } finally {
      setBusy('');
    }
  };

  const move = async (sectionId: string, direction: -1 | 1) => {
    if (!canEdit || busy) return;
    const index = ordered.findIndex((section) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    const reordered = [...ordered];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setBusy('order');
    setError('');
    setSuccess('');
    try {
      await api(`/events/${eventId}/publication/sections/order`, {
        method: 'PUT',
        body: JSON.stringify({
          sectionIds: reordered.map((section) => section.id),
          sectionRevisions: reordered.map((section) => section.revision),
        }),
      });
      await reloadAfter('Ordem das seções atualizada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível reordenar as seções.');
    } finally {
      setBusy('');
    }
  };

  return <section className={styles.wrapper} aria-labelledby="publication-sections-title">
    <div className={styles.heading}>
      <div>
        <p className={styles.eyebrow}>6 · SEÇÕES DA PÁGINA</p>
        <h2 id="publication-sections-title">Organize o conteúdo em blocos simples</h2>
        <p>Use texto ou destaque para conteúdo editorial. Pessoas e programação devem vir de fontes canônicas, sem copiar dados para campos livres.</p>
      </div>
      <span>{ordered.length}/50 seções</span>
    </div>

    {error && <div className={styles.alert} role="alert">{error}</div>}
    {success && <div className={styles.success} role="status" aria-live="polite">{success}</div>}

    {ordered.length === 0 ? <div className={styles.empty}>
      <strong>Nenhuma seção adicional ainda.</strong>
      <p>A descrição principal já pode ser suficiente para eventos simples. Adicione blocos somente quando ajudarem o público.</p>
    </div> : <div className={styles.list}>
      {editableSections.map((section) => <article className={styles.sectionCard} key={section.id}>
        <div className={styles.sectionHeader}>
          <div>
            <strong>{section.title || (section.kind === 'HIGHLIGHT' ? 'Destaque sem título' : 'Texto sem título')}</strong>
            <small>{section.kind === 'HIGHLIGHT' ? 'Destaque' : 'Texto'} · revisão {section.revision}</small>
          </div>
          <div className={styles.orderActions} aria-label={`Ordenar ${section.title || 'seção'}`}>
            <button type="button" onClick={() => void move(section.id, -1)} disabled={!canEdit || Boolean(busy) || ordered[0]?.id === section.id} aria-label="Mover seção para cima">↑</button>
            <button type="button" onClick={() => void move(section.id, 1)} disabled={!canEdit || Boolean(busy) || ordered[ordered.length - 1]?.id === section.id} aria-label="Mover seção para baixo">↓</button>
          </div>
        </div>

        <label className={styles.field}>
          <span>Título <em>opcional</em></span>
          <input
            defaultValue={section.title ?? ''}
            maxLength={160}
            disabled={!canEdit || Boolean(busy)}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== (section.title ?? '')) void updateSection(section, { title: value || null });
            }}
          />
        </label>

        <label className={styles.field}>
          <span>Conteúdo</span>
          <textarea
            defaultValue={sectionText(section)}
            maxLength={10000}
            rows={5}
            disabled={!canEdit || Boolean(busy)}
            onBlur={(event) => {
              const value = event.target.value;
              if (value.trim() !== sectionText(section).trim()) void updateSection(section, { text: value });
            }}
          />
        </label>

        <div className={styles.sectionFooter}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={section.enabled}
              disabled={!canEdit || Boolean(busy)}
              onChange={(event) => void updateSection(section, { enabled: event.target.checked })}
            />
            <span>Exibir esta seção quando a página for publicada</span>
          </label>
          <button className={styles.dangerButton} type="button" disabled={!canEdit || Boolean(busy)} onClick={() => void removeSection(section)}>Remover</button>
        </div>
      </article>)}

      {canonicalSections.length > 0 && <div className={styles.canonicalNotice}>
        <strong>{canonicalSections.length} seção(ões) vinculada(s) a dados canônicos</strong>
        <p>Essas referências serão editadas por um seletor específico de convidados/programação. Não exibimos IDs técnicos para edição manual.</p>
      </div>}
    </div>}

    <form className={styles.createForm} onSubmit={create} noValidate>
      <div className={styles.createHeading}>
        <div><strong>Adicionar seção editorial</strong><p>Para eventos simples, evite criar blocos sem necessidade.</p></div>
      </div>
      <div className={styles.twoColumns}>
        <label className={styles.field}>
          <span>Tipo</span>
          <select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as EditableKind }))} disabled={!canEdit || Boolean(busy)}>
            <option value="TEXT">Texto</option>
            <option value="HIGHLIGHT">Destaque</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Título <em>opcional</em></span>
          <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={160} disabled={!canEdit || Boolean(busy)} placeholder="Ex.: Sobre esta edição" />
        </label>
      </div>
      <label className={styles.field}>
        <span>Conteúdo</span>
        <textarea value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} maxLength={10000} rows={5} disabled={!canEdit || Boolean(busy)} placeholder="Escreva apenas o conteúdo desta seção, sem HTML." />
      </label>
      <div className={styles.createFooter}>
        <label className={styles.toggle}><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} disabled={!canEdit || Boolean(busy)} /><span>Deixar habilitada</span></label>
        <button className={styles.primaryButton} type="submit" disabled={!canEdit || Boolean(busy) || ordered.length >= 50}>{busy === 'create' ? 'Adicionando...' : 'Adicionar seção'}</button>
      </div>
    </form>
  </section>;
}
