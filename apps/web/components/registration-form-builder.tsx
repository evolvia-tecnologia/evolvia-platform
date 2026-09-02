'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './registration-form-builder.module.css';

type FieldType = 'TEXT' | 'TEXTAREA' | 'EMAIL' | 'PHONE' | 'DOCUMENT' | 'CNPJ' | 'DATE' | 'NUMBER' | 'SELECT' | 'RADIO' | 'CHECKBOX' | 'PHOTO' | 'CONSENT' | 'REGISTRATION_TYPE';
type FieldOption = { id: string; label: string };
type Field = {
  id: string; code: string; label: string; category: string; type: FieldType; required: boolean; enabled?: boolean;
  locked?: boolean; sensitive?: boolean; help?: string; placeholder?: string;
  options?: FieldOption[];
};
type CatalogItem = Omit<Field, 'id' | 'required'> & { id?: string; required?: boolean };
type OptionConstraints = { minCount: number; maxCount: number; labelMinLength: number; labelMaxLength: number };
type Payload = {
  event: { id: string; name: string; status: string };
  form: { revision: number; publishedVersion: number; fields: Field[] };
  catalog: CatalogItem[];
  systemFields: string[];
  choiceFieldTypes: Array<'SELECT' | 'RADIO' | 'CHECKBOX'>;
  optionConstraints: OptionConstraints;
  publicRegistrationEnabled: false;
  message: string;
};

const typeLabels: Record<FieldType, string> = {
  TEXT: 'Texto curto', TEXTAREA: 'Texto longo', EMAIL: 'E-mail', PHONE: 'Telefone', DOCUMENT: 'CPF ou documento estrangeiro', CNPJ: 'CNPJ numérico ou alfanumérico',
  DATE: 'Data', NUMBER: 'Número', SELECT: 'Lista', RADIO: 'Escolha única', CHECKBOX: 'Múltipla escolha', PHOTO: 'Foto', CONSENT: 'Consentimento', REGISTRATION_TYPE: 'Tipo de inscrição',
};
const customTypes: FieldType[] = ['TEXT', 'TEXTAREA', 'DATE', 'NUMBER', 'SELECT', 'RADIO', 'CHECKBOX'];

function safeCode(label: string) {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'campo';
}

