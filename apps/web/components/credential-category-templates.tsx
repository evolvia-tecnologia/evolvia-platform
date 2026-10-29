'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import CredentialLabel, { type CredentialLabelData } from './credential-label';
import styles from './credential-category-templates.module.css';

export type LabelFieldStyle = { align: 'left' | 'center' | 'right'; bold: boolean; color: string };
export type CategoryLabelTemplate = { categoryId: string; fields: string[]; styles?: Record<string, LabelFieldStyle> };
const DEFAULT_STYLE: LabelFieldStyle = { align: 'left', bold: false, color: '#111827' };
// Cores com contraste >= 4,5:1 em etiqueta de papel branco.
const COLORS = [{ value: '#111827', label: 'Preto' }, { value: '#1d4ed8', label: 'Azul' }, { value: '#065f46', label: 'Verde' }, { value: '#9a3412', label: 'Laranja' }, { value: '#7c2d12', label: 'Marrom' }, { value: '#6b21a8', label: 'Roxo' }, { value: '#be123c', label: 'Vermelho' }];
type Field = { code: string; label: string; appliesToCategoryIds?: string[] };
type Category = { id: string; name: string };
const DEFAULT = ['preferred_name', 'institution', 'city_state', 'qr'];
const FALLBACK: Field[] = [
  { code: 'preferred_name', label: 'Nome para crachá (como gostaria de ser chamado)' },
  { code: 'institution', label: 'Empresa' },
  { code: 'city_state', label: 'Cidade / Estado' },
  { code: 'qr', label: 'Código QR' },
  { code: 'job_title', label: 'Cargo / função' },
];
const SAMPLES: Record<string, string> = {
  preferred_name: 'Ana Pesquisadora', full_name: 'Ana Beatriz Martins',
  institution: 'Empresa Exemplo', city_state: 'Osasco / SP', job_title: 'Palestrante',
};

