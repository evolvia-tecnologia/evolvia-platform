'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import CredentialLabel, { CredentialLabelData } from './credential-label';
import styles from './event-desk.module.css';

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
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const choices = ['preferred_name', 'institution', draft.nameField, draft.companyField, ...draft.extraFields]
    .reduce<LabelField[]>((list, code) => list.some((field) => field.code === code) ? list : [...list, {
      code,
      label: code === 'institution' ? 'Empresa / instituição' : code === 'preferred_name' ? 'Como deseja ser chamado' : code,
    }], fields);
  const preview: CredentialLabelData = {
    eventName: 'Evento',
    name: draft.showName ? 'Nome para crachá' : null,
    company: draft.showCompany ? 'Empresa / instituição' : null,
    lines: draft.extraFields.map((code) => choices.find((field) => field.code === code)?.label ?? code),
    category: draft.showCategory ? 'Categoria' : null,
    protocol: 'EVO-AB12CD34EF567890',
    qr: draft.codeMode === 'BARCODE' ? null : 'EVQ1.preview',
    barcode: draft.codeMode === 'QR' ? null : 'EVB1.preview',
    widthMm: draft.widthMm,
    heightMm: draft.heightMm,
  };

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
    setBusy(true);
    try {
      const result = await api<{ label: LabelSettings }>(`/events/${encodeURIComponent(eventId)}/desk/label`, {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      setDraft(result.label);
      onSaved('Etiqueta do credenciamento atualizada.');
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível salvar a etiqueta.');
    } finally { setBusy(false); }
  }

  return <fieldset className={styles.register}>
    <legend>Etiqueta térmica</legend>
    <p>O padrão traz o nome para crachá, a empresa e o QR Code. Os outros campos da ficha, a categoria e o código de barras podem ser ligados ou desligados. A impressão usa o tamanho escolhido na impressora térmica.</p>
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
    <label><input type="checkbox" checked={draft.showName} onChange={(event) => setDraft((current) => ({ ...current, showName: event.target.checked }))} /> Nome para crachá</label>
    <label>Campo do nome
      <select value={draft.nameField} onChange={(event) => setDraft((current) => ({ ...current, nameField: event.target.value }))}>
        {choices.map((field) => <option key={field.code} value={field.code}>{field.label}</option>)}
      </select>
    </label>
    <label><input type="checkbox" checked={draft.showCompany} onChange={(event) => setDraft((current) => ({ ...current, showCompany: event.target.checked }))} /> Empresa / instituição</label>
    <label>Campo da empresa
      <select value={draft.companyField} onChange={(event) => setDraft((current) => ({ ...current, companyField: event.target.value }))}>
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
    <label><input type="checkbox" checked={draft.showCategory} onChange={(event) => setDraft((current) => ({ ...current, showCategory: event.target.checked }))} /> Categoria na tarja</label>
    <div className={styles.choices}>
      {([['QR', 'Só QR Code'], ['BOTH', 'Código de barras e QR Code'], ['BARCODE', 'Só código de barras']] as const).map(([mode, label]) => <label key={mode}>
        <input type="radio" name="label-code" checked={draft.codeMode === mode} onChange={() => setDraft((current) => ({ ...current, codeMode: mode }))} />
        {label}
      </label>)}
    </div>
    {draft.widthMm < 70 && draft.codeMode !== 'QR' && <p>Neste tamanho, o QR Code é lido com mais folga do que o código de barras.</p>}
    <div className={styles.labelPreview}><CredentialLabel label={preview} preview /></div>
    <button type="button" disabled={busy} onClick={() => void save()}>Salvar etiqueta</button>
  </fieldset>;
}
