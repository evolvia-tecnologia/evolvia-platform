'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import styles from './participant-area.module.css';

type AuthorConfig = {
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
  acceptedWorkUploadEnabled: boolean;
  acceptedWorkUploadDeadline: string | null;
  presentationFormats: { code: string; label: string; submissionEnabled: boolean; evaluationEnabled: boolean }[];
};

type AuthorArea = {
  available: boolean;
  reason: string | null;
  config: AuthorConfig | null;
  modalities: { id: string; code?: string; name: string; description: string | null }[];
  taxonomy: { id: string; name: string; parentId: string | null; level: 'AREA' | 'SUBAREA' }[];
  submissions: { id: string; title: string; status: string; submittedAt: string | null; modality: string; currentVersion: number; presentationFormatCode: string | null; hasEposter: boolean; authors: { name: string; sortOrder: number; presenter: boolean }[] }[];
};

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
  const requestKey = useRef<string | null>(null);
  const url = `/api/public/events/${encodeURIComponent(slug)}/participant/submissions`;

  useEffect(() => {
    const controller = new AbortController();
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

  function changeCoauthors(next: { name: string; email: string; institution: string; presenter: boolean; sortOrder: string }[]) {
    requestKey.current = null;
    setCoauthors(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !area?.available) return;
    setBusy(true); setError('');
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': requestKey.current },
        body: JSON.stringify({
          modalityId, title,
          institution: area.config?.collectAuthorInstitution === false ? '' : institution,
          abstractText: area.config?.collectTypedAbstract === false ? '' : abstractText,
          keywords: keywords.split(',').map((word) => word.trim()).filter(Boolean),
          taxonomyAreaId: taxonomyAreaId || null, taxonomySubareaId: taxonomySubareaId || null,
          coauthors: area.config?.collectAdditionalAuthors === false ? [] : coauthors.filter((author) => author.name.trim() || author.email.trim()).map((author) => ({
            name: author.name, email: author.email,
            institution: area.config?.collectAuthorInstitution === false ? '' : author.institution,
            presenter: author.presenter, corresponding: false,
            sortOrder: area.config?.collectAuthorOrder ? Number(author.sortOrder) : undefined,
          })),
          submitterPresenter: !coauthors.some((author) => author.presenter),
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
      const payload = await parseResponse(response);
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível enviar o trabalho.');
      if (typeof payload.id !== 'string' || typeof payload.status !== 'string') {
        throw new Error('Não foi possível confirmar a resposta do envio. Consulte seus trabalhos antes de tentar novamente.');
      }
      setArea((previous) => previous ? {
        ...previous,
        submissions: previous.submissions.some((item) => item.id === payload.id) ? previous.submissions : [
          { id: payload.id as string, title, status: payload.status as string,
            submittedAt: typeof payload.submittedAt === 'string' ? payload.submittedAt : null,
            modality: previous.modalities.find((item) => item.id === modalityId)?.name ?? '', currentVersion: 1,
            presentationFormatCode: area.config?.requirePresentationSuggestion ? presentationFormatCode : null,
            hasEposter: false,
            authors: [{ name: 'Você', sortOrder: 1, presenter: !coauthors.some((author) => author.presenter) }] },
          ...previous.submissions,
        ],
      } : previous);
      requestKey.current = null;
      setModalityId(''); setTitle(''); setAbstractText(''); setKeywords(''); setInstitution('');
      setTaxonomyAreaId(''); setTaxonomySubareaId(''); setCoauthors([]); setPresentationFormatCode(''); setSubmitterSortOrder('1');
      setScientificName(''); setInstitutionAddress(''); setFundingAgency('');
      setConflictDeclared(''); setConflictDetail(''); setReferencesText(''); setProceedingsAccepted(false);
      try {
        const refreshed = await fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
        if (!refreshed.ok) throw new Error('Falha ao atualizar a lista.');
        const next = await parseResponse(refreshed);
        if (!Array.isArray(next.submissions)) throw new Error('Resposta de trabalhos inválida.');
        setArea(next as unknown as AuthorArea);
      } catch {
        // A resposta do POST já confirmou o envio e a lista local contém o trabalho.
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o trabalho.'); }
    finally { setBusy(false); }
  }

  const areas = area?.taxonomy.filter((node) => node.level === 'AREA') ?? [];
  const subareas = area?.taxonomy.filter((node) => node.level === 'SUBAREA' && node.parentId === taxonomyAreaId) ?? [];
  const enabledFormats = area?.config?.presentationFormats.filter((item) => item.submissionEnabled) ?? [];
  const formatCodes = new Set(enabledFormats.map((item) => item.code));
  const formatChoices = area?.modalities.filter((item) => item.code && formatCodes.has(item.code)) ?? [];
  const modalityChoices = formatChoices.length ? formatChoices : area?.modalities ?? [];
  const modalityIsFormat = formatChoices.length > 0;
  const asksCoauthors = !!area?.config && area.config.collectAdditionalAuthors !== false && (area.config.maxAuthors == null || area.config.maxAuthors > 1);
  const asksInstitution = area?.config?.collectAuthorInstitution !== false;
  const asksOrder = area?.config?.collectAuthorOrder === true;

  return <section className={styles.scientific} aria-labelledby="author-title">
    <h2 id="author-title">Meus trabalhos científicos</h2>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!area && !error && <p>Carregando submissões…</p>}
    {area && <>
      {area.submissions.length > 0 ? <ul className={styles.submissions}>
        {area.submissions.map((item) => <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.modality} · {STATUS_LABEL[item.status] ?? item.status} · versão {item.currentVersion}</span>
          {item.authors.length > 1 && <span>{item.authors.map((author) => author.name).join(', ')}</span>}
          {area.config?.acceptedWorkUploadEnabled && item.presentationFormatCode === 'EPOSTER' && (item.status === 'ACCEPTED' || item.status === 'ACCEPTED_WITH_CHANGES') && <form onSubmit={(event) => {
            event.preventDefault();
            const file = new FormData(event.currentTarget).get('eposter');
            if (!(file instanceof File) || file.size === 0) return;
            const reader = new FileReader();
            reader.onload = () => {
              const content = typeof reader.result === 'string' ? reader.result.split(',')[1] ?? '' : '';
              void fetch(`${url}/${encodeURIComponent(item.id)}/eposter`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ contentBase64: content, fileName: file.name }),
              }).then(async (response) => {
                const payload = await parseResponse(response);
                if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível enviar o ePoster.');
                const refreshed = await fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
                if (refreshed.ok) setArea(await parseResponse(refreshed) as unknown as AuthorArea);
              }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o ePoster.'));
            };
            reader.readAsDataURL(file);
          }}>
            <label>{item.hasEposter ? 'Substituir ePoster (PDF)' : 'Enviar ePoster (PDF)'}{area.config?.acceptedWorkUploadDeadline ? ` até ${new Date(area.config.acceptedWorkUploadDeadline).toLocaleString('pt-BR')}` : ''}<input name="eposter" type="file" accept="application/pdf,.pdf" required /></label>
            <button type="submit">Enviar PDF</button>
          </form>}
        </li>)}
      </ul> : <p>Você ainda não enviou trabalhos neste evento.</p>}
      {!area.available && <p role="status">{area.reason}</p>}
      {area.available && area.config && area.submissions.length >= area.config.maxSubmissionsPerAuthor && <p role="status">Você atingiu o limite de trabalhos deste evento.</p>}
      {area.available && area.config && area.submissions.length < area.config.maxSubmissionsPerAuthor && <form className={styles.form} onSubmit={submit}>
        <h3>Enviar um trabalho</h3>
        <p>{area.config.minAuthors <= 1
          ? 'Quem envia a inscrição já conta como autor. Outros autores só entram se o evento pedir.'
          : `Este evento pede pelo menos ${area.config.minAuthors} autores. Quem envia a inscrição já entra na lista.`}</p>
        {asksOrder && <label>Sua ordem de autoria<input required type="number" min={1} max={20} value={area.config.requireSubmitterAsFirstAuthor ? '1' : submitterSortOrder} disabled={area.config.requireSubmitterAsFirstAuthor} onChange={(event) => { requestKey.current = null; setSubmitterSortOrder(event.target.value); }} /></label>}
        {asksCoauthors && <fieldset>
          <legend>Coautores {area.config.minAuthors > 1 ? `(mínimo de ${area.config.minAuthors} autores no total)` : ''}</legend>
          {coauthors.map((author, index) => <div key={index}>
            <label>Nome<input required minLength={2} maxLength={120} value={author.name} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
            <label>E-mail<input required type="email" maxLength={160} value={author.email} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} /></label>
            {asksInstitution && <label>Instituição<input required={area.config?.requireAuthorInstitution} maxLength={160} value={author.institution} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, institution: event.target.value } : item))} /></label>}
            {asksOrder && <label>Ordem<input required type="number" min={1} max={20} value={author.sortOrder} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, sortOrder: event.target.value } : item))} /></label>}
            <label><input type="checkbox" checked={author.presenter} onChange={(event) => changeCoauthors(coauthors.map((item, itemIndex) => itemIndex === index ? { ...item, presenter: event.target.checked } : item))} /> Apresenta o trabalho</label>
          </div>)}
          <button type="button" onClick={() => changeCoauthors(coauthors.length >= 8 ? coauthors : [...coauthors, { name: '', email: '', institution: '', presenter: false, sortOrder: String(coauthors.length + 2) }])}>Adicionar coautor</button>
        </fieldset>}
        <label>Modalidade<select required value={modalityId} onChange={(event) => {
          const value = event.target.value;
          requestKey.current = null;
          setModalityId(value);
          const selected = modalityChoices.find((item) => item.id === value);
          if (area.config?.requirePresentationSuggestion && selected?.code && formatCodes.has(selected.code)) setPresentationFormatCode(selected.code);
          else if (!modalityIsFormat) setPresentationFormatCode('');
        }}>
          <option value="">Selecione</option>{modalityChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Título<input required minLength={5} maxLength={area.config.titleMaxLength} value={title} onChange={(event) => edited(setTitle, event.target.value)} /></label>
        {!modalityIsFormat && area.config.requirePresentationSuggestion && <label>Sugestão de apresentação<select required value={presentationFormatCode} onChange={(event) => edited(setPresentationFormatCode, event.target.value)}>
          <option value="">Selecione</option>{enabledFormats.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select></label>}
        {area.config.collectTypedAbstract && <label>Resumo ({area.config.abstractCounterUnit === 'WORDS' ? 'palavras' : 'caracteres'}: {area.config.abstractMin} a {area.config.abstractMax}; agora {area.config.abstractCounterUnit === 'WORDS' ? (abstractText.trim() ? abstractText.trim().split(/\s+/u).length : 0) : abstractText.length})
          <textarea required minLength={area.config.abstractCounterUnit === 'CHARACTERS' ? area.config.abstractMin : undefined} maxLength={20000} rows={7} value={abstractText} onChange={(event) => edited(setAbstractText, event.target.value)} />
        </label>}
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
        <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Submeter trabalho'}</button>
      </form>}
    </>}
  </section>;
}
