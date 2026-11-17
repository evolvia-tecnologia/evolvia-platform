'use client';

import { FormEvent, useRef, useState } from 'react';
import InternationalPhoneInput from './international-phone-input';
import { phoneError, publishedChoiceError } from '../lib/registration-input';
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

/**
 * O resultado é estado próprio, não uma palavra procurada no texto.
 *
 * Antes, o êxito era reconhecido buscando a palavra "segurança" no texto da
 * mensagem, porque a frase de sucesso termina assim. Qualquer recusa do
 * servidor que contivesse essa palavra — "bloqueado por política de
 * segurança", por exemplo — era pintada de verde em papel de status, e quem
 * corrigiu os dados ia embora acreditando que salvou.
 *
 * O teste de contrato deste arquivo lê o texto-fonte e não distingue código de
 * comentário. Por isso este comentário descreve o defeito sem reproduzir a
 * expressão antiga: a proibição precisa valer para o arquivo todo.
 */
type Aviso = { texto: string; ok: boolean };

async function payload<T>(response: Response): Promise<T & { message?: string }> {
  const raw = await response.text();
  try { return JSON.parse(raw) as T & { message?: string }; }
  catch { throw new Error('Não foi possível interpretar a resposta do servidor.'); }
}

export default function ParticipantRegistrationEditor({ slug, token }: { slug: string; token: string }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [values, setValues] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);

  async function load() {
    setBusy(true); setAviso(null);
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/registration`, {
        cache: 'no-store', headers: { authorization: `Bearer ${token}` },
      });
      const data = await payload<Editor>(response);
      if (!response.ok) throw new Error(data.message ?? 'Não foi possível carregar os dados editáveis.');
      setEditor(data);
      submission.current = null;
      setValues(Object.fromEntries(data.fields.map((field) => [field.code, field.value ?? (field.type === 'CHECKBOX' ? [] : field.type === 'CONSENT' ? false : '')])));
    } catch (error) { setAviso({ texto: error instanceof Error ? error.message : 'Não foi possível carregar os dados editáveis.', ok: false }); }
    finally { setBusy(false); }
  }

  function update(field: Field, value: Answer) {
    setValues((current) => ({ ...current, [field.code]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    for (const field of editor.fields.filter((item) => item.type === 'PHONE')) {
      const value = String(values[field.code] ?? '');
      const problem = value || field.required ? phoneError(value) : null;
      if (problem) { setAviso({ texto: `${field.label}: ${problem}`, ok: false }); return; }
    }
    const choiceError = publishedChoiceError(editor.fields, values);
    if (choiceError) { setAviso({ texto: choiceError, ok: false }); return; }
    setBusy(true); setAviso(null);
    try {
      const fingerprint = JSON.stringify({ expectedRevision: editor.revision, updates: values });
      if (submission.current?.fingerprint !== fingerprint) {
        const nonce = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        submission.current = { fingerprint, key: `participant-edit:${nonce}` };
      }
      const idempotencyKey = submission.current.key;
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/registration`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: editor.revision, updates: values }),
      });
      const data = await payload<Editor>(response);
      if (!response.ok) throw new Error(data.message ?? 'Não foi possível salvar as correções.');
      setEditor(data);
      submission.current = null;
      setValues(Object.fromEntries(data.fields.map((field) => [field.code, field.value ?? (field.type === 'CHECKBOX' ? [] : field.type === 'CONSENT' ? false : '')])));
      setAviso({ texto: 'Dados da inscrição atualizados com segurança.', ok: true });
    } catch (error) { setAviso({ texto: error instanceof Error ? error.message : 'Não foi possível salvar as correções.', ok: false }); }
    finally { setBusy(false); }
  }

  if (!editor) return <section className={styles.editSection} aria-labelledby="registration-edit-title">
    <h2 id="registration-edit-title">Corrigir dados da inscrição</h2>
    <p>Nome, telefone e respostas da ficha podem ser corrigidos. CPF/documento, e-mail, categoria, lote, pagamento e dados fiscais permanecem protegidos.</p>
    {/* Neste ramo o aviso vem apenas de falha ao carregar, nunca de êxito:
        por isso o papel aqui é fixo, e não derivado. */}
    {aviso && <p role="alert" className={styles.error}>{aviso.texto}</p>}
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
          {field.code === 'shirt_size' && <small>A preferência não reserva estoque.</small>}
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
        if (field.type === 'PHONE') return <InternationalPhoneInput key={field.code} label={field.label} value={String(value ?? '')} required={field.required} disabled={busy} onChange={(next) => update(field, next)} />;
        return <label key={field.code}>{field.label}
          <input
            type={field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : 'text'}
            required={field.required}
            maxLength={field.type === 'NUMBER' ? undefined : 240}
            value={typeof value === 'string' || typeof value === 'number' ? value : ''}
            onChange={(event) => update(field, event.target.value)}
          />
        </label>;
      })}
      {aviso && <p role={aviso.ok ? 'status' : 'alert'} className={aviso.ok ? styles.success : styles.error}>{aviso.texto}</p>}
      <div className={styles.actions}>
        <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar correções'}</button>
        <button type="button" onClick={() => { setEditor(null); submission.current = null; setAviso(null); }} disabled={busy}>Cancelar</button>
      </div>
    </form>
  </section>;
}