export default function CredentialCategoryTemplates({
  eventId, categories, fields, templates, widthMm, heightMm, organizer, onSaved, onError,
}: {
  eventId: string;
  categories: Category[];
  fields: Field[];
  templates: CategoryLabelTemplate[];
  widthMm: number;
  heightMm: number;
  organizer: boolean;
  onSaved: (template: CategoryLabelTemplate) => void;
  onError: (message: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [draft, setDraft] = useState<string[]>([...DEFAULT]);
  const [selectedField, setSelectedField] = useState('');
  const [format, setFormat] = useState<Record<string, LabelFieldStyle>>({});
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const session = useRef(0);

  useEffect(() => {
    if (!categories.some((category) => category.id === categoryId)) setCategoryId(categories[0]?.id ?? '');
  }, [categories, categoryId]);
  useEffect(() => {
    session.current += 1;
    const found = templates.find((item) => item.categoryId === categoryId);
    setDraft(found ? [...found.fields] : [...DEFAULT]);
    setFormat(found?.styles ? { ...found.styles } : {});
    setSelectedField('');
  }, [eventId, categoryId, templates]);

  const choices = [...fields, ...FALLBACK]
    .filter((field) =>
      !field.appliesToCategoryIds?.length || field.appliesToCategoryIds.includes(categoryId))
    .filter((field, index, all) => all.findIndex((candidate) => candidate.code === field.code) === index);
  const available = choices.filter((field) => !draft.includes(field.code));
  const move = (index: number, step: number) => setDraft((current) => {
    const next = [...current];
    const target = index + step;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const display = (code: string) => choices.find((field) => field.code === code)?.label ?? code;
  const changeStyle = (code: string, patch: Partial<LabelFieldStyle>) => setFormat((current) => ({ ...current, [code]: { ...(current[code] ?? DEFAULT_STYLE), ...patch } }));
  const preview: CredentialLabelData = {
    eventName: 'Exemplo de evento', name: null, company: null, lines: [], category: null,
    protocol: 'EXEMPLO-0001', qr: draft.includes('qr') ? 'EVQ1.preview' : null, barcode: null,
    widthMm, heightMm,
    orderedContent: draft.map((code) => ({
      code, kind: code === 'qr' ? 'qr' as const : 'text' as const,
      value: code === 'qr' ? '' : (SAMPLES[code] ?? display(code)),
      style: format[code],
    })),
  };

  async function save() {
    if (inFlight.current || !organizer || !categoryId) return;
    inFlight.current = true;
    setBusy(true);
    const currentSession = session.current;
    const targetId = categoryId;
    const chosen = [...draft];
    const styles = Object.fromEntries(chosen.filter((code) => format[code]).map((code) => [code, format[code]]));
    try {
      const result = await api<CategoryLabelTemplate>(
        `/events/${encodeURIComponent(eventId)}/desk/labels/categories/${encodeURIComponent(targetId)}`,
        { method: 'POST', body: JSON.stringify({ fields: chosen, styles }) },
      );
      if (currentSession !== session.current || targetId !== categoryId) return;
      if (result.categoryId !== targetId || !Array.isArray(result.fields)
        || result.fields.some((field) => typeof field !== 'string')) {
        throw new Error('O servidor não confirmou o modelo da categoria selecionada.');
      }
      onSaved({ categoryId: targetId, fields: [...result.fields], styles: result.styles ?? styles });
    } catch (reason) {
      if (currentSession === session.current) {
        onError(reason instanceof Error ? reason.message : 'Não foi possível salvar o modelo da etiqueta.');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section className={styles.section} aria-labelledby="category-badge-title">
    <header>
      <h3 id="category-badge-title">Modelos de etiquetas por categoria</h3>
      <p>Defina o que será impresso no crachá de cada categoria. Você não precisa ter participantes inscritos para configurar.</p>
    </header>
    {categories.length === 0
      ? <p role="status">Crie uma categoria em Inscrições e vendas para configurar sua etiqueta.</p>
      : <>
        <label className={styles.category}>Categoria do evento
          <select value={categoryId} disabled={busy} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
        </label>
        <div className={styles.columns}>
          <div className={styles.editor}>
            <h4>Campos e ordem de impressão</h4>
            <p>Modelo inicial: Nome para crachá, Empresa, Cidade/Estado e Código QR. Personalize para palestrantes, participantes, staff e outras categorias.</p>
            {draft.length === 0 && <p>Nenhum campo selecionado. Adicione um campo abaixo.</p>}
            <ol className={styles.fields}>
              {draft.map((code, index) => <li key={code}>
                <span><strong>{index + 1}.</strong> {display(code)}</span>
                <div className={styles.actions}>
                  <button type="button" disabled={busy || !organizer || index === 0}
                    aria-label={`Subir ${display(code)}`} onClick={() => move(index, -1)}>↑</button>
                  <button type="button" disabled={busy || !organizer || index === draft.length - 1}
                    aria-label={`Descer ${display(code)}`} onClick={() => move(index, 1)}>↓</button>
                  <button type="button" disabled={busy || !organizer}
                    aria-label={`Remover ${display(code)}`}
                    onClick={() => setDraft((current) => current.filter((item) => item !== code))}>Remover</button>
                </div>
                <div className={styles.formatBar} aria-label={`Formatação de ${display(code)}`}>
                  <label>Alinhamento
                    <select aria-label={`Alinhamento de ${display(code)}`} value={(format[code] ?? DEFAULT_STYLE).align}
                      disabled={busy || !organizer} onChange={(event) => changeStyle(code, { align: event.target.value as LabelFieldStyle['align'] })}>
                      <option value="left">Esquerda</option><option value="center">Centralizado</option><option value="right">Direita</option>
                    </select>
                  </label>
                  {code !== 'qr' && <>
                    <label className={styles.boldOption}><input type="checkbox" disabled={busy || !organizer}
                      checked={(format[code] ?? DEFAULT_STYLE).bold} onChange={(event) => changeStyle(code, { bold: event.target.checked })} /> Negrito</label>
                    <label>Cor da fonte
                      <select aria-label={`Cor de ${display(code)}`} disabled={busy || !organizer}
                        value={(format[code] ?? DEFAULT_STYLE).color} onChange={(event) => changeStyle(code, { color: event.target.value })}>
                        {COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
                      </select>
                    </label>
                  </>}
                </div>
              </li>)}
            </ol>
            <div className={styles.add}>
              <label>Novo campo da ficha
                <select value={selectedField} disabled={busy || !organizer} onChange={(event) => setSelectedField(event.target.value)}>
                  <option value="">Selecione o campo</option>
                  {available.map((field) => <option key={field.code} value={field.code}>{field.label}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || !organizer || !selectedField || draft.length >= 12}
                onClick={() => { setDraft((current) => [...current, selectedField]); setSelectedField(''); }}>Adicionar campo</button>
            </div>
            <div className={styles.footer}>
              <button type="button" disabled={busy || !organizer}
                onClick={() => { setDraft([...DEFAULT]); setFormat({}); }}>Restaurar padrão</button>
              <button type="button" disabled={busy || !organizer} onClick={() => void save()}>
                {busy ? 'Salvando…' : 'Salvar modelo da categoria'}
              </button>
            </div>
          </div>
          <aside className={styles.preview} aria-label="Prévia do crachá da categoria">
            <h4>Prévia · {categories.find((item) => item.id === categoryId)?.name}</h4>
            <p>Dados fictícios apenas para visualização; dimensão {widthMm / 10} × {heightMm / 10} cm.</p>
            <CredentialLabel label={preview} preview />
          </aside>
        </div>
      </>}
  </section>;
}
