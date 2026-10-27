'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api, apiBlob } from '../lib/api';
import styles from './publication-media-editor.module.css';

type Usage = 'LOGO' | 'COVER' | 'SOCIAL_SHARE';
type MediaItem = {
  usage: Usage;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  altText: string | null;
  decorative: boolean;
  updatedAt: string;
};

const CONFIG: Array<{ usage: Usage; title: string; help: string; decorativeAllowed: boolean }> = [
  { usage: 'LOGO', title: 'Logo do evento', help: 'Aparece ao lado do nome, no topo da página pública, e é a mesma logo na tela de autoatendimento. O texto alternativo descreve a marca para quem não vê a imagem.', decorativeAllowed: false },
  { usage: 'COVER', title: 'Capa pública', help: 'É a faixa larga no topo da página, acima do título. Se a imagem só enfeita, marque como decorativa. Se ela informa algo, descreva isso no texto alternativo.', decorativeAllowed: true },
  { usage: 'SOCIAL_SHARE', title: 'Imagem de compartilhamento', help: 'Aparece quando alguém cola o link no WhatsApp ou em uma rede. Não entra no corpo da página. O texto alternativo explica a imagem nessa prévia.', decorativeAllowed: false },
];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(file);
  });
}

export default function PublicationMediaEditor({
  eventId,
  publicationRevision,
  canEdit,
  hasUnsavedChanges,
  onChanged,
}: {
  eventId: string;
  publicationRevision: number;
  canEdit: boolean;
  hasUnsavedChanges: boolean;
  onChanged(): Promise<void>;
}) {
  const statusRef = useRef<HTMLDivElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const [revision, setRevision] = useState(publicationRevision);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [previews, setPreviews] = useState<Partial<Record<Usage, string>>>({});
  const [files, setFiles] = useState<Partial<Record<Usage, File>>>({});
  const [altTexts, setAltTexts] = useState<Partial<Record<Usage, string>>>({});
  const [decorative, setDecorative] = useState(false);
  const [busy, setBusy] = useState<Usage | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    setRevision(publicationRevision);
  }, [publicationRevision]);

  const load = async () => {
    const current = await api<MediaItem[]>(`/events/${eventId}/publication/media`);
    const nextPreviews: Partial<Record<Usage, string>> = {};
    await Promise.all(current.map(async (item) => {
      const blob = await apiBlob(`/events/${eventId}/publication/media/${item.usage}`);
      nextPreviews[item.usage] = URL.createObjectURL(blob);
    }));
    setItems(current);
    setPreviews((previous) => {
      Object.values(previous).forEach((url) => url && URL.revokeObjectURL(url));
      previewUrlsRef.current = Object.values(nextPreviews).filter((url): url is string => Boolean(url));
      return nextPreviews;
    });
  };

  useEffect(() => {
    void load().catch(() => {
      setIsError(true);
      setMessage('Não foi possível carregar as mídias da Divulgação.');
    });
    return () => previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    // A revisão sinaliza que o conjunto pode ter mudado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, publicationRevision]);

  const selectFile = (usage: Usage, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setMessage('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setIsError(true);
      setMessage('A imagem deve ter no máximo 5 MB.');
      return;
    }
    setFiles((current) => ({ ...current, [usage]: file }));
  };

  const upload = async (usage: Usage) => {
    const file = files[usage];
    if (!file || busy || hasUnsavedChanges) return;
    setBusy(usage);
    setMessage('');
    setIsError(false);
    try {
      const result = await api<{ publicationRevision: number }>(`/events/${eventId}/publication/media`, {
        method: 'POST',
        body: JSON.stringify({
          usage,
          contentBase64: await toBase64(file),
          altText: decorative && usage === 'COVER' ? null : (altTexts[usage] ?? '').trim(),
          decorative: usage === 'COVER' && decorative,
          publicationRevision: revision,
        }),
      });
      if (typeof result.publicationRevision === 'number') setRevision(result.publicationRevision);
      setFiles((current) => ({ ...current, [usage]: undefined }));
      setAltTexts((current) => ({ ...current, [usage]: '' }));
      if (usage === 'COVER') setDecorative(false);
      const scrollY = window.scrollY;
      await onChanged();
      window.scrollTo({ top: scrollY });
      setMessage(`${CONFIG.find((item) => item.usage === usage)?.title} atualizada com segurança.`);
    } catch (reason) {
      setIsError(true);
      if (reason instanceof ApiError && reason.status === 409) {
        await onChanged().catch(() => undefined);
      }
      setMessage(reason instanceof ApiError ? reason.message : 'Não foi possível enviar a imagem.');
    } finally {
      setBusy(null);
      requestAnimationFrame(() => statusRef.current?.focus({ preventScroll: true }));
    }
  };

  const remove = async (usage: Usage) => {
    if (busy || hasUnsavedChanges) return;
    setBusy(usage);
    setMessage('');
    setIsError(false);
    try {
      const result = await api<{ publicationRevision: number }>(`/events/${eventId}/publication/media/${usage}`, {
        method: 'DELETE',
        body: JSON.stringify({ publicationRevision: revision }),
      });
      if (typeof result.publicationRevision === 'number') setRevision(result.publicationRevision);
      const scrollY = window.scrollY;
      await onChanged();
      window.scrollTo({ top: scrollY });
      setMessage(`${CONFIG.find((item) => item.usage === usage)?.title} removida da publicação.`);
    } catch (reason) {
      setIsError(true);
      if (reason instanceof ApiError && reason.status === 409) {
        await onChanged().catch(() => undefined);
      }
      setMessage(reason instanceof Error ? reason.message : 'Não foi possível remover a imagem.');
    } finally {
      setBusy(null);
      requestAnimationFrame(() => statusRef.current?.focus({ preventScroll: true }));
    }
  };

  return <section className={styles.card} aria-labelledby="publication-media-title">
    <div className={styles.heading}>
      <div>
        <p>6 · MÍDIA PÚBLICA</p>
        <h2 id="publication-media-title">Imagens validadas pelo Evolvia</h2>
        <span>PNG, JPEG ou WebP, até 5 MB. O formato real, as dimensões e o escopo do evento são verificados no servidor.</span>
      </div>
    </div>

    {hasUnsavedChanges && <div className={styles.notice} role="status">Salve primeiro as alterações editoriais para preservar a revisão correta antes de enviar ou remover imagens.</div>}
    {message && <div ref={statusRef} tabIndex={-1} className={isError ? styles.error : styles.success} role={isError ? 'alert' : 'status'} aria-live="polite">{message}</div>}

    <div className={styles.grid}>
      {CONFIG.map((config) => {
        const current = items.find((item) => item.usage === config.usage);
        const inputId = `publication-media-${config.usage}`;
        const altId = `${inputId}-alt`;
        const isDecorative = config.usage === 'COVER' && decorative;
        return <article className={styles.mediaCard} key={config.usage}>
          <div>
            <h3>{config.title}</h3>
            <p>{config.help}</p>
          </div>
          {current && previews[config.usage] ? <img
            className={config.usage === 'LOGO' ? styles.logoPreview : styles.preview}
            src={previews[config.usage]}
            alt={current.decorative ? '' : current.altText ?? ''}
          /> : <div className={styles.empty} aria-label={`Nenhuma imagem definida para ${config.title}`}>Sem imagem</div>}
          {current && <small>{current.width} × {current.height} px · {(current.byteSize / 1024).toFixed(0)} KB{current.decorative ? ' · decorativa' : ''}</small>}
          <label htmlFor={inputId}>Selecionar nova imagem</label>
          <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectFile(config.usage, event)} disabled={!canEdit || Boolean(busy) || hasUnsavedChanges} />
          {config.decorativeAllowed && <label className={styles.check}>
            <input type="checkbox" checked={decorative} onChange={(event) => setDecorative(event.target.checked)} disabled={!canEdit || Boolean(busy) || hasUnsavedChanges} />
            A capa é apenas decorativa
          </label>}
          <label htmlFor={altId}>Texto alternativo{isDecorative ? ' (dispensado para capa decorativa)' : ''}</label>
          <input id={altId} value={altTexts[config.usage] ?? ''} onChange={(event) => setAltTexts((currentValue) => ({ ...currentValue, [config.usage]: event.target.value }))} maxLength={300} disabled={!canEdit || Boolean(busy) || hasUnsavedChanges || isDecorative} placeholder={current?.altText ?? 'Descreva a informação visual relevante'} />
          <div className={styles.actions}>
            <button type="button" onClick={() => void upload(config.usage)} disabled={!canEdit || !files[config.usage] || Boolean(busy) || hasUnsavedChanges}>{busy === config.usage ? 'Processando...' : 'Enviar imagem'}</button>
            {current && <button className={styles.remove} type="button" onClick={() => void remove(config.usage)} disabled={!canEdit || Boolean(busy) || hasUnsavedChanges}>Remover</button>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
