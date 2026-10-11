'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import PublicRichText from './public-rich-text';
import styles from './participant-area.module.css';

function modalityWindowNotice(window: { opensAt: string | null; closesAt: string | null } | undefined) {
  if (!window?.opensAt && !window?.closesAt) return '';
  const opens = window.opensAt ? new Date(window.opensAt).toLocaleString('pt-BR') : '';
  const closes = window.closesAt ? new Date(window.closesAt).toLocaleString('pt-BR') : '';
  if (opens && closes) return `Prazo desta modalidade: de ${opens} até ${closes}. A abertura e o encerramento entram no prazo.`;
  if (opens) return `Prazo desta modalidade: a partir de ${opens}, inclusive.`;
  return `Prazo desta modalidade: até ${closes}, inclusive.`;
}

// The server stores block abstracts as "label\ntext" joined by a blank line; a label change makes the old text unmatchable.
export function splitComposedAbstract(text: string, blocks: { code: string; label: string }[]): Record<string, string> {
  text = text.replace(/\r\n/gu, '\n');
  if (!text || blocks.length === 0 || !text.startsWith(`${blocks[0]!.label}\n`)) return {};
  const result: Record<string, string> = {};
  let cursor = blocks[0]!.label.length + 1;
  for (const [index, block] of blocks.entries()) {
    const next = blocks[index + 1];
    const end = next ? text.indexOf(`\n\n${next.label}\n`, cursor) : text.length;
    if (end < 0) return {};
    result[block.code] = text.slice(cursor, end);
    if (next) cursor = end + next.label.length + 3;
  }
  return result;
}

type AuthorConfig = {
  requirePresenter: boolean;
  requireArea: boolean;
  requireSubarea: boolean;
  requireAuthorInstitution: boolean;
  collectAdditionalAuthors?: boolean;
  collectAuthorOrder?: boolean;
  collectAuthorInstitution?: boolean;
  requireSubmitterAsFirstAuthor?: boolean;
  minAuthors: number;
  maxAuthors: number | null;
  maxPresenters: number;
  titleMaxLength: number;
  minKeywords: number;
  maxKeywords: number;
  maxSubmissionsPerAuthor: number;
  collectScientificName: boolean;
  collectInstitutionAddress: boolean;
  collectFundingAgency: boolean;
  collectConflictOfInterest: boolean;
  requirePresentationSuggestion: boolean;
  collectTypedAbstract: boolean;
  collectReferences: boolean;
  abstractCounterUnit: 'CHARACTERS' | 'WORDS';
  abstractMin: number;
  abstractMax: number;
  showProceedingsAuthorization: boolean;
  proceedingsAuthorizationPt: string | null;
  proceedingsAuthorizationEs: string | null;
  proceedingsAuthorizationEn: string | null;
  requireFile?: boolean;
  acceptedWorkUploadEnabled: boolean;
  acceptedWorkUploadDeadline: string | null;
  allowCorrections?: boolean;
  presentationFormats: { code: string; label: string; submissionEnabled: boolean; evaluationEnabled: boolean }[];
};

type AuthorArea = {
  available: boolean;
  reason: string | null;
  config: AuthorConfig | null;
  modalities: { id: string; code?: string; name: string; description: string | null; window?: { opensAt: string | null; closesAt: string | null; blocks: { code: string; label: string; min: number; max: number }[] } }[];
  taxonomy: { id: string; name: string; parentId: string | null; level: 'AREA' | 'SUBAREA' }[];
  submissions: { id: string; title: string; abstractText?: string; keywords?: string[]; status: string; submittedAt: string | null; modalityId?: string; modality: string; currentVersion: number; presentationFormatCode: string | null; taxonomyAreaId?: string | null; taxonomySubareaId?: string | null; hasSubmissionFile?: boolean; submissionFileVersions?: number[]; hasEposter: boolean; hasSecondEposter?: boolean; hasSlide?: boolean; authors: { name: string; email?: string | null; institution?: string; sortOrder: number; presenter: boolean; corresponding?: boolean; isSubmitter?: boolean }[] }[];
};

const SUBMISSION_PDF_LIMIT = 5 * 1024 * 1024;

function readSubmissionPdf(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result.split(',')[1] ?? '' : '';
      if (!content) reject(new Error('Não foi possível ler o PDF da submissão.'));
      else resolve(content);
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o PDF da submissão.'));
    reader.onabort = () => reject(new Error('A leitura do PDF foi interrompida.'));
    reader.readAsDataURL(file);
  });
}

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submetido',
  UNDER_REVIEW: 'Em avaliação',
  ACCEPTED: 'Aceito',
  REJECTED: 'Recusado',
  ACCEPTED_WITH_CHANGES: 'Aceito com alteração',
};

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

