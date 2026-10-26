'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiBlob, getToken } from '../lib/api';
import { communicationDraftId } from '../lib/event-communication-draft';
import PublicationRichTextField from './publication-rich-text-field';
import ScientificEvaHelp from './scientific-eva-help';
import styles from './event-certificate.module.css';

const TAGS = ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO'] as const;
const TITLE_MAX = 240;
const BODY_MAX = 4000;
const DEFAULT_TITLE = 'Certificado de participação';
const DEFAULT_BODY = 'Certificamos que **{NOME}** participou de **{EVENTO}**.';

type CertificateArt = { mimeType: string; byteSize: number | null; altText: string | null };
type CertificateSetting = {
  enabled: boolean;
  hours: number | null;
  title: string;
  body: string;
  back: string | null;
  art: CertificateArt | null;
  revision: number;
  feeCents: 0;
  role: 'participation';
  issuedCount: number;
};

type CertificatePackage = { id: string; issuedCount: number; hours: number | null; createdAt: string };

function isCertificatePackages(value: unknown): value is CertificatePackage[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  const ids = new Set<string>();
  return value.every(row => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(row.id) || ids.has(row.id)) return false;
    ids.add(row.id);
    return Number.isSafeInteger(row.issuedCount) && row.issuedCount > 0 && (row.hours === null || Number.isSafeInteger(row.hours) && row.hours >= 0) && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt));
  });
}

type CertificateBatch = {
  issuedCount: number;
  batchId: string;
  totalIssued: number;
  skippedCount: number;
  nextAfterId: string | null;
  pending: boolean;
  hours: number | null;
  feeCents: 0;
};

export default function EventCertificate({ eventId }: { eventId: string }) {
  if (!eventId) return <p>Escolha um evento para liberar o certificado.</p>;
  return <EventCertificateForm key={eventId} eventId={eventId} />;
}

