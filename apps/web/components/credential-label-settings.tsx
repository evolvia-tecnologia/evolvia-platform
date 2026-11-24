'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import styles from './credential-label-settings.module.css';

type LabelField = { code: string; label: string };
type Preset = '4x2' | '6x3' | '8x3' | '9x4' | '10x5' | 'custom';
type CodeMode = 'QR' | 'BARCODE' | 'BOTH';
export type LabelSettings = {
  preset: Preset;
  widthMm: number;
  heightMm: number;
  showName: boolean;
  nameField: string;
  showCompany: boolean;
  companyField: string;
  extraFields: string[];
  showCategory: boolean;
  codeMode: CodeMode;
};

const PRESETS: Array<[Preset, string, number, number]> = [
  ['4x2', '4×2 cm', 40, 20],
  ['6x3', '6×3 cm', 60, 30],
  ['8x3', '8×3 cm', 80, 30],
  ['9x4', '9×4 cm', 90, 40],
  ['10x5', '10×5 cm', 100, 50],
  ['custom', 'Personalizada', 0, 0],
];

export default function CredentialLabelSettings({
  eventId,
  initial,
  fields,
  onSaved,
  onError,
}: {
  eventId: string;
  initial: LabelSettings;
  fields: LabelField[];
  onSaved: (message: string, label: LabelSettings) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...initial, extraFields: Array.isArray(initial.extraFields) ? initial.extraFields : [] }));
  const [busy, setBusy] = useState(false);
  // An in-flight save belongs to exactly one event/session. Never let an old
  // response replace another event's printer settings or unblock its editor.
  const session = useRef(0);
  const inFlight = useRef<number | null>(null);
  useEffect(() => {
    session.current += 1;
    inFlight.current = null;
    setBusy(false);
    setDraft({ ...initial, extraFields: Array.isArray(initial.extraFields) ? [...initial.extraFields] : [] });
    return () => { session.current += 1; inFlight.current = null; };
  }, [eventId]);
  const choices = ['preferred_name', 'institution', 'job_title', 'city_state', draft.nameField, draft.companyField, ...draft.extraFields]
    .reduce<LabelField[]>((list, code) => list.some((field) => field.code === code) ? list : [...list, {
      code,
      label: code === 'institution' ? 'Empresa / instituição' : code === 'preferred_name' ? 'Como deseja ser chamado' : code === 'job_title' ? 'Cargo / função' : code === 'city_state' ? 'Cidade / UF (combinadas)' : code,
    }], Array.isArray(fields) ? fields : []);
  function setPreset(preset: Preset) {
    const known = PRESETS.find((item) => item[0] === preset);
    setDraft((current) => ({
      ...current,
      preset,
      widthMm: preset === 'custom' ? current.widthMm : known?.[2] ?? current.widthMm,
      heightMm: preset === 'custom' ? current.heightMm : known?.[3] ?? current.heightMm,
    }));
  }

  async function save() {
    const currentSession = session.current;
    if (inFlight.current === currentSession) return;
    inFlight.current = currentSession;
    setBusy(true);
    const payload = { ...draft, extraFields: [...draft.extraFields] };
    try {
      const result = await api<{ label: LabelSettings }>(`/events/${encodeURIComponent(eventId)}/desk/label`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (currentSession !== session.current) return;
      if (!result?.label || (result.label.extraFields !== undefined && !Array.isArray(result.label.extraFields))) {
        throw new Error('Resposta inválida do servidor.');
      }
      const saved = { ...result.label, extraFields: Array.isArray(result.label.extraFields) ? [...result.label.extraFields] : [] };
      // Do not report a successful save if an older or faulty API returned
      // another printer configuration. Compare every requested setting, including
      // field order and code mode, before showing a persisted state.
      const confirmed = (Object.keys(payload) as Array<keyof LabelSettings>).every((key) =>
        key === 'extraFields'
          ? saved.extraFields.length === payload.extraFields.length
            && saved.extraFields.every((field, index) => field === payload.extraFields[index])
          : saved[key] === payload[key]);
      if (!confirmed) throw new Error('Configuração não confirmada pelo servidor.');
      setDraft(saved);
      onSaved('Etiqueta do credenciamento atualizada.', saved);
    } catch {
      if (currentSession === session.current) {
        // Do not expose API errors containing SQL, tokens or another tenant's data.
        onError('Não foi possível salvar a etiqueta. Confira os campos e tente novamente.');
      }
    } finally {
      if (inFlight.current === currentSession) {
        inFlight.current = null;
        setBusy(false);
      }
    }
  }

  return <section className={styles.settings} aria-labelledby="label-settings-title">
    <header><h3 id="label-settings-title">Papel e impressão</h3><p>O tamanho do papel vale para todas as categorias. Novas configurações nascem em 8×3 cm. “Reduzir para caber” fica sempre ativo na prévia e na impressão. A prévia única acima mostra a etiqueta usada na impressão da categoria selecionada.</p></header>
    <div className={styles.form}>
    <fieldset className={styles.group}>
    <legend>1. Tamanho da etiqueta</legend>
    <p>Use o mesmo tamanho configurado na impressora térmica.</p>
    <div className={styles.choices}>
      {PRESETS.map(([preset, label]) => <label key={preset}>
        <input type="radio" name="label-size" checked={draft.preset === preset} onChange={() => setPreset(preset)} />
        {label}
      </label>)}
    </div>
    {draft.preset === 'custom' && <div className={styles.choices}>
      <label>Largura (cm)
        <input type="number" min={3} max={12} step={0.1} value={draft.widthMm / 10} onChange={(event) => setDraft((current) => ({ ...current, widthMm: Math.round(Number(event.target.value) * 10) }))} />
      </label>
      <label>Altura (cm)
        <input type="number" min={1.5} max={8} step={0.1} value={draft.heightMm / 10} onChange={(event) => setDraft((current) => ({ ...current, heightMm: Math.round(Number(event.target.value) * 10) }))} />
      </label>
    </div>}
    </fieldset>
    <details className={styles.legacy}>
    <summary>Configuração histórica: campos e códigos de categorias sem modelo salvo</summary>
    <p>Estas opções só são usadas quando a categoria ainda não tem um modelo próprio salvo. Para configurar os campos, a ordem, o QR Code e os estilos das novas etiquetas, utilize o editor por categoria acima. Não existe uma segunda prévia.</p>
    <fieldset className={styles.group}><legend>Campos da etiqueta histórica</legend>
    <p>Para nome, empresa, cargo e cidade/UF: use o nome preferido e a instituição; nas duas linhas abaixo selecione Cargo / função e Cidade / UF (combinadas). Preencha esses dados na ficha de inscrição.</p>
    <label className={styles.toggle}><input type="checkbox" checked={draft.showName} onChange={(event) => setDraft((current) => ({ ...current, showName: event.target.checked }))} /> Nome para crachá</label>
    <label>Campo do nome
      <select disabled={!draft.showName} value={draft.nameField} onChange={(event) => setDraft((current) => ({ ...current, nameField: event.target.value }))}>
        {choices.map((field) => <option key={field.code} value={field.code}>{field.label}</option>)}
      </select>
    </label>
    <label className={styles.toggle}><input type="checkbox" checked={draft.showCompany} onChange={(event) => setDraft((current) => ({ ...current, showCompany: event.target.checked }))} /> Empresa / instituição</label>
    <label>Campo da empresa
      <select disabled={!draft.showCompany} value={draft.companyField} onChange={(event) => setDraft((current) => ({ ...current, companyField: event.target.value }))}>
        {choices.map((field) => <option key={field.code} value={field.code}>{field.label}</option>)}
      </select>
    </label>
    {[0, 1].map((index) => <label key={index}>Linha {index + 1} da ficha
      <select value={draft.extraFields[index] ?? ''} onChange={(event) => setDraft((current) => {
        const extraFields = [...current.extraFields];
        if (event.target.value) extraFields[index] = event.target.value;
        else extraFields.splice(index, 1);
        return { ...current, extraFields: extraFields.filter(Boolean).slice(0, 2) };
      })}>
        <option value="">Não usar</option>
        {choices.map((field) => <option key={field.code} value={field.code}>{field.label}</option>)}
      </select>
    </label>)}
    <label className={styles.toggle}><input type="checkbox" checked={draft.showCategory} onChange={(event) => setDraft((current) => ({ ...current, showCategory: event.target.checked }))} /> Categoria na tarja</label>
    </fieldset>
    <fieldset className={styles.group}><legend>Códigos da etiqueta histórica</legend>
    <div className={styles.choices}>
      {([['QR', 'Só QR Code'], ['BOTH', 'Código de barras e QR Code'], ['BARCODE', 'Só código de barras']] as const).map(([mode, label]) => <label key={mode}>
        <input type="radio" name="label-code" checked={draft.codeMode === mode} onChange={() => setDraft((current) => ({ ...current, codeMode: mode }))} />
        {label}
      </label>)}
    </div>
    {draft.widthMm < 70 && draft.codeMode !== 'QR' && <p>Neste tamanho, o QR Code é lido com mais folga do que o código de barras.</p>}
    </fieldset>
    </details>
    <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar etiqueta'}</button></div>
    </div>
  </section>;
}


