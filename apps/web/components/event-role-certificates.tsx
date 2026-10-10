'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import PublicationRichTextField from './publication-rich-text-field';
import styles from './event-certificate.module.css';

const ROLES = ['activity', 'approved_submission', 'presentation', 'guest', 'reviewer'] as const;
type RoleId = (typeof ROLES)[number];

type RoleSetting = {
  role: RoleId;
  label: string;
  enabled: boolean;
  releaseMode: 'manual' | 'after_end';
  releaseDays: number;
  hours: number | null;
  title: string;
  body: string;
  revision: number;
  issuedCount: number;
  tags: string[];
};

type RoleSnapshot = {
  feeCents: 0;
  roles: RoleSetting[];
  recent: Array<{ role: string; displayName: string; subjectLabel: string; code: string; issuedAt: string }>;
};

type Draft = {
  enabled: boolean;
  releaseMode: 'manual' | 'after_end';
  releaseDays: string;
  hours: string;
  title: string;
  body: string;
  revision: number;
};

const CODE = /^[a-f0-9]{32}$/u;

export default function EventRoleCertificates({ eventId }: { eventId: string }) {
  const [roles, setRoles] = useState<RoleSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [recent, setRecent] = useState<RoleSnapshot['recent']>([]);
  const [selected, setSelected] = useState<RoleId>('activity');
  const [focus, setFocus] = useState<'title' | 'body'>('body');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<RoleSnapshot>(`/events/${encodeURIComponent(eventId)}/certificate-roles`)
      .then((result) => {
        if (!active) return;
        if (!isSnapshot(result)) {
          setError('O formato dos dados retornados pelo servidor é inválido.');
          return;
        }
        setRoles(result.roles);
        setDrafts(Object.fromEntries(result.roles.map((role) => [role.role, toDraft(role)])));
        setRecent(result.recent);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os papéis do certificado.');
      });
    return () => { active = false; };
  }, [eventId]);

  const current = roles.find((role) => role.role === selected);
  const draft = drafts[selected];

  function update(patch: Partial<Draft>) {
    setDrafts((currentDrafts) => ({ ...currentDrafts, [selected]: { ...currentDrafts[selected], ...patch } }));
  }

  function insertTag(tag: string) {
    const token = `{${tag}}`;
    setDrafts((currentDrafts) => {
      const value = currentDrafts[selected];
      if (!value) return currentDrafts;
      const field = focus === 'title' ? 'title' : 'body';
      return { ...currentDrafts, [selected]: { ...value, [field]: `${value[field]}${token}` } };
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const hours = draft.hours.trim();
    const days = Number(draft.releaseDays);
    const parsedHours = hours === '' ? null : Number(hours);
    if (!Number.isInteger(days) || days < 0 || days > 30 || (parsedHours !== null && (!Number.isInteger(parsedHours) || parsedHours < 1 || parsedHours > 999))) {
      setError('Use números inteiros: dias de 0 a 30 e carga horária de 1 a 999, ou deixe a carga em branco.');
      setBusy(false);
      return;
    }
    try {
      const result = await api<RoleSnapshot>(`/events/${encodeURIComponent(eventId)}/certificate-roles/${selected}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: draft.enabled,
          releaseMode: draft.releaseMode,
          releaseDays: days,
          hours: parsedHours,
          title: draft.title,
          body: draft.body,
          expectedRevision: draft.revision,
        }),
      });
      if (!isSnapshot(result)) throw new Error('Não foi possível salvar este papel.');
      setRoles(result.roles);
      setDrafts(Object.fromEntries(result.roles.map((role) => [role.role, toDraft(role)])));
      setRecent(result.recent);
      setNotice('Papel salvo. Ele continua sem taxa e sem envio de e-mail.');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar este papel.');
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ created: number; alreadyIssued: number; pending: number; skipped: number; truncated: boolean; feeCents: 0 }>(
        `/events/${encodeURIComponent(eventId)}/certificate-roles/${selected}/issue`,
        { method: 'POST' },
      );
      const snapshot = await api<RoleSnapshot>(`/events/${encodeURIComponent(eventId)}/certificate-roles`);
      if (isSnapshot(snapshot)) {
        setRoles(snapshot.roles);
        setDrafts(Object.fromEntries(snapshot.roles.map((role) => [role.role, toDraft(role)])));
        setRecent(snapshot.recent);
      }
      const more = result.pending > 0 || result.truncated ? ' Ainda há elegíveis. Emita de novo.' : '';
      const ignored = result.skipped > 0 ? ` ${result.skipped} não entraram porque o nome ou o título não pode ir para o certificado.` : '';
      setNotice(`Emitidos agora: ${result.created}. Já existiam: ${result.alreadyIssued}.${more}${ignored}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível emitir este papel.');
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.panel} aria-labelledby="role-certificate-settings">
    <p className={styles.eyebrow}>Papéis</p>
    <h2 id="role-certificate-settings">Atividade, trabalho e papéis científicos</h2>
    <p>Cada papel começa desligado. A emissão usa presença na atividade, trabalho aceito, convite confirmado ou parecer enviado. O download não é cobrado e não há envio de e-mail.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset className={styles.form}>
      <legend>Papel do certificado</legend>
      {ROLES.map((role) => {
        const item = roles.find((entry) => entry.role === role);
        return <label key={role} className={styles.choice}>
          <input type="radio" name="certificate-role" checked={selected === role} onChange={() => setSelected(role)} />
          {item ? `${item.label} — ${item.enabled ? 'liberado' : 'desligado'} — ${item.issuedCount} emitidos` : role}
        </label>;
      })}
    </fieldset>
    {current && draft && <form className={styles.form} onSubmit={(event) => void save(event)}>
      <label className={styles.choice}>
        <input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
        Liberar {current.label.toLowerCase()}
      </label>
      <label className={styles.hours}>Quando emitir
        <select value={draft.releaseMode} onChange={(event) => update({ releaseMode: event.target.value === 'after_end' ? 'after_end' : 'manual' })}>
          <option value="manual">Manual, quando a organização emitir</option>
          <option value="after_end">Depois do fim do evento</option>
        </select>
      </label>
      <label className={styles.hours}>Dias depois do fim
        <input type="number" inputMode="numeric" min={0} max={30} step={1} value={draft.releaseDays} onChange={(event) => update({ releaseDays: event.target.value })} aria-describedby="role-release-days-help" />
      </label>
      <p id="role-release-days-help">Vale só na liberação depois do fim. Use um inteiro de 0 a 30.</p>
      <label className={styles.hours}>Carga horária
        <input type="number" inputMode="numeric" min={1} max={999} step={1} value={draft.hours} onChange={(event) => update({ hours: event.target.value })} aria-describedby="role-hours-help" />
      </label>
      <p id="role-hours-help">Opcional. Use um inteiro de 1 a 999, ou deixe em branco.</p>
      <div className={styles.tags} role="group" aria-label="Tags deste papel">
        {current.tags.map((tag) => <button key={tag} type="button" onClick={() => insertTag(tag)}>{`{${tag}}`}</button>)}
      </div>
      <PublicationRichTextField
        id={`role-certificate-title-${selected}`}
        label="Título do certificado"
        help="Se ficar vazio, a Evolvia usa o título padrão deste papel."
        value={draft.title}
        onChange={(value) => update({ title: value })}
        onFocus={() => setFocus('title')}
        maxLength={240}
        rows={3}
        disabled={busy}
        required
      />
      <PublicationRichTextField
        id={`role-certificate-body-${selected}`}
        label="Texto do certificado"
        help="Se ficar vazio, a Evolvia usa o texto padrão deste papel."
        value={draft.body}
        onChange={(value) => update({ body: value })}
        onFocus={() => setFocus('body')}
        maxLength={4000}
        rows={6}
        disabled={busy}
        required
      />
      <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar papel'}</button>
      <button className={styles.secondary} type="button" onClick={() => void issue()} disabled={busy || !current.enabled}>Emitir elegíveis</button>
    </form>}
    {recent.length > 0 && <div>
      <h3>Emitidos recentemente</h3>
      <ul>
        {recent.map((item) => <li key={item.code}>
          {item.displayName} — {item.subjectLabel}
          {CODE.test(item.code) && <> — <a href={`/certificado/${item.code}`}>Abrir certificado</a></>}
        </li>)}
      </ul>
    </div>}
  </section>;
}

function toDraft(role: RoleSetting): Draft {
  return {
    enabled: role.enabled,
    releaseMode: role.releaseMode,
    releaseDays: String(role.releaseDays),
    hours: role.hours == null ? '' : String(role.hours),
    title: role.title,
    body: role.body,
    revision: role.revision,
  };
}

function isSnapshot(value: unknown): value is RoleSnapshot {
  if (!value || typeof value !== 'object') return false;
  const record = value as { feeCents?: unknown; roles?: unknown };
  return record.feeCents === 0 && Array.isArray(record.roles);
}