export default function ScientificAuthorPanel({ slug, token }: { slug: string; token: string }) {
  const [area, setArea] = useState<AuthorArea | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [letter, setLetter] = useState<{ id: string; kind: 'acceptance' | 'rejection'; headline: string; text: string } | null>(null);
  const [modalityId, setModalityId] = useState('');
  const [title, setTitle] = useState('');
  const [abstractText, setAbstractText] = useState('');
  const [keywords, setKeywords] = useState('');
  const [institution, setInstitution] = useState('');
  const [taxonomyAreaId, setTaxonomyAreaId] = useState('');
  const [taxonomySubareaId, setTaxonomySubareaId] = useState('');
  const [presentationFormatCode, setPresentationFormatCode] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [institutionAddress, setInstitutionAddress] = useState('');
  const [fundingAgency, setFundingAgency] = useState('');
  const [conflictDeclared, setConflictDeclared] = useState('');
  const [conflictDetail, setConflictDetail] = useState('');
  const [referencesText, setReferencesText] = useState('');
  const [proceedingsAccepted, setProceedingsAccepted] = useState(false);
  const [coauthors, setCoauthors] = useState<{ name: string; email: string; institution: string; presenter: boolean; sortOrder: string }[]>([]);
  const [submitterSortOrder, setSubmitterSortOrder] = useState('1');
  const [submitterPresenter, setSubmitterPresenter] = useState(true);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [submissionFileEpoch, setSubmissionFileEpoch] = useState(0);
  const [blockTexts, setBlockTexts] = useState<Record<string, string>>({});
  const requestKey = useRef<string | null>(null);
  const eposterUploading = useRef(false);
  const submissionSending = useRef(false);
  const downloading = useRef(false);
  const targetEpoch = useRef(0);
  const fileEpoch = useRef<number | null>(null);
  const contextKey = `${slug}\n${token}`;
  const liveContext = useRef(contextKey);
  liveContext.current = contextKey;
  const url = `/api/public/events/${encodeURIComponent(slug)}/participant/submissions`;

  function stillCurrent(context: string, epoch?: number) {
    return liveContext.current === context && (epoch === undefined || targetEpoch.current === epoch);
  }

  function invalidateTarget() {
    requestKey.current = null;
    targetEpoch.current += 1;
    fileEpoch.current = null;
    setSubmissionFileEpoch((value) => value + 1);
  }

  function clearForm() {
    setModalityId(''); setTitle(''); setAbstractText(''); setKeywords(''); setInstitution('');
    setTaxonomyAreaId(''); setTaxonomySubareaId(''); setCoauthors([]); setPresentationFormatCode(''); setSubmitterSortOrder('1');
    setSubmitterPresenter(true);
    setScientificName(''); setInstitutionAddress(''); setFundingAgency(''); setRevisionId(null);
    setConflictDeclared(''); setConflictDetail(''); setReferencesText(''); setProceedingsAccepted(false); setBlockTexts({});
  }

  useEffect(() => {
    const controller = new AbortController();
    submissionSending.current = false;
    eposterUploading.current = false;
    downloading.current = false;
    setBusy(false); setArea(null); setError(''); setLetter(null);
    clearForm();
    invalidateTarget();
    fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        const payload = await parseResponse(response);
        if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível carregar trabalhos.');
        if (!controller.signal.aborted) setArea(payload as unknown as AuthorArea);
      })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar trabalhos.'); });
    return () => controller.abort();
  }, [url, token]);

  function edited(setter: (value: string) => void, value: string) {
    requestKey.current = null;
    setter(value);
  }

  function startRevision(item: AuthorArea['submissions'][number]) {
    invalidateTarget();
    setError('');
    setRevisionId(item.id);
    setTitle(item.title);
    setAbstractText(item.abstractText ?? '');
    const blocks = area?.config?.collectTypedAbstract ? area.modalities.find((entry) => entry.id === item.modalityId)?.window?.blocks ?? [] : [];
    setBlockTexts(splitComposedAbstract(item.abstractText ?? '', blocks));
    setKeywords((item.keywords ?? []).join(', '));
    setModalityId(item.modalityId ?? '');
    setPresentationFormatCode(item.presentationFormatCode ?? '');
    setTaxonomyAreaId(item.taxonomyAreaId ?? '');
    setTaxonomySubareaId(item.taxonomySubareaId ?? '');
    const principal = item.authors.find((author) => author.isSubmitter);
    if (!principal) { setError('Atualize a lista de trabalhos para identificar quem fez a submissão.'); return; }
    const others = item.authors.filter((author) => author !== principal);
    setInstitution(principal?.institution ?? '');
    setSubmitterPresenter(principal?.presenter !== false);
    setSubmitterSortOrder(String(principal?.sortOrder ?? 1));
    setCoauthors(others.map((author) => ({
      name: author.name, email: author.email ?? '', institution: author.institution ?? '',
      presenter: author.presenter, sortOrder: String(author.sortOrder),
    })));
  }

  function changeCoauthors(next: { name: string; email: string; institution: string; presenter: boolean; sortOrder: string }[]) {
    requestKey.current = null;
    setCoauthors(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submissionSending.current || !area?.available) return;
    const activeCoauthors = area.config?.collectAdditionalAuthors === false ? [] : coauthors.filter((author) => author.name.trim() || author.email.trim());
    const principalPresents = (area.config?.maxPresenters ?? 1) > 1 ? submitterPresenter : !activeCoauthors.some((author) => author.presenter);
    const presenterCount = Number(principalPresents) + activeCoauthors.filter((author) => author.presenter).length;
    if ((area.config?.requirePresenter && presenterCount < 1) || presenterCount > (area.config?.maxPresenters ?? 1)) {
      setError(`Escolha de ${area.config?.requirePresenter ? 1 : 0} a ${area.config?.maxPresenters ?? 1} apresentadores para o trabalho.`);
      return;
    }
    const asksFile = area.config?.requireFile === true;
    const selectedFile = asksFile ? new FormData(event.currentTarget).get('submissionFile') : null;
    if (asksFile && (!(selectedFile instanceof File) || selectedFile.size === 0)) {
      setError('Anexe o PDF exigido na submissão.');
      return;
    }
    if (selectedFile instanceof File && selectedFile.size > SUBMISSION_PDF_LIMIT) {
      setError('O PDF deve ter no máximo 5 MB.');
      return;
    }
    if (selectedFile instanceof File && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Envie um arquivo PDF com um nome simples, terminado em .pdf.');
      return;
    }
    const context = contextKey;
    const epoch = targetEpoch.current;
    if (asksFile && fileEpoch.current !== epoch) {
      setError('Selecione de novo o PDF deste trabalho.');
      return;
    }
    submissionSending.current = true;
    setBusy(true); setError('');
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const idempotencyKey = requestKey.current;
    const selectedBlocks = area.config?.collectTypedAbstract === false ? [] : area.modalities.find((item) => item.id === modalityId)?.window?.blocks ?? [];
    try {
      const file = selectedFile instanceof File
        ? { contentBase64: await readSubmissionPdf(selectedFile), fileName: selectedFile.name }
        : null;
      if (!stillCurrent(context, epoch)) return;
      const response = await fetch(revisionId ? `${url}/${encodeURIComponent(revisionId)}/versions` : url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
        body: JSON.stringify({
          ...(file ? { file } : {}),
          modalityId, title,
          institution: area.config?.collectAuthorInstitution === false ? '' : institution,
          abstractText: area.config?.collectTypedAbstract === false || selectedBlocks.length > 0 ? '' : abstractText,
          ...(selectedBlocks.length > 0 ? { abstractBlocks: selectedBlocks.map((block) => ({ code: block.code, text: blockTexts[block.code] ?? '' })) } : {}),
          keywords: keywords.split(',').map((word) => word.trim()).filter(Boolean),
          taxonomyAreaId: taxonomyAreaId || null, taxonomySubareaId: taxonomySubareaId || null,
          coauthors: activeCoauthors.map((author) => ({
            name: author.name, email: author.email,
            institution: area.config?.collectAuthorInstitution === false ? '' : author.institution,
            presenter: author.presenter, corresponding: false,
            sortOrder: area.config?.collectAuthorOrder ? Number(author.sortOrder) : undefined,
          })),
          submitterPresenter: principalPresents,
          submitterSortOrder: area.config?.collectAuthorOrder ? Number(area.config.requireSubmitterAsFirstAuthor ? 1 : submitterSortOrder) : undefined,
          presentationFormatCode: area.config?.requirePresentationSuggestion ? presentationFormatCode : null,
          scientificName: area.config?.collectScientificName ? scientificName : '',
          institutionAddress: area.config?.collectInstitutionAddress ? institutionAddress : '',
          fundingAgency: area.config?.collectFundingAgency ? fundingAgency : '',
          conflictDeclared: area.config?.collectConflictOfInterest ? conflictDeclared === 'yes' : null,
          conflictDetail: area.config?.collectConflictOfInterest && conflictDeclared === 'yes' ? conflictDetail : '',
          referencesText: area.config?.collectReferences ? referencesText : '',
          proceedingsAuthorizationAccepted: area.config?.showProceedingsAuthorization ? proceedingsAccepted : false,
        }),
      });
      if (!stillCurrent(context, epoch)) return;
      const payload = await parseResponse(response);
      if (!stillCurrent(context, epoch)) return;
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível enviar o trabalho.');
      if (typeof payload.id !== 'string' || typeof payload.status !== 'string') {
        throw new Error('Não foi possível confirmar a resposta do envio. Consulte seus trabalhos antes de tentar novamente.');
      }
      setArea((previous) => previous ? {
        ...previous,
        submissions: previous.submissions.some((item) => item.id === payload.id) ? previous.submissions.map((item) => item.id === payload.id ? {
          ...item, title, status: payload.status as string,
          submittedAt: typeof payload.submittedAt === 'string' ? payload.submittedAt : item.submittedAt,
          currentVersion: typeof payload.currentVersion === 'number' ? payload.currentVersion : item.currentVersion,
          ...(file ? { hasSubmissionFile: true } : {}),
        } : item) : [
          { id: payload.id as string, title, status: payload.status as string,
            submittedAt: typeof payload.submittedAt === 'string' ? payload.submittedAt : null,
            modality: previous.modalities.find((item) => item.id === modalityId)?.name ?? '', currentVersion: 1,
            presentationFormatCode: area.config?.requirePresentationSuggestion ? presentationFormatCode : null,
            hasSubmissionFile: Boolean(file),
            hasEposter: false,
            authors: [{ name: 'Você', sortOrder: 1, presenter: principalPresents }] },
          ...previous.submissions,
        ],
      } : previous);
      clearForm();
      invalidateTarget();
      try {
        const refreshed = await fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
        if (!stillCurrent(context)) return;
        if (!refreshed.ok) throw new Error('Falha ao atualizar a lista.');
        const next = await parseResponse(refreshed);
        if (!stillCurrent(context)) return;
        if (!Array.isArray(next.submissions)) throw new Error('Resposta de trabalhos inválida.');
        setArea(next as unknown as AuthorArea);
      } catch {
        // A resposta do POST já confirmou o envio e a lista local contém o trabalho.
      }
    } catch (caught) {
      if (stillCurrent(context, epoch)) setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o trabalho.');
    } finally {
      if (stillCurrent(context)) { submissionSending.current = false; setBusy(false); }
    }
  }

  async function downloadSubmissionFile(submissionId: string, versionNumber: number) {
    if (busy || downloading.current) return;
    const context = contextKey;
    downloading.current = true;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${url}/${encodeURIComponent(submissionId)}/versions/${versionNumber}/file`, {
        cache: 'no-store', headers: { authorization: `Bearer ${token}` },
      });
      if (!stillCurrent(context)) return;
      if (!response.ok) {
        const payload = await parseResponse(response);
        throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível baixar o PDF.');
      }
      const bytes = await response.blob();
      if (!stillCurrent(context)) return;
      const file = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = window.document.createElement('a');
      link.href = file;
      link.download = `trabalho-versao-${versionNumber}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(file), 1000);
    } catch (caught) {
      if (stillCurrent(context)) setError(caught instanceof Error ? caught.message : 'Não foi possível baixar o PDF.');
    } finally {
      if (stillCurrent(context)) { downloading.current = false; setBusy(false); }
    }
  }


  async function openLetter(submissionId: string) {
    if (busy) return;
    if (letter?.id === submissionId) { setLetter(null); return; }
    const context = contextKey;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${url}/${encodeURIComponent(submissionId)}/decision-letter`, {
        cache: 'no-store', headers: { authorization: `Bearer ${token}` },
      });
      if (!stillCurrent(context)) return;
      const payload = await parseResponse(response);
      if (!stillCurrent(context)) return;
      const kind = payload.kind === 'rejection' ? 'rejection' : payload.kind === 'acceptance' ? 'acceptance' : null;
      if (!response.ok || !kind || typeof payload.headline !== 'string' || typeof payload.text !== 'string') {
        throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível abrir a carta.');
      }
      setLetter({ id: submissionId, kind, headline: payload.headline, text: payload.text });
    } catch (caught) {
      if (stillCurrent(context)) setError(caught instanceof Error ? caught.message : 'Não foi possível abrir a carta.');
    } finally { if (stillCurrent(context)) setBusy(false); }
  }

  function downloadLetter(title: string, text: string, kind: 'acceptance' | 'rejection') {
    const file = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = window.document.createElement('a');
    link.href = file;
    const prefix = kind === 'rejection' ? 'carta-de-recusa' : 'carta-de-aceite';
    link.download = `${prefix}-${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 40) || 'trabalho'}.txt`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(file), 1000);
  }

  async function uploadEposter(event: FormEvent<HTMLFormElement>, submissionId: string) {
    event.preventDefault();
    if (busy || eposterUploading.current) return;
    const file = new FormData(event.currentTarget).get('eposter');
    if (!(file instanceof File) || file.size === 0) return;
    const context = contextKey;
    eposterUploading.current = true;
    setBusy(true); setError('');
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const content = typeof reader.result === 'string' ? reader.result.split(',')[1] ?? '' : '';
          if (!content) reject(new Error('Não foi possível ler o PDF do ePoster.'));
          else resolve(content);
        };
        reader.onerror = () => reject(new Error('Não foi possível ler o PDF do ePoster.'));
        reader.onabort = () => reject(new Error('A leitura do PDF foi interrompida.'));
        reader.readAsDataURL(file);
      });
      if (!stillCurrent(context)) return;
      const response = await fetch(`${url}/${encodeURIComponent(submissionId)}/eposter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ contentBase64, fileName: file.name }),
      });
      if (!stillCurrent(context)) return;
      const payload = await parseResponse(response);
      if (!stillCurrent(context)) return;
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível enviar o ePoster.');
      setArea((previous) => previous ? {
        ...previous, submissions: previous.submissions.map((item) => item.id === submissionId ? { ...item, hasEposter: true } : item),
      } : previous);
    } catch (caught) {
      if (stillCurrent(context)) setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o ePoster.');
    } finally {
      if (stillCurrent(context)) {
        eposterUploading.current = false;
        setBusy(false);
      }
    }
  }

  async function uploadFollowUp(event: FormEvent<HTMLFormElement>, submissionId: string, kind: 'second' | 'slide') {
    event.preventDefault();
    if (busy || eposterUploading.current) return;
    const form = event.currentTarget;
    const file = new FormData(form).get(kind);
    if (!(file instanceof File) || file.size === 0) return;
    const context = contextKey;
    eposterUploading.current = true;
    setBusy(true); setError('');
    const path = kind === 'second' ? 'eposter/second' : 'slide';
    const failure = kind === 'second' ? 'Não foi possível enviar a segunda versão.' : 'Não foi possível enviar o slide.';
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const content = typeof reader.result === 'string' ? reader.result.split(',')[1] ?? '' : '';
          if (!content) reject(new Error(failure));
          else resolve(content);
        };
        reader.onerror = () => reject(new Error(failure));
        reader.onabort = () => reject(new Error('A leitura do PDF foi interrompida.'));
        reader.readAsDataURL(file);
      });
      if (!stillCurrent(context)) return;
      const response = await fetch(`${url}/${encodeURIComponent(submissionId)}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ contentBase64, fileName: file.name }),
      });
      if (!stillCurrent(context)) return;
      const payload = await parseResponse(response);
      if (!stillCurrent(context)) return;
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : failure);
      form.reset();
      setArea((previous) => previous ? {
        ...previous,
        submissions: previous.submissions.map((item) => item.id === submissionId ? {
          ...item,
          ...(kind === 'second' ? { hasSecondEposter: true } : { hasSlide: true }),
        } : item),
      } : previous);
    } catch (caught) {
      if (stillCurrent(context)) setError(caught instanceof Error ? caught.message : failure);
    } finally {
      if (stillCurrent(context)) {
        eposterUploading.current = false;
        setBusy(false);
      }
    }
  }

  const areas = area?.taxonomy.filter((node) => node.level === 'AREA') ?? [];
  const subareas = area?.taxonomy.filter((node) => node.level === 'SUBAREA' && node.parentId === taxonomyAreaId) ?? [];
  const enabledFormats = area?.config?.presentationFormats.filter((item) => item.submissionEnabled) ?? [];
  const formatCodes = new Set(enabledFormats.map((item) => item.code));
  const formatChoices = area?.modalities.filter((item) => item.code && formatCodes.has(item.code)) ?? [];
  const modalityChoices = formatChoices.length ? formatChoices : area?.modalities ?? [];
  const modalityIsFormat = formatChoices.length > 0;
  const asksCoauthors = !!area?.config && area.config.collectAdditionalAuthors !== false && (area.config.maxAuthors == null || area.config.maxAuthors > 1);
  const maxAdditionalAuthors = Math.max(0, Math.min(19, (area?.config?.maxAuthors ?? 20) - 1));
  const asksInstitution = area?.config?.collectAuthorInstitution !== false;
  const asksOrder = area?.config?.collectAuthorOrder === true;
  const selectedModality = modalityChoices.find((item) => item.id === modalityId);
  const selectedBlocks = area?.config?.collectTypedAbstract ? selectedModality?.window?.blocks ?? [] : [];
  const windowNotice = modalityWindowNotice(selectedModality?.window);

  return <section className={styles.scientific} aria-labelledby="author-title">
    <h2 id="author-title">Meus trabalhos científicos</h2>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!area && !error && <p>Carregando submissões…</p>}
    {area && <>
      {area.config?.acceptedWorkUploadEnabled && area.submissions.some((item) => item.status === 'ACCEPTED' || item.status === 'ACCEPTED_WITH_CHANGES') && <p>A EVA guarda a primeira versão do arquivo aceito neste trabalho. A segunda versão e o slide ficam na plataforma e não são enviados para fora.</p>}
      {area.submissions.length > 0 ? <ul className={styles.submissions}>
        {area.submissions.map((item) => {
          const accepted = item.status === 'ACCEPTED' || item.status === 'ACCEPTED_WITH_CHANGES';
          const uploadOpen = Boolean(area.config?.acceptedWorkUploadEnabled) && accepted;
          const poster = uploadOpen && item.presentationFormatCode === 'EPOSTER';
          return <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.modality} · {STATUS_LABEL[item.status] ?? item.status} · versão {item.currentVersion}</span>
          {item.hasSubmissionFile && <span>PDF da submissão anexado</span>}
          {(item.submissionFileVersions ?? []).map((version) => <button key={version} type="button" disabled={busy} aria-label={`Baixar PDF da versão ${version} de ${item.title}`} onClick={() => void downloadSubmissionFile(item.id, version)}>Baixar PDF da versão {version}</button>)}
          {(item.status === 'ACCEPTED' || item.status === 'ACCEPTED_WITH_CHANGES' || item.status === 'REJECTED') && <button type="button" disabled={busy} onClick={() => void openLetter(item.id)}>{item.status === 'REJECTED' ? 'Ver carta de recusa' : 'Ver carta de aceite'}</button>}
          {letter?.id === item.id && <div className={styles.letter}>
            <h3>{letter.headline}</h3>
            <PublicRichText text={letter.text} />
            <button type="button" onClick={() => downloadLetter(item.title, letter.text, letter.kind)}>Baixar carta (.txt)</button>
          </div>}
          {item.authors.length > 1 && <span>{item.authors.map((author) => author.name).join(', ')}</span>}
          {poster && <form aria-busy={busy} onSubmit={(event) => void uploadEposter(event, item.id)}>
            <label>{item.hasEposter ? 'Substituir ePoster (PDF)' : 'Enviar ePoster (PDF)'}{area.config?.acceptedWorkUploadDeadline ? ` até ${new Date(area.config.acceptedWorkUploadDeadline).toLocaleString('pt-BR')}` : ''}<input name="eposter" disabled={busy} type="file" accept="application/pdf,.pdf" required /></label>
            <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar PDF'}</button>
          </form>}
          {area.config?.allowCorrections && ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED_WITH_CHANGES'].includes(item.status) && <button type="button" disabled={busy} onClick={() => startRevision(item)}>Corrigir este trabalho</button>}
          {poster && item.hasEposter && <form aria-busy={busy} onSubmit={(event) => void uploadFollowUp(event, item.id, 'second')}>
            <label>{item.hasSecondEposter ? 'Substituir segunda versão (PDF)' : 'Enviar segunda versão (PDF)'}<input name="second" disabled={busy} type="file" accept="application/pdf,.pdf" required /></label>
            <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar segunda versão'}</button>
          </form>}
          {uploadOpen && <form aria-busy={busy} onSubmit={(event) => void uploadFollowUp(event, item.id, 'slide')}>
            <label>{item.hasSlide ? 'Substituir slide (PDF)' : 'Enviar slide (PDF)'}<input name="slide" disabled={busy} type="file" accept="application/pdf,.pdf" required /></label>
            <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar slide'}</button>
          </form>}
        </li>;
        })}
      </ul> : <p>Você ainda não enviou trabalhos neste evento.</p>}
      {!area.available && <p role="status">{area.reason}</p>}
      {area.available && area.config && area.submissions.length >= area.config.maxSubmissionsPerAuthor && <p role="status">Você atingiu o limite de trabalhos deste evento.</p>}
      {area.available && area.config && (revisionId || area.submissions.length < area.config.maxSubmissionsPerAuthor) && <form className={styles.form} onSubmit={submit}>
        <h3>{revisionId ? 'Corrigir este trabalho' : 'Enviar um trabalho'}</h3>
        {revisionId && <p>A versão anterior e os pareceres dela permanecem. A nova versão volta para submissão e precisa ser distribuída de novo.</p>}
        <p>{area.config.minAuthors <= 1
          ? 'Quem envia a inscrição já conta como autor. Outros autores só entram se o evento pedir.'
          : `Este evento pede pelo menos ${area.config.minAuthors} autores. Quem envia a inscrição já entra na lista.`}</p>
        {asksOrder && <label>Sua ordem de autoria<input required type="number" min={1} max={20} value={area.config.requireSubmitterAsFirstAuthor ? '1' : submitterSortOrder} disabled={area.config.requireSubmitterAsFirstAuthor} onChange={(event) => { requestKey.current = null; setSubmitterSortOrder(event.target.value); }} /></label>}
        {asksCoauthors && area.config.maxPresenters > 1 && <label><input type="checkbox" disabled={busy} checked={submitterPresenter} onChange={(event) => { requestKey.current = null; setSubmitterPresenter(event.target.checked); }} /> Eu também apresento o trabalho (até {area.config.maxPresenters} apresentadores)</label>}
        {asksCoauthors && <fieldset>
          <legend>Coautores {area.config.minAuthors > 1 ? `(mínimo de ${area.config.minAuthors} autores no total)` : ''}</legend>
          {coauthors.map((author, index) => <div key={index}>
            <label>Nome<input required minLength={2} maxLength={120} value={author.name} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
            <label>E-mail<input required type="email" maxLength={160} value={author.email} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} /></label>
            {asksInstitution && <label>Instituição<input required={area.config?.requireAuthorInstitution} maxLength={160} value={author.institution} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, institution: event.target.value } : item))} /></label>}
            {asksOrder && <label>Ordem<input required type="number" min={1} max={20} value={author.sortOrder} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, sortOrder: event.target.value } : item))} /></label>}
            <label><input type="checkbox" checked={author.presenter} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, presenter: event.target.checked } : item))} /> Apresenta o trabalho</label>
            <button type="button" aria-label={`Remover coautor ${index + 2}`} onClick={() => changeCoauthors(coauthors.filter((_, itemIndex) => itemIndex !== index))}>Remover coautor</button>
          </div>)}
          <button type="button" disabled={busy || coauthors.length >= maxAdditionalAuthors} onClick={() => changeCoauthors(coauthors.length >= maxAdditionalAuthors ? coauthors : [...coauthors, { name: '', email: '', institution: '', presenter: false, sortOrder: String(coauthors.length + 2) }])}>Adicionar coautor</button>
        </fieldset>}
        <label>Modalidade<select required value={modalityId} disabled={Boolean(revisionId)} onChange={(event) => {
          const value = event.target.value;
          invalidateTarget();
          setModalityId(value);
          setBlockTexts({});
          const selected = modalityChoices.find((item) => item.id === value);
          if (area.config?.requirePresentationSuggestion && selected?.code && formatCodes.has(selected.code)) setPresentationFormatCode(selected.code);
          else if (!modalityIsFormat) setPresentationFormatCode('');
        }}>
          <option value="">Selecione</option>{modalityChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {windowNotice && <p role="status">{windowNotice}</p>}
        <label>Título<input required minLength={5} maxLength={area.config.titleMaxLength} value={title} onChange={(event) => edited(setTitle, event.target.value)} /></label>
        {!modalityIsFormat && area.config.requirePresentationSuggestion && <label>Sugestão de apresentação<select required value={presentationFormatCode} onChange={(event) => edited(setPresentationFormatCode, event.target.value)}>
          <option value="">Selecione</option>{enabledFormats.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select></label>}
        {area.config.collectTypedAbstract && selectedBlocks.length === 0 && <label>Resumo ({area.config.abstractCounterUnit === 'WORDS' ? 'palavras' : 'caracteres'}: {area.config.abstractMin} a {area.config.abstractMax}; agora {area.config.abstractCounterUnit === 'WORDS' ? (abstractText.trim() ? abstractText.trim().split(/\s+/u).length : 0) : abstractText.length})
          <textarea required minLength={area.config.abstractCounterUnit === 'CHARACTERS' ? area.config.abstractMin : undefined} maxLength={20000} rows={7} value={abstractText} onChange={(event) => edited(setAbstractText, event.target.value)} />
        </label>}
        {area.config.collectTypedAbstract && selectedBlocks.length > 0 && <fieldset>
          <legend>Blocos do resumo</legend>
          {revisionId && abstractText ? <p className={styles.previousAbstract}>Resumo da versão anterior:<br />{abstractText}</p> : null}
          {selectedBlocks.map((block) => {
            const value = blockTexts[block.code] ?? '';
            const count = area.config?.abstractCounterUnit === 'WORDS' ? (value.trim() ? value.trim().split(/\s+/u).length : 0) : value.length;
            return <label key={block.code}>{block.label} ({area.config?.abstractCounterUnit === 'WORDS' ? 'palavras' : 'caracteres'}: {block.min} a {block.max}; agora {count})
              <textarea required maxLength={20000} rows={4} value={value} onChange={(event) => { const nextValue = event.target.value; requestKey.current = null; setBlockTexts((current) => ({ ...current, [block.code]: nextValue })); }} />
            </label>;
          })}
        </fieldset>}
        {area.config.collectReferences && <label>Referências bibliográficas<textarea required minLength={2} maxLength={8000} rows={4} value={referencesText} onChange={(event) => edited(setReferencesText, event.target.value)} /></label>}
        <label>Palavras-chave (separe por vírgula; {area.config.minKeywords} a {area.config.maxKeywords})
          <input required value={keywords} onChange={(event) => edited(setKeywords, event.target.value)} />
        </label>
        {asksInstitution && <label>Instituição<input required={area.config.requireAuthorInstitution} minLength={area.config.requireAuthorInstitution ? 2 : undefined} maxLength={160} value={institution} onChange={(event) => edited(setInstitution, event.target.value)} /></label>}
        {area.config.collectInstitutionAddress && <label>Endereço da instituição<input required minLength={5} maxLength={240} value={institutionAddress} onChange={(event) => edited(setInstitutionAddress, event.target.value)} /></label>}
        {area.config.collectScientificName && <label>Nome científico<input required minLength={2} maxLength={120} value={scientificName} onChange={(event) => edited(setScientificName, event.target.value)} /></label>}
        {area.config.collectFundingAgency && <label>Agência de fomento<input maxLength={160} value={fundingAgency} onChange={(event) => edited(setFundingAgency, event.target.value)} /></label>}
        {area.config.collectConflictOfInterest && <label>Conflito de interesse?<select required value={conflictDeclared} onChange={(event) => edited(setConflictDeclared, event.target.value)}>
          <option value="">Selecione</option><option value="no">Não</option><option value="yes">Sim</option>
        </select></label>}
        {area.config.collectConflictOfInterest && conflictDeclared === 'yes' && <label>Descreva o conflito<textarea required minLength={3} maxLength={500} value={conflictDetail} onChange={(event) => edited(setConflictDetail, event.target.value)} /></label>}
        {area.config.showProceedingsAuthorization && <label><input type="checkbox" required checked={proceedingsAccepted} onChange={(event) => { requestKey.current = null; setProceedingsAccepted(event.target.checked); }} /> {area.config.proceedingsAuthorizationPt}</label>}
        {area.config.showProceedingsAuthorization && area.config.proceedingsAuthorizationEs && <p>{area.config.proceedingsAuthorizationEs}</p>}
        {area.config.showProceedingsAuthorization && area.config.proceedingsAuthorizationEn && <p>{area.config.proceedingsAuthorizationEn}</p>}
        {(area.config.requireArea || areas.length > 0) && <label>Área científica<select required={area.config.requireArea} value={taxonomyAreaId} onChange={(event) => { edited(setTaxonomyAreaId, event.target.value); setTaxonomySubareaId(''); }}>
          <option value="">Selecione</option>{areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
        {(area.config.requireSubarea || subareas.length > 0) && <label>Subárea científica<select required={area.config.requireSubarea} disabled={!taxonomyAreaId} value={taxonomySubareaId} onChange={(event) => edited(setTaxonomySubareaId, event.target.value)}>
          <option value="">Selecione</option>{subareas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
        {area.config.requireFile && <label>PDF do trabalho
          <input key={submissionFileEpoch} name="submissionFile" type="file" accept="application/pdf,.pdf" required disabled={busy} onChange={() => { requestKey.current = null; fileEpoch.current = targetEpoch.current; }} />
        </label>}
        {area.config.requireFile && <p>PDF simples de até 5 MB. Ele fica guardado na Evolvia e não é executado. O ePoster, quando o evento pedir, entra só depois do aceite.</p>}
        <button type="submit" disabled={busy}>{busy ? 'Enviando…' : revisionId ? 'Enviar nova versão' : 'Submeter trabalho'}</button>
        {revisionId && <button type="button" disabled={busy} onClick={() => { invalidateTarget(); clearForm(); }}>Cancelar correção</button>}
      </form>}
    </>}
  </section>;
}

