'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import { communicationDraftId } from '../lib/event-communication-draft';
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
  back?: string | null;
  revision: number;
  issuedCount: number;
  tags: string[];
};

type RoleSnapshot = {
  feeCents: 0;
  roles: RoleSetting[];
  recent: Array<{ role: string; displayName: string; subjectLabel: string; code: string; issuedAt: string }>;
};

type SavedRole = { saved: true; role: RoleId; revision: number; refreshRequired: true; feeCents: 0 };

type RolePackage = { id: string; role: RoleId; issuedCount: number; skippedCount: number; truncated: boolean; createdAt: string };

type Draft = {
  enabled: boolean;
  releaseMode: 'manual' | 'after_end';
  releaseDays: string;
  hours: string;
  title: string;
  body: string;
  back: string;
  revision: number;
};

const CODE = /^[a-f0-9]{32}$/u;

export default function EventRoleCertificates({ eventId }: { eventId: string }) {
  return <RoleCertificateForm key={eventId} eventId={eventId} />;
}

function RoleCertificateForm({ eventId }: { eventId: string }) {
  const commands = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const [packages, setPackages] = useState<RolePackage[]>([]);
  const [packagesRevision, setPackagesRevision] = useState(0);
  const [roles, setRoles] = useState<RoleSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [recent, setRecent] = useState<RoleSnapshot['recent']>([]);
  const [selected, setSelected] = useState<RoleId>('activity');
  const [focus, setFocus] = useState<'title' | 'body' | 'back'>('body');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);

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

  useEffect(() => {
    let active = true;
    setPackages([]);
    api<RolePackage[]>(`/events/${encodeURIComponent(eventId)}/certificate-roles/${selected}/batches`)
      .then(result => { if (active) setPackages(result); })
      .catch(() => { if (active) setError('Não foi possível carregar os pacotes. Os certificados emitidos continuam disponíveis pelo código.'); });
    return () => { active = false; };
  }, [eventId, selected, packagesRevision]);

  const current = roles.find((role) => role.role === selected);
  const draft = drafts[selected];

  function applySnapshot(snapshot: RoleSnapshot) {
    setRoles(snapshot.roles);
    setDrafts(Object.fromEntries(snapshot.roles.map((role) => [role.role, toDraft(role)])));
    setRecent(snapshot.recent);
    setRefreshRequired(false);
  }

  async function refreshSnapshot() {
    const snapshot = await api<RoleSnapshot>(`/events/${encodeURIComponent(eventId)}/certificate-roles`);
    if (!isSnapshot(snapshot)) throw new Error('O formato dos dados retornados pelo servidor é inválido.');
    applySnapshot(snapshot);
  }

  async function recover() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await refreshSnapshot();
    } catch {
      setError('Não foi possível atualizar a lista. A operação confirmada continua gravada. Tente atualizar novamente.');
    } finally {
      setBusy(false);
    }
  }

  function update(patch: Partial<Draft>) {
    setDrafts((currentDrafts) => ({ ...currentDrafts, [selected]: { ...currentDrafts[selected], ...patch } }));
  }

  function insertTag(tag: string) {
    const token = `{${tag}}`;
    setDrafts((currentDrafts) => {
      const value = currentDrafts[selected];
      if (!value) return currentDrafts;
      const field = focus;
      return { ...currentDrafts, [selected]: { ...value, [field]: `${value[field]}${token}` } };
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || refreshRequired) return;
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
      const result = await api<RoleSnapshot | SavedRole>(`/events/${encodeURIComponent(eventId)}/certificate-roles/${selected}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: draft.enabled,
          releaseMode: draft.releaseMode,
          releaseDays: days,
          hours: parsedHours,
          title: draft.title,
          body: draft.body,
          back: draft.back,
          expectedRevision: draft.revision,
        }),
      });
      if (!isSnapshot(result)) {
        if (result?.saved === true && result.refreshRequired === true && result.role === selected) {
          setRefreshRequired(true);
          setNotice('Papel salvo. Atualize a lista antes de editar ou emitir novamente.');
          return;
        }
        throw new Error('Não foi possível salvar este papel.');
      }
      applySnapshot(result);
      setNotice('Papel salvo. Ele continua sem taxa e sem envio de e-mail.');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar este papel.');
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (busy || refreshRequired || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const commandKey = `${eventId}/${selected}`;
    try {
      const batchId = commands.current.get(commandKey) ?? communicationDraftId();
      commands.current.set(commandKey, batchId);
      const result = await api<{ batchId: string; created: number; alreadyIssued: number; pending: number; skipped: number; truncated: boolean; feeCents: 0 }>(
        `/events/${encodeURIComponent(eventId)}/certificate-roles/${selected}/issue`,
        { method: 'POST', body: JSON.stringify({ batchId }) },
      );
      if (result.batchId !== batchId || result.feeCents !== 0) throw new Error('O resultado do lote não pôde ser confirmado. Repita o mesmo pedido.');
      commands.current.delete(commandKey);
      setPackagesRevision(value => value + 1);
      const more = result.pending > 0 || result.truncated ? ' Ainda há elegíveis. Emita de novo.' : '';
      const ignored = result.skipped > 0 ? ` ${result.skipped} não entraram porque o nome ou o título não pode ir para o certificado.` : '';
      setNotice(`Emitidos agora: ${result.created}. Já existiam: ${result.alreadyIssued}.${more}${ignored}`);
      setRefreshRequired(true);
      try {
        await refreshSnapshot();
      } catch {
        setError('A emissão foi confirmada, mas não foi possível atualizar a lista. Use Atualizar lista; os certificados não serão emitidos novamente.');
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível emitir este papel.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function downloadPackage(batchId: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const headers = new Headers();
      const token = getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/certificate-roles/${selected}/batches/${encodeURIComponent(batchId)}/pdf`, { headers, cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 422) throw new Error('Há caracteres que o PDF ainda não desenha. Consulte os certificados pelo código.');
        if (response.status === 409) throw new Error('O pacote não tem um retrato completo da emissão. Consulte os certificados pelo código.');
        throw new Error('Não foi possível baixar o pacote. Os certificados continuam disponíveis pelo código.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = 'pacote-certificados.pdf';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Pacote baixado com os dados originais da emissão.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível baixar o pacote.');
    } finally { setBusy(false); }
  }

  return <section className={styles.panel} aria-labelledby="role-certificate-settings">
    <p className={styles.eyebrow}>Papéis</p>
    <h2 id="role-certificate-settings">Atividade, trabalho e papéis científicos</h2>
    <p>Cada papel começa desligado. A emissão usa presença na atividade, trabalho aceito, convite confirmado ou parecer enviado. O download não é cobrado e não há envio de e-mail.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {refreshRequired && <button className={styles.secondary} type="button" onClick={() => void recover()} disabled={busy}>Atualizar lista</button>}
    <fieldset className={styles.form} disabled={busy || refreshRequired}>
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
      <fieldset className={styles.form} disabled={busy || refreshRequired}>
      <legend>Configuração de {current.label.toLowerCase()}</legend>
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
        help="Negrito, alinhamento, fonte, tamanho e cor da paleta. Se ficar vazio, a Evolvia usa o título padrão deste papel."
        value={draft.title}
        onChange={(value) => update({ title: value })}
        onFocus={() => setFocus('title')}
        maxLength={240}
        rows={3}
        disabled={busy || refreshRequired}
        required
      />
      <PublicationRichTextField
        id={`role-certificate-body-${selected}`}
        label="Texto do certificado"
        help="Negrito, alinhamento, fonte, tamanho e cor da paleta. Se ficar vazio, a Evolvia usa o texto padrão deste papel."
        value={draft.body}
        onChange={(value) => update({ body: value })}
        onFocus={() => setFocus('body')}
        maxLength={4000}
        rows={6}
        disabled={busy || refreshRequired}
        required
      />
      <PublicationRichTextField
        id={`role-certificate-back-${selected}`}
        label="Verso do certificado (opcional)"
        help="Use as tags deste papel e a formatação do editor. O verso e a carga horária ficam preservados quando o certificado é emitido. Deixe vazio para não incluir verso."
        value={draft.back}
        onChange={(value) => update({ back: value })}
        onFocus={() => setFocus('back')}
        maxLength={4000}
        rows={6}
        disabled={busy || refreshRequired}
      />
      <button className={styles.primary} type="submit" disabled={busy || refreshRequired}>{busy ? 'Aguarde…' : 'Salvar papel'}</button>
      <button className={styles.secondary} type="button" onClick={() => void issue()} disabled={busy || refreshRequired || !current.enabled}>Emitir elegíveis</button>
      </fieldset>
    </form>}
    {packages.length > 0 && <section aria-labelledby="role-certificate-packages">
      <h3 id="role-certificate-packages">Pacotes deste papel</h3>
      <p>Últimos 20 lotes, com até 40 certificados por pacote. Repetir um pedido sem resposta recupera o mesmo lote. Para emitir mais elegíveis, confirme o resultado antes de iniciar outro lote.</p>
      <ul>{packages.map(item => <li key={item.id}>
        {new Date(item.createdAt).toLocaleString('pt-BR')} — {item.issuedCount} certificados
        {item.issuedCount > 0 && <button className={styles.secondary} type="button" disabled={busy} aria-label={`Baixar pacote de ${current?.label ?? selected}, emitido em ${new Date(item.createdAt).toLocaleString('pt-BR')} — ${item.issuedCount} certificados`} onClick={() => void downloadPackage(item.id)}>Baixar pacote em PDF</button>}
      </li>)}</ul>
    </section>}
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
    back: role.back ?? '',
    revision: role.revision,
  };
}

function isSnapshot(value: unknown): value is RoleSnapshot {
  if (!value || typeof value !== 'object') return false;
  const record = value as { feeCents?: unknown; roles?: unknown };
  return record.feeCents === 0 && Array.isArray(record.roles);
}



