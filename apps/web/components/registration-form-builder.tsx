'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './registration-form-builder.module.css';

type FieldType = 'TEXT' | 'TEXTAREA' | 'EMAIL' | 'PHONE' | 'DATE' | 'NUMBER' | 'SELECT' | 'RADIO' | 'CHECKBOX';
type Field = {
  id: string; code: string; label: string; category: string; type: FieldType; required: boolean;
  locked?: boolean; sensitive?: boolean; help?: string; placeholder?: string;
  options?: Array<{ id: string; label: string }>;
};
type CatalogItem = Omit<Field, 'id' | 'required'> & { id?: string; required?: boolean };
type Payload = {
  event: { id: string; name: string; status: string };
  form: { revision: number; publishedVersion: number; fields: Field[] };
  catalog: CatalogItem[];
  publicRegistrationEnabled: false;
  message: string;
};

const typeLabels: Record<FieldType, string> = {
  TEXT: 'Texto curto', TEXTAREA: 'Texto longo', EMAIL: 'E-mail', PHONE: 'Telefone',
  DATE: 'Data', NUMBER: 'Número', SELECT: 'Lista', RADIO: 'Escolha única', CHECKBOX: 'Múltipla escolha',
};
const customTypes: FieldType[] = ['TEXT', 'TEXTAREA', 'DATE', 'NUMBER', 'SELECT', 'RADIO', 'CHECKBOX'];

function safeCode(label: string) {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'campo';
}

