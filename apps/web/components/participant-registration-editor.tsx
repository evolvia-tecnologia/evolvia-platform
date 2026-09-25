'use client';

import { FormEvent, useState } from 'react';
import styles from './participant-area.module.css';

type Answer = string | number | boolean | string[];
type Field = {
  code: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'PHONE' | 'DATE' | 'NUMBER' | 'SELECT' | 'RADIO' | 'CHECKBOX' | 'CONSENT';
  required: boolean;
  options: Array<{ id: string; label: string }>;
  value: Answer | null;
};
type Editor = { revision: number; editableUntil: string | null; fields: Field[]; locked: string[] };

async function payload<T>(response: Response): Promise<T & { message?: string }> {
  const raw = await response.text();
  try { return JSON.parse(raw) as T & { message?: string }; }
  catch { throw new Error('Não foi possível interpretar a resposta do servidor.'); }
}

export default function ParticipantRegistrationEditor({ slug, token }: { slug: string; token: string }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [values, setValues] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/registration`, {
        cache: 'no-store', headers: { authorization: `Bearer ${token}` },
      });
      const data = await payload<Editor>(response);
      if (!response.ok) throw new Error(data.message ?? 'Não foi possível carregar os dados editáveis.');
      setEditor(data);
      setValues(Object.fromEntries(data.fields.map((field) => [field.code, field.value ?? (field.type === 'CHECKBOX' ? [] : field.type === 'CONSENT' ? false : '')])));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os dados editáveis.'); }
    finally { setBusy(false); }
  }

  function update(field: Field, value: Answer) {
    setValues((current) => ({ ...current, [field.code]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/registration`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': `participant-edit:${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
        },
        body: JSON.stringify({ expectedRevision: editor.revision, updates: values }),
      });
      const data = await payload<Editor>(response);
      if (!response.ok) throw new Error(data.message ?? 'Não foi possível salvar as correções.');
      setEditor(data);
      setValues(Object.fromEntries(data.fields.map((field) => [field.code, field.value ?? (field.type === 'CHECKBOX' ? [] : field.type === 'CONSENT' ? false : '')])));
      setMessage('Dados da inscrição atualizados com segurança.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar as correções.'); }
    finally { setBusy(false); }
  }

  if (!editor) return <section className={styles.editSection} aria-labelledby="registration-edit-title">
    <h2 id="registration-edit-title">Corrigir dados da inscrição</h2>
    <p>Nome, telefone e respostas da ficha podem ser corrigidos. CPF/documento, e-mail, categoria, lote, pagamento e dados fiscais permanecem protegidos.</p>
    {message && <p role="alert" className={styles.error}>{message}</p>}
    <button type="button" onClick={load} disabled={busy}>{busy ? 'Carregando…' : 'Revisar meus dados'}</button>
  </section>;

  return <section className={styles.editSection} aria-labelledby="registration-edit-title">
    <h2 id="registration-edit-title">Corrigir dados da inscrição</h2>
    {editor.editableUntil && <p>Correções disponíveis até {new Date(editor.editableUntil).toLocaleString('pt-BR')}.</p>}
    <form className={styles.form} onSubmit={save}>
      {editor.fields.map((field) => {
        const value = values[field.code];
        if (field.type === 'CONSENT') return <label key={field.code} className={styles.checkLabel}>
          <input type="checkbox" checked={value === true} onChange={(event) => update(field, event.target.checked)} />
          {field.label}
        </label>;
        if (field.type === 'SELECT' || field.type === 'RADIO') return <label key={field.code}>{field.label}
          <select required={field.required} value={typeof value === 'string' ? value : ''} onChange={(event) => update(field, event.target.value)}>
            <option value="">Selecione</option>
            {field.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>;
        if (field.type === 'CHECKBOX') return <fieldset key={field.code} className={styles.fieldset}>
          <legend>{field.label}</legend>
          {field.options.map((option) => <label key={option.id} className={styles.checkLabel}>
            <input type="checkbox" checked={Array.isArray(value) && value.includes(option.id)} onChange={(event) => {
              const current = Array.isArray(value) ? value : [];
              update(field, event.target.checked ? [...new Set([...current, option.id])] : current.filter((item) => item !== option.id));
            }} />{option.label}
          </label>)}
        </fieldset>;
        if (field.type === 'TEXTAREA') return <label key={field.code}>{field.label}
          <textarea rows={4} required={field.required} maxLength={2000} value={typeof value === 'string' ? value : ''} onChange={(event) => update(field, event.target.value)} />
        </label>;
        return <label key={field.code}>{field.label}
          <input
            type={field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : 'text'}
            inputMode={field.type === 'PHONE' ? 'tel' : undefined}
            required={field.required}
            maxLength={field.type === 'NUMBER' ? undefined : 240}
            value={typeof value === 'string' || typeof value === 'number' ? value : ''}
            onChange={(event) => update(field, field.type === 'NUMBER' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)}
          />
        </label>;
      })}
      {message && <p role={message.includes('segurança') ? 'status' : 'alert'} className={message.includes('segurança') ? styles.success : styles.error}>{message}</p>}
      <div className={styles.actions}>
        <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar correções'}</button>
        <button type="button" onClick={() => { setEditor(null); setMessage(''); }} disabled={busy}>Cancelar</button>
      </div>
    </form>
  </section>;
}
