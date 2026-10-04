'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import styles from './participant-area.module.css';

type AuthorConfig = {
  requireArea: boolean;
  requireSubarea: boolean;
  requireAuthorInstitution: boolean;
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
  modalities: { id: string; name: string; description: string | null }[];
  taxonomy: { id: string; name: string; parentId: string | null; level: 'AREA' | 'SUBAREA' }[];
  submissions: { id: string; title: string; status: string; submittedAt: string | null; modality: string; currentVersion: number }[];
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
          modalityId, title, institution,
          abstractText: area.config?.collectTypedAbstract === false ? '' : abstractText,
          keywords: keywords.split(',').map((word) => word.trim()).filter(Boolean),
          taxonomyAreaId: taxonomyAreaId || null, taxonomySubareaId: taxonomySubareaId || null,
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
            modality: previous.modalities.find((item) => item.id === modalityId)?.name ?? '', currentVersion: 1 },
          ...previous.submissions,
        ],
      } : previous);
      requestKey.current = null;
      setModalityId(''); setTitle(''); setAbstractText(''); setKeywords(''); setInstitution('');
      setTaxonomyAreaId(''); setTaxonomySubareaId(''); setPresentationFormatCode('');
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

  return <section className={styles.scientific} aria-labelledby="author-title">
    <h2 id="author-title">Meus trabalhos científicos</h2>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!area && !error && <p>Carregando submissões…</p>}
    {area && <>
      {area.config?.acceptedWorkUploadEnabled && area.submissions.some((item) => item.status === 'ACCEPTED') && <p role="status">O trabalho aceito pode receber o e-pôster{area.config.acceptedWorkUploadDeadline ? ` até ${new Date(area.config.acceptedWorkUploadDeadline).toLocaleString('pt-BR')}` : ''}. O envio do arquivo PDF abre no corte do arquivo.</p>}
      {area.submissions.length > 0 ? <ul className={styles.submissions}>
        {area.submissions.map((item) => <li key={item.id}>
          <strong>{item.title}</strong><span>{item.modality} · {item.status === 'SUBMITTED' ? 'Submetido' : item.status} · versão {item.currentVersion}</span>
        </li>)}
      </ul> : <p>Você ainda não enviou trabalhos neste evento.</p>}
      {!area.available && <p role="status">{area.reason}</p>}
      {area.available && area.config && area.submissions.length >= area.config.maxSubmissionsPerAuthor && <p role="status">Você atingiu o limite de trabalhos deste evento.</p>}
      {area.available && area.config && area.submissions.length < area.config.maxSubmissionsPerAuthor && <form className={styles.form} onSubmit={submit}>
        <h3>Enviar um trabalho</h3>
        <p>O nome do autor vem da sua inscrição. O envio registra a primeira versão do trabalho.</p>
        <label>Modalidade<select required value={modalityId} onChange={(event) => edited(setModalityId, event.target.value)}>
          <option value="">Selecione</option>{area.modalities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Título<input required minLength={5} maxLength={area.config.titleMaxLength} value={title} onChange={(event) => edited(setTitle, event.target.value)} /></label>
        {area.config.requirePresentationSuggestion && <label>Sugestão de apresentação<select required value={presentationFormatCode} onChange={(event) => edited(setPresentationFormatCode, event.target.value)}>
          <option value="">Selecione</option>{area.config.presentationFormats.filter((item) => item.submissionEnabled).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select></label>}
        {area.config.collectTypedAbstract && <label>Resumo ({area.config.abstractCounterUnit === 'WORDS' ? 'palavras' : 'caracteres'}: {area.config.abstractMin} a {area.config.abstractMax}; agora {area.config.abstractCounterUnit === 'WORDS' ? (abstractText.trim() ? abstractText.trim().split(/\s+/u).length : 0) : abstractText.length})
          <textarea required minLength={area.config.abstractCounterUnit === 'CHARACTERS' ? area.config.abstractMin : undefined} maxLength={20000} rows={7} value={abstractText} onChange={(event) => edited(setAbstractText, event.target.value)} />
        </label>}
        {area.config.collectReferences && <label>Referências bibliográficas<textarea required minLength={2} maxLength={8000} rows={4} value={referencesText} onChange={(event) => edited(setReferencesText, event.target.value)} /></label>}
        <label>Palavras-chave (separe por vírgula; {area.config.minKeywords} a {area.config.maxKeywords})
          <input required value={keywords} onChange={(event) => edited(setKeywords, event.target.value)} />
        </label>
        <label>Instituição<input required={area.config.requireAuthorInstitution} minLength={area.config.requireAuthorInstitution ? 2 : undefined} maxLength={160} value={institution} onChange={(event) => edited(setInstitution, event.target.value)} /></label>
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