function createOpaqueOptionId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `opt_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeOptionLabel(value: string) {
  return value.trim().replace(/\s+/gu, ' ');
}

function isChoiceField(type: FieldType, choiceFieldTypes: readonly string[]) {
  return choiceFieldTypes.includes(type);
}

function nextOptionLabel(options: FieldOption[]) {
  const used = new Set(options.map((option) => normalizeOptionLabel(option.label).toLocaleLowerCase('pt-BR')));
  if (!used.has('nova opção')) return 'Nova opção';
  for (let index = 2; index < 1000; index += 1) {
    const label = `Nova opção ${index}`;
    if (!used.has(label.toLocaleLowerCase('pt-BR'))) return label;
  }
  return 'Nova opção';
}

function PreviewControl({ field }: { field: Field }) {
  if (field.type === 'TEXTAREA') return <textarea disabled placeholder={field.placeholder} />;
  if (field.type === 'CONSENT') return <input disabled type="checkbox" />;
  if (field.type === 'PHOTO') return <input disabled type="file" accept="image/*" />;
  if (field.type === 'SELECT' || field.type === 'REGISTRATION_TYPE') {
    return <select disabled>
      <option>{field.type === 'REGISTRATION_TYPE' ? 'Selecione uma categoria' : 'Selecione'}</option>
      {field.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>;
  }
  if (field.type === 'RADIO') {
    return <div className={styles.previewChoice} role="radiogroup" aria-label={field.label}>
      {(field.options ?? []).map((option) => <label key={option.id} className={styles.previewChoiceItem}>
        <input disabled type="radio" name={field.id} value={option.id} />
        <span>{option.label}</span>
      </label>)}
    </div>;
  }
  if (field.type === 'CHECKBOX') {
    return <div className={styles.previewChoice} role="group" aria-label={field.label}>
      {(field.options ?? []).map((option) => <label key={option.id} className={styles.previewChoiceItem}>
        <input disabled type="checkbox" value={option.id} />
        <span>{option.label}</span>
      </label>)}
    </div>;
  }
  return <input disabled type={field.type === 'EMAIL' ? 'email' : field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : 'text'} inputMode={field.type === 'CNPJ' ? 'text' : undefined} autoCapitalize={field.type === 'CNPJ' ? 'characters' : undefined} maxLength={field.type === 'CNPJ' ? 18 : undefined} placeholder={field.placeholder} />;
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
  const [focusOptionId, setFocusOptionId] = useState('');

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
  const choiceFieldTypes = payload?.choiceFieldTypes ?? [];
  const optionConstraints = payload?.optionConstraints;

  function addCatalog(item: CatalogItem) {
    setFields((current) => [...current, {
      id: `catalog-${item.code}`, code: item.code, label: item.label, category: item.category,
      type: item.type, required: false, enabled: true, sensitive: item.sensitive, help: item.help, placeholder: item.placeholder, options: item.options,
    }]);
  }

  function addCustom(event: FormEvent) {
    event.preventDefault();
    if (!optionConstraints) return;
    const label = custom.label.trim();
    if (!label) return;
    const base = safeCode(label);
    const code = fields.some((field) => field.code === base) ? `${base}_${fields.length + 1}` : base;
    const needsOptions = isChoiceField(custom.type, choiceFieldTypes);
    const labels = custom.options.split(',').map(normalizeOptionLabel).filter(Boolean);
    const unique = new Set(labels.map((value) => value.toLocaleLowerCase('pt-BR')));
    if (needsOptions && labels.length < optionConstraints.minCount) { setError(`Informe ao menos ${optionConstraints.minCount} opção, separando as opções por vírgulas.`); return; }
    if (needsOptions && labels.length > optionConstraints.maxCount) { setError(`Informe no máximo ${optionConstraints.maxCount} opções.`); return; }
    if (needsOptions && unique.size !== labels.length) { setError('Cada opção deve possuir um rótulo único.'); return; }
    const options = needsOptions ? labels.map((value) => ({ id: createOpaqueOptionId(), label: value })) : undefined;
    setFields((current) => [...current, { id: `custom-${Date.now()}-${current.length}`, code, label, category: 'Perguntas do evento', type: custom.type, required: false, enabled: true, options }]);
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

  function replaceOptions(fieldId: string, options: FieldOption[]) {
    setFields((current) => current.map((item) => item.id === fieldId ? { ...item, options } : item));
  }

  function addOption(fieldId: string) {
    if (!optionConstraints) return;
    const field = fields.find((item) => item.id === fieldId);
    const options = field?.options ?? [];
    if (options.length >= optionConstraints.maxCount) {
      setError(`Este campo admite no máximo ${optionConstraints.maxCount} opções.`);
      return;
    }
    const option = { id: createOpaqueOptionId(), label: nextOptionLabel(options) };
    setFocusOptionId(option.id);
    setError('');
    replaceOptions(fieldId, [...options, option]);
  }

  function renameOption(fieldId: string, optionId: string, label: string) {
    const options = fields.find((item) => item.id === fieldId)?.options ?? [];
    replaceOptions(fieldId, options.map((option) => option.id === optionId ? { ...option, label } : option));
  }

  function moveOption(fieldId: string, index: number, offset: -1 | 1) {
    const options = fields.find((item) => item.id === fieldId)?.options ?? [];
    const target = index + offset;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    replaceOptions(fieldId, next);
  }

  function removeOption(fieldId: string, optionId: string) {
    if (!optionConstraints) return;
    const options = fields.find((item) => item.id === fieldId)?.options ?? [];
    if (options.length <= optionConstraints.minCount) {
      setError('Não é possível remover a última opção.');
      return;
    }
    setError('');
    replaceOptions(fieldId, options.filter((option) => option.id !== optionId));
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
  if (!payload || !optionConstraints) return <main className={styles.page}><div className={styles.error}>{error || 'Ficha indisponível.'}</div></main>;

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
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CAMPOS DA FICHA</p><h2 id="fields-title">{fields.filter((field) => field.enabled !== false).length} habilitados de {fields.length} campos</h2></div><button type="button" className={styles.primary} disabled={!dirty || Boolean(saving)} onClick={() => void save()}>{saving === 'save' ? 'Salvando…' : 'Salvar rascunho'}</button></div>
          <div className={styles.fields}>
            {fields.map((field, index) => <article className={styles.fieldCard} key={field.id}>
              <div className={styles.order}><button type="button" aria-label={`Mover ${field.label} para cima`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><span>{index + 1}</span><button type="button" aria-label={`Mover ${field.label} para baixo`} disabled={index === fields.length - 1} onClick={() => move(index, 1)}>↓</button></div>
              <div className={styles.fieldContent}>
                <div className={styles.fieldHeading}><div><strong>{field.label}</strong><span>{field.category} · {typeLabels[field.type]}{field.sensitive ? ' · dado sensível' : ''}</span></div>{field.locked && <span className={styles.locked}>Essencial</span>}</div>
                <label className={styles.check}><input type="checkbox" checked={field.enabled !== false} disabled={field.locked} onChange={(e) => updateField(field.id, { enabled: e.target.checked })} /> Habilitado na ficha</label>
                <label className={styles.check}><input type="checkbox" checked={field.required} disabled={field.locked} onChange={(e) => updateField(field.id, { required: e.target.checked })} /> Obrigatório</label>
                <div className={styles.fieldSettings}><label>Texto de ajuda<input maxLength={240} value={field.help ?? ''} onChange={(e) => updateField(field.id, { help: e.target.value || undefined })} placeholder="Explique por que ou como preencher" /></label><label>Exemplo no campo<input maxLength={120} value={field.placeholder ?? ''} onChange={(e) => updateField(field.id, { placeholder: e.target.value || undefined })} placeholder="Ex.: Empresa S.A." /></label></div>
                {isChoiceField(field.type, choiceFieldTypes) && <fieldset className={styles.optionEditor}>
                  <legend>Opções da pergunta</legend>
                  <p>Renomear ou reordenar preserva o identificador estável de cada opção.</p>
                  <ul className={styles.optionList}>
                    {(field.options ?? []).map((option, optionIndex) => <li className={styles.optionRow} key={option.id}>
                      <div className={styles.optionOrder}>
                        <button type="button" aria-label={`Mover opção ${option.label || optionIndex + 1} para cima`} disabled={optionIndex === 0} onClick={() => moveOption(field.id, optionIndex, -1)}>↑</button>
                        <button type="button" aria-label={`Mover opção ${option.label || optionIndex + 1} para baixo`} disabled={optionIndex === (field.options?.length ?? 0) - 1} onClick={() => moveOption(field.id, optionIndex, 1)}>↓</button>
                      </div>
                      <label>Rótulo da opção {optionIndex + 1}
                        <input maxLength={optionConstraints.labelMaxLength} value={option.label} onChange={(e) => renameOption(field.id, option.id, e.target.value)} autoFocus={focusOptionId === option.id} />
                      </label>
                      <button type="button" className={styles.optionRemove} disabled={(field.options?.length ?? 0) <= optionConstraints.minCount} onClick={() => removeOption(field.id, option.id)} aria-label={`Remover opção ${option.label || optionIndex + 1}`} title={(field.options?.length ?? 0) <= optionConstraints.minCount ? 'Não é possível remover a última opção.' : 'Remover opção'}>Remover</button>
                    </li>)}
                  </ul>
                  <button type="button" className={styles.secondary} disabled={(field.options?.length ?? 0) >= optionConstraints.maxCount} onClick={() => addOption(field.id)}>{(field.options?.length ?? 0) >= optionConstraints.maxCount ? `Limite de ${optionConstraints.maxCount} opções atingido` : 'Adicionar opção'}</button>
                </fieldset>}
              </div>
              {!field.locked && <button type="button" className={styles.remove} onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}>Remover</button>}
            </article>)}
          </div>

          <section className={styles.addPanel}><h2>Adicionar campos do catálogo</h2><p>Os campos não são adicionados automaticamente: escolha apenas o que o evento realmente precisa.</p><div className={styles.catalog}>{availableCatalog.map((item) => <button type="button" key={item.code} onClick={() => addCatalog(item)}><strong>+ {item.label}</strong><span>{item.category}{item.sensitive ? ' · acesso restrito' : ''}</span></button>)}</div></section>
          <form className={styles.customForm} onSubmit={addCustom}><div><h2>Criar pergunta do evento</h2><p>Tipos controlados, sem scripts ou HTML.</p></div><label>Nome da pergunta<input required maxLength={100} value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} placeholder="Ex.: Qual tema deseja aprofundar?" /></label><label>Tipo<select value={custom.type} onChange={(e) => setCustom({ ...custom, type: e.target.value as FieldType })}>{customTypes.map((type) => <option value={type} key={type}>{typeLabels[type]}</option>)}</select></label>{isChoiceField(custom.type, choiceFieldTypes) && <label>Opções, separadas por vírgula<input value={custom.options} onChange={(e) => setCustom({ ...custom, options: e.target.value })} placeholder="Opção A, Opção B, Opção C" /></label>}<button className={styles.secondary}>Adicionar pergunta</button></form>
        </section>

        <aside className={styles.preview} aria-labelledby="preview-title"><p className={styles.eyebrow}>PRÉVIA</p><h2 id="preview-title">Ficha do participante</h2><p>Visualização estrutural; nenhuma inscrição será enviada aqui.</p><div className={styles.previewFields}>{fields.filter((field) => field.enabled !== false).map((field) => <div className={styles.previewField} key={field.id}><span>{field.label}{field.required && <b aria-label="obrigatório"> *</b>}</span><PreviewControl field={field} />{field.help && <small>{field.help}</small>}</div>)}</div><button type="button" className={styles.publish} disabled={dirty || payload.form.revision < 1 || Boolean(saving)} onClick={() => void publish()}>{saving === 'publish' ? 'Preservando…' : 'Preservar versão para testes'}</button>{dirty && <small>Salve o rascunho antes de preservar uma versão.</small>}</aside>
      </div>
    <section className={styles.addPanel}><h2>Campos gerados automaticamente</h2><p>Estes dados não são perguntas da ficha e não podem ser alterados pelo participante.</p><div className={styles.catalog}>{payload.systemFields.map((field) => <div key={field}><strong>{field}</strong></div>)}</div></section>
    </section>
  </main>;
}