function EventCertificateForm({ eventId }: { eventId: string }) {
  const [packages, setPackages] = useState<CertificatePackage[]>([]);
  const [packagesRevision, setPackagesRevision] = useState(0);
  const [packagesError, setPackagesError] = useState('');
  const [hasOlderPackages, setHasOlderPackages] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyVersion = useRef(0);
  const historyInFlight = useRef(false);
  const batchCommand = useRef<{ requestId: string; expectedRevision: number; afterId: string | null } | null>(null);
  const batchInFlight = useRef(false);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState('');
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [back, setBack] = useState('');
  const [focus, setFocus] = useState<'title' | 'body' | 'back'>('body');
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [art, setArt] = useState<CertificateArt | null>(null);
  const [preview, setPreview] = useState('');
  const [altText, setAltText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [revision, setRevision] = useState(0);
  const [issuedCount, setIssuedCount] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<CertificateSetting>(`/events/${encodeURIComponent(eventId)}/certificate`)
      .then((result) => {
        if (!active) return;
        applySetting(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o certificado.');
      });
    return () => { active = false; };
  }, [eventId]);

  useEffect(() => {
    let active = true;
    historyVersion.current += 1;
    historyInFlight.current = true;
    setHistoryBusy(true);
    setPackagesError('');
    api<CertificatePackage[]>(`/events/${encodeURIComponent(eventId)}/certificate/batches`)
      .then(result => {
        if (!active) return;
        if (!isCertificatePackages(result)) throw new Error('Formato de pacotes inválido.');
        setPackages(result);
        setHasOlderPackages(result.length === 100);
      })
      .catch(() => { if (active) setPackagesError('Não foi possível carregar os pacotes. Os certificados emitidos continuam disponíveis pelo código.'); })
      .finally(() => { if (active) { historyInFlight.current = false; setHistoryBusy(false); } });
    return () => { active = false; historyVersion.current += 1; };
  }, [eventId, packagesRevision]);

  async function loadOlderPackages() {
    const beforeId = packages.at(-1)?.id;
    if (historyInFlight.current || !hasOlderPackages || !beforeId) return;
    const version = historyVersion.current;
    historyInFlight.current = true;
    setHistoryBusy(true);
    setPackagesError('');
    try {
      const result = await api<CertificatePackage[]>(`/events/${encodeURIComponent(eventId)}/certificate/batches?beforeId=${encodeURIComponent(beforeId)}`);
      if (version !== historyVersion.current) return;
      if (!isCertificatePackages(result)) throw new Error('Formato de pacotes inválido.');
      const seen = new Set(packages.map(item => item.id));
      const older = result.filter(item => !seen.has(item.id));
      setPackages(previous => [...previous, ...older]);
      setHasOlderPackages(result.length === 100 && older.length > 0 && result.at(-1)?.id !== beforeId);
    } catch {
      if (version === historyVersion.current) setPackagesError('Não foi possível carregar os lotes anteriores. Os pacotes já carregados foram preservados. Tente novamente.');
    } finally {
      if (version === historyVersion.current) { historyInFlight.current = false; setHistoryBusy(false); }
    }
  }

  useEffect(() => {
    if (!art) { setPreview(''); return undefined; }
    let active = true;
    let url = '';
    apiBlob(`/events/${encodeURIComponent(eventId)}/certificate/art`)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch(() => { if (active) setPreview(''); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [eventId, art]);

  function applySetting(result: CertificateSetting) {
    setEnabled(result.enabled);
    batchCommand.current = null;
    setAfterId(null);
    setHours(result.hours == null ? '' : String(result.hours));
    setTitle(result.title || DEFAULT_TITLE);
    setBody(result.body || DEFAULT_BODY);
    setBack(result.back ?? '');
    setSavedEnabled(result.enabled);
    setArt(result.art);
    setAltText(result.art?.altText ?? '');
    setRevision(result.revision);
    setIssuedCount(result.issuedCount);
    setFile(null);
  }

  function insertTag(tag: (typeof TAGS)[number]) {
    const token = `{${tag}}`;
    const write = (current: string, max: number) => {
      const next = current.trim() ? `${current}${current.endsWith(' ') ? '' : ' '}${token}` : token;
      return next.length <= max ? next : current;
    };
    if (focus === 'title') setTitle((current) => write(current, TITLE_MAX));
    else if (focus === 'back') setBack((current) => write(current, BODY_MAX));
    else setBody((current) => write(current, BODY_MAX));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const parsedHours = hours.trim() === '' ? null : Number(hours);
    if (parsedHours !== null && (!Number.isInteger(parsedHours) || parsedHours < 1 || parsedHours > 999)) {
      setError('A carga horária precisa ser um número inteiro de 1 a 999, ou ficar em branco.');
      setBusy(false);
      return;
    }
    try {
      const result = await api<CertificateSetting>(`/events/${encodeURIComponent(eventId)}/certificate`, {
        method: 'PUT',
        body: JSON.stringify({ enabled, hours: parsedHours, title, body, back: back.trim() === '' ? null : back, expectedRevision: revision }),
      });
      applySetting(result);
      setNotice(result.enabled
        ? 'Certificado de participação liberado. O texto usa as tags na hora da consulta, e o download não é cobrado.'
        : 'Certificado desligado. Novas emissões ficam bloqueadas.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o certificado.');
    } finally { setBusy(false); }
  }

  function chooseArt(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setNotice('');
    if (!next) { setFile(null); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type) || next.type === 'image/svg+xml') {
      setFile(null);
      setError('Use uma imagem PNG, JPEG ou WebP. SVG não é aceito.');
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      setFile(null);
      setError('A imagem deve ter no máximo 5 MB.');
      return;
    }
    setError('');
    setFile(next);
  }

  async function uploadArt(event: FormEvent) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<CertificateSetting>(`/events/${encodeURIComponent(eventId)}/certificate/art`, {
        method: 'POST',
        body: JSON.stringify({ contentBase64: await toBase64(file), altText: altText.trim(), expectedRevision: revision }),
      });
      applySetting(result);
      setNotice('Arte do certificado atualizada. A imagem anterior foi substituída.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a arte.');
    } finally { setBusy(false); }
  }

  async function downloadBatch(batchId?: string) {
    if (busy || issuedCount < 1) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const headers = new Headers();
      const token = getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const route = batchId ? `batches/${encodeURIComponent(batchId)}/pdf` : 'batch';
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/certificate/${route}`, { headers, cache: 'no-store' });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const record = payload && typeof payload === 'object' ? payload as { message?: unknown; error?: { message?: unknown } } : {};
        const message = typeof record.error?.message === 'string' ? record.error.message : typeof record.message === 'string' ? record.message : '';
        throw new Error(message || 'Não foi possível baixar o lote.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'certificados.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setNotice('Lote baixado. Cada página é a segunda via de um certificado já emitido. O download não é cobrado.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível baixar o lote.');
    } finally { setBusy(false); }
  }

  async function issueBatch() {
    if (busy || !savedEnabled || batchInFlight.current) return;
    batchInFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      batchCommand.current ??= { requestId: communicationDraftId(), expectedRevision: revision, afterId };
      const result = await api<CertificateBatch>(`/events/${encodeURIComponent(eventId)}/certificate/batches`, {
        method: 'POST',
        body: JSON.stringify(batchCommand.current),
      });
      if (result.feeCents !== 0) throw new Error('O lote de participação não pode ter taxa.');
      setIssuedCount(result.totalIssued);
      setPackagesRevision(value => value + 1);
      setAfterId(result.nextAfterId);
      batchCommand.current = null;
      const pending = result.pending ? ' Há registros para conferir no próximo lote.' : '';
      const skipped = result.skippedCount ? ` ${result.skippedCount} registros não foram emitidos; confira nome, confirmação e presença.` : '';
      setNotice(result.issuedCount === 0
        ? `Nenhum certificado novo neste lote.${skipped}${pending}`
        : `Lote emitido: ${result.issuedCount}. A carga horária ficou gravada e não houve e-mail.${skipped}${pending}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível emitir o lote. Repita para recuperar o resultado do mesmo pedido.');
    } finally { batchInFlight.current = false; setBusy(false); }
  }

  async function removeArt() {
    if (busy || !art) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<CertificateSetting>(`/events/${encodeURIComponent(eventId)}/certificate/art`, {
        method: 'DELETE',
        body: JSON.stringify({ expectedRevision: revision }),
      });
      applySetting(result);
      setNotice('Arte removida. Os certificados passam a aparecer sem imagem de fundo.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover a arte.');
    } finally { setBusy(false); }
  }

  return <div className={styles.page}>
    <section className={styles.panel} aria-labelledby="certificate-setting-title">
      <p className={styles.eyebrow}>CERTIFICADO</p>
      <h2 id="certificate-setting-title">Participação com presença registrada</h2>
      <p>O download não é cobrado. O certificado sai somente para inscrição confirmada com entrada registrada. Não há envio em massa nem certificado de atividade, autoria ou avaliação. O verso é opcional.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <p>Já emitidos neste evento: {issuedCount}. Quem já emitiu mantém a carga horária daquele momento. Novas emissões preservam texto, verso e arte originais. Emissões antigas não ganham verso retroativo.</p>
      <p>O lote em PDF reúne as segundas vias já emitidas, até 40 por arquivo. Não há envio em massa e o download não é cobrado.</p>
      <button className={styles.secondary} type="button" disabled={busy || issuedCount < 1} onClick={() => downloadBatch()}>{busy ? 'Baixando…' : 'Baixar lote em PDF'}</button>
      <section aria-labelledby="certificate-packages-title" aria-busy={historyBusy}>
        <h3 id="certificate-packages-title">Pacotes de participação emitidos</h3>
        <p>Carregue os pacotes anteriores em páginas de até 100. Cada PDF contém somente as emissões daquele pacote, com até 40 certificados e seus versos. Não há nova emissão ao baixar.</p>
        {packagesError && <p role="status">{packagesError}</p>}
        <button type="button" className={styles.secondary} disabled={busy || historyBusy} onClick={() => setPackagesRevision(value => value + 1)}>Atualizar pacotes</button>
        <p role="status">{packages.length} lotes carregados{historyBusy ? ' — carregando…' : ''}.</p>
        {hasOlderPackages && <button type="button" className={styles.secondary} disabled={historyBusy} onClick={() => void loadOlderPackages()}>Carregar lotes anteriores</button>}
        <ul>{packages.map(item => <li key={item.id}><button type="button" className={styles.secondary} disabled={busy} onClick={() => void downloadBatch(item.id)}>Baixar pacote de {new Date(item.createdAt).toLocaleString('pt-BR')} — {item.issuedCount} certificados</button></li>)}</ul>
      </section>
      <form className={styles.form} onSubmit={(event) => void save(event)}>
        <label className={styles.choice}>
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Liberar certificado de participação
        </label>
        <label className={styles.hours}>Carga horária
          <input
            type="number"
            inputMode="numeric"
            step={1}
            min={1}
            max={999}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            aria-describedby="certificate-hours-help"
          />
        </label>
        <p id="certificate-hours-help">Opcional. Use um inteiro de 1 a 999, ou deixe em branco.</p>
        <div className={styles.tags} role="group" aria-label="Tags do certificado">
          {TAGS.map((tag) => <button key={tag} type="button" onClick={() => insertTag(tag)}>{`{${tag}}`}</button>)}
        </div>
        <p>As tags entram no campo de texto que está em uso. Na consulta, {'{NOME}'}, {'{EVENTO}'}, {'{CARGA_HORARIA}'}, {'{DATA}'} e {'{CODIGO}'} viram os dados daquele certificado. Não existe tag de CPF, e-mail ou protocolo.</p>
        <PublicationRichTextField
          id="certificate-title"
          label="Título do certificado"
          help="Formate como na divulgação: negrito, alinhamento, fonte, tamanho e cor da paleta. Se ficar vazio, a Evolvia usa o título padrão."
          value={title}
          onChange={setTitle}
          onFocus={() => setFocus('title')}
          maxLength={TITLE_MAX}
          rows={3}
          disabled={busy}
          required
        />
        <PublicationRichTextField
          id="certificate-body"
          label="Texto do certificado"
          help="Formate como na divulgação: negrito, alinhamento, fonte, tamanho e cor da paleta. Se ficar vazio, a Evolvia usa o texto padrão."
          value={body}
          onChange={setBody}
          onFocus={() => setFocus('body')}
          maxLength={BODY_MAX}
          rows={8}
          disabled={busy}
          required
        />
        <PublicationRichTextField
          id="certificate-back"
          label="Verso do certificado"
          help="Opcional. Se ficar vazio, a consulta não mostra verso. Valem as mesmas tags do texto."
          value={back}
          onChange={setBack}
          onFocus={() => setFocus('back')}
          maxLength={BODY_MAX}
          rows={6}
          disabled={busy}
          optional
        />
        <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar certificado'}</button>
      </form>
      <form className={styles.artForm} onSubmit={(event) => void uploadArt(event)}>
        <h2>Arte do certificado</h2>
        <p>Uma imagem PNG, JPEG ou WebP de até 5 MB. SVG não entra. Enviar de novo substitui a arte anterior. O arquivo fica na Evolvia.</p>
        {preview && <img className={styles.art} src={preview} alt={art?.altText || 'Arte atual do certificado'} />}
        <label className={styles.hours}>Imagem
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseArt} />
        </label>
        <label className={styles.hours}>Texto alternativo
          <input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={180} required={Boolean(file)} />
        </label>
        <div className={styles.tags}>
          <button className={styles.primary} type="submit" disabled={busy || !file}>Enviar arte</button>
          <button className={styles.secondary} type="button" disabled={busy || !art} onClick={() => void removeArt()}>Remover arte</button>
        </div>
      </form>
      <section aria-labelledby="certificate-batch-title">
        <h2 id="certificate-batch-title">Lote de participação</h2>
        <p id="certificate-batch-help">Emite até 40 certificados de inscrições confirmadas, com presença registrada e sem certificado. A carga horária fica gravada nesse momento. Não há e-mail.</p>
        <div className={styles.tags}>
          <button
            className={styles.secondary}
            type="button"
            disabled={busy || !savedEnabled}
            aria-describedby="certificate-batch-help"
            onClick={() => void issueBatch()}
          >
            {busy ? 'Emitindo…' : 'Emitir lote'}
          </button>
        </div>
      </section>
      <ScientificEvaHelp
        context="Certificado de participação"
        intro="A EVA explica a arte, as tags e a liberação. Ela não lê documento, não cobra e não envia dado para fora da Evolvia."
        questions={[
          { question: 'O download é cobrado?', answer: 'Não. Certificado de participação não tem taxa.' },
          { question: 'Quais tags existem?', answer: 'Somente {NOME}, {EVENTO}, {CARGA_HORARIA}, {DATA} e {CODIGO}. Não há tag de CPF, e-mail ou protocolo.' },
          { question: 'A arte sai da Evolvia?', answer: 'Não. A arte fica neste evento e a EVA não envia imagem nem documento para fora da plataforma.' },
          { question: 'O lote envia e-mail?', answer: 'Não. O lote só emite até 40 certificados de quem já teve a presença registrada.' },
        ]}
      />
    </section>
  </div>;
}

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