export default function RegistrationFormBuilder({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [custom, setCustom] = useState({ label: '', type: 'TEXT' as FieldType, options: '' });

  async function reload() {
    const result = await api<Payload>(`/events/${eventId}/registration-form`);
    setPayload(result); setFields(result.form.fields);
  }

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    reload().catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a ficha.')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, router]);

  const availableCatalog = useMemo(() => payload?.catalog.filter((item) => !fields.some((field) => field.code === item.code)) ?? [], [payload, fields]);
  const dirty = payload ? JSON.stringify(fields) !== JSON.stringify(payload.form.fields) : false;

  function addCatalog(item: CatalogItem) {
    setFields((current) => [...current, {
      id: `catalog-${item.code}`, code: item.code, label: item.label, category: item.category,
      type: item.type, required: false, sensitive: item.sensitive,
    }]);
  }

  function addCustom(event: FormEvent) {
    event.preventDefault();
    const label = custom.label.trim();
    if (!label) return;
    const base = safeCode(label);
    const code = fields.some((field) => field.code === base) ? `${base}_${fields.length + 1}` : base;
    const needsOptions = custom.type === 'SELECT' || custom.type === 'RADIO' || custom.type === 'CHECKBOX';
    const options = needsOptions
      ? custom.options.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 50).map((value, index) => ({ id: `${code}-option-${index + 1}`, label: value }))
      : undefined;
    if (needsOptions && !options?.length) { setError('Informe ao menos uma opção, separando as opções por vírgulas.'); return; }
    setFields((current) => [...current, { id: `custom-${Date.now()}-${current.length}`, code, label, category: 'Perguntas do evento', type: custom.type, required: false, options }]);
    setCustom({ label: '', type: 'TEXT', options: '' }); setError('');
  }

  function updateField(id: string, patch: Partial<Field>) {
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field));
  }
  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= fields.length) return;
    setFields((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  async function save() {
    if (!payload) return;
    setSaving('save'); setError(''); setNotice('');
    try {
      const result = await api<Payload>(`/events/${eventId}/registration-form`, { method: 'PUT', body: JSON.stringify({ expectedRevision: payload.form.revision, fields }) });
      setPayload(result); setFields(result.form.fields); setNotice('Rascunho da ficha salvo.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a ficha.'); }
    finally { setSaving(''); }
  }

  async function publish() {
    if (!payload || dirty || payload.form.revision < 1) return;
    setSaving('publish'); setError(''); setNotice('');
    try {
      const result = await api<Payload>(`/events/${eventId}/registration-form/publish`, { method: 'POST', body: JSON.stringify({ expectedRevision: payload.form.revision }) });
      setPayload(result); setFields(result.form.fields); setNotice(`Versão ${result.form.publishedVersion} da ficha preservada para testes.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível versionar a ficha.'); }
    finally { setSaving(''); }
  }

  if (loading) return <main className={styles.page}><div className={styles.loading}>A EVA está preparando o construtor da ficha...</div></main>;
  if (!payload) return <main className={styles.page}><div className={styles.error}>{error || 'Ficha indisponível.'}</div></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}><Link className={styles.brand} href="/painel">EVOLVIA</Link><Link href={`/eventos/${eventId}/painel`}>Voltar ao painel</Link></header>
    <section className={styles.workspace}>
      <div className={styles.hero}>
        <div><p className={styles.eyebrow}>FASE 2 · CONSTRUTOR DA FICHA DE INSCRIÇÃO</p><h1>{payload.event.name}</h1><p>Escolha somente os dados necessários, organize a ordem e confira como o participante verá a ficha.</p></div>
        <div className={styles.version}><span>Rascunho {payload.form.revision || 'novo'}</span><strong>Versão preservada: {payload.form.publishedVersion || 'nenhuma'}</strong></div>
      </div>
      <div className={styles.eva}><strong>EVA · Minimização de dados</strong><p>{payload.message}</p></div>
      {error && <div className={styles.error} role="alert">{error}</div>}{notice && <div className={styles.notice} role="status">{notice}</div>}

      <div className={styles.layout}>
        <section className={styles.builder} aria-labelledby="fields-title">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CAMPOS DA FICHA</p><h2 id="fields-title">{fields.length} campos selecionados</h2></div><button className={styles.primary} disabled={!dirty || Boolean(saving)} onClick={() => void save()}>{saving === 'save' ? 'Salvando…' : 'Salvar rascunho'}</button></div>
          <div className={styles.fields}>
            {fields.map((field, index) => <article className={styles.fieldCard} key={field.id}>
              <div className={styles.order}><button aria-label={`Mover ${field.label} para cima`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><span>{index + 1}</span><button aria-label={`Mover ${field.label} para baixo`} disabled={index === fields.length - 1} onClick={() => move(index, 1)}>↓</button></div>
              <div className={styles.fieldContent}>
                <div className={styles.fieldHeading}><div><strong>{field.label}</strong><span>{field.category} · {typeLabels[field.type]}{field.sensitive ? ' · dado sensível' : ''}</span></div>{field.locked && <span className={styles.locked}>Essencial</span>}</div>
                <label className={styles.check}><input type="checkbox" checked={field.required} disabled={field.locked && (field.code === 'full_name' || field.code === 'email')} onChange={(e) => updateField(field.id, { required: e.target.checked })} /> Obrigatório</label>
                <div className={styles.fieldSettings}><label>Texto de ajuda<input maxLength={240} value={field.help ?? ''} onChange={(e) => updateField(field.id, { help: e.target.value || undefined })} placeholder="Explique por que ou como preencher" /></label><label>Exemplo no campo<input maxLength={120} value={field.placeholder ?? ''} onChange={(e) => updateField(field.id, { placeholder: e.target.value || undefined })} placeholder="Ex.: Empresa S.A." /></label></div>
              </div>
              {!field.locked && <button className={styles.remove} onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}>Remover</button>}
            </article>)}
          </div>

          <section className={styles.addPanel}><h2>Adicionar campos do catálogo</h2><p>Os campos não são adicionados automaticamente: escolha apenas o que o evento realmente precisa.</p><div className={styles.catalog}>{availableCatalog.map((item) => <button key={item.code} onClick={() => addCatalog(item)}><strong>+ {item.label}</strong><span>{item.category}{item.sensitive ? ' · acesso restrito' : ''}</span></button>)}</div></section>
          <form className={styles.customForm} onSubmit={addCustom}><div><h2>Criar pergunta do evento</h2><p>Tipos controlados, sem scripts ou HTML.</p></div><label>Nome da pergunta<input required maxLength={100} value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} placeholder="Ex.: Qual tema deseja aprofundar?" /></label><label>Tipo<select value={custom.type} onChange={(e) => setCustom({ ...custom, type: e.target.value as FieldType })}>{customTypes.map((type) => <option value={type} key={type}>{typeLabels[type]}</option>)}</select></label>{['SELECT','RADIO','CHECKBOX'].includes(custom.type) && <label>Opções, separadas por vírgula<input value={custom.options} onChange={(e) => setCustom({ ...custom, options: e.target.value })} placeholder="Opção A, Opção B, Opção C" /></label>}<button className={styles.secondary}>Adicionar pergunta</button></form>
        </section>

        <aside className={styles.preview} aria-labelledby="preview-title"><p className={styles.eyebrow}>PRÉVIA</p><h2 id="preview-title">Ficha do participante</h2><p>Visualização estrutural; nenhuma inscrição será enviada aqui.</p><div className={styles.previewFields}>{fields.map((field) => <label key={field.id}><span>{field.label}{field.required && <b aria-label="obrigatório"> *</b>}</span>{field.type === 'TEXTAREA' ? <textarea disabled placeholder={field.placeholder} /> : field.type === 'SELECT' || field.type === 'RADIO' || field.type === 'CHECKBOX' ? <select disabled><option>{field.options?.[0]?.label ?? 'Selecione'}</option></select> : <input disabled type={field.type === 'EMAIL' ? 'email' : field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : 'text'} placeholder={field.placeholder} />}{field.help && <small>{field.help}</small>}</label>)}</div><button className={styles.publish} disabled={dirty || payload.form.revision < 1 || Boolean(saving)} onClick={() => void publish()}>{saving === 'publish' ? 'Preservando…' : 'Preservar versão para testes'}</button>{dirty && <small>Salve o rascunho antes de preservar uma versão.</small>}</aside>
      </div>
    </section>
  </main>;
}
