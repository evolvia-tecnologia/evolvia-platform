'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import { localDateTimeInputValue } from '../lib/event-time-zone';
import ScientificDecisionLetters from './scientific-decision-letters';
import ScientificStationPanel from './scientific-station-panel';
import styles from './scientific-submissions.module.css';

type ReviewMode = 'OPEN' | 'SINGLE_BLIND' | 'DOUBLE_BLIND';
type CounterUnit = 'CHARACTERS' | 'WORDS';
type EvaluationStyle = 'ANALYTIC' | 'SYNTHETIC';
type PresentationFormat = { code: string; label: string; submissionEnabled: boolean; evaluationEnabled: boolean };
type SubmissionStatus = 'DRAFT' | 'INCOMPLETE' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'ACCEPTED_WITH_CHANGES';
type SummaryBlock = { code: string; label: string; min: number; max: number };
type SummaryBlockDraft = SummaryBlock & { editorKey: string };
type ModalityWindow = { opensAt: string | null; closesAt: string | null; blocks: SummaryBlock[] };
type Modality = { id: string; code?: string; name: string; description: string | null; active: boolean; window?: ModalityWindow };
type Submission = {
  id: string;
  title: string;
  status: SubmissionStatus;
  currentVersion: number;
  modality: Modality;
  authors: { id: string }[];
};

type Payload = {
  event: { id: string; name: string; status: string };
  config: {
    requireArea: boolean;
    requireSubarea: boolean;
    requireFile: boolean;
    maxSubmissionsPerAuthor: number;
    minAuthors: number;
    maxAuthors: number | null;
    requirePresenter: boolean;
    requireCorrespondingAuthor: boolean;
    requireAuthorInstitution: boolean;
    collectAdditionalAuthors: boolean;
    collectAuthorOrder: boolean;
    collectAuthorInstitution: boolean;
    titleMaxLength: number;
    minKeywords: number;
    maxKeywords: number;
    presentationFormats: PresentationFormat[];
    reviewMode: ReviewMode;
    allowCorrections: boolean;
    maxPresenters: number;
    collectScientificName: boolean;
    collectInstitutionAddress: boolean;
    collectFundingAgency: boolean;
    collectConflictOfInterest: boolean;
    requireSubmitterAsFirstAuthor: boolean;
    requirePresentationSuggestion: boolean;
    collectTypedAbstract: boolean;
    collectReferences: boolean;
    abstractCounterUnit: CounterUnit;
    abstractMin: number;
    abstractMax: number;
    showProceedingsAuthorization: boolean;
    proceedingsAuthorizationPt: string | null;
    proceedingsAuthorizationEs: string | null;
    proceedingsAuthorizationEn: string | null;
    reviewersPerSubmission: number | null;
    coordinatorDecidesStatus: boolean;
    evaluationStyle: EvaluationStyle;
    acceptedWorkUploadEnabled: boolean;
    acceptedWorkUploadDeadline: string | null;
    acceptanceLetterBody: string | null;
    rejectionLetterBody: string | null;
  };
  presentationFormatsSaved: boolean;
  modalities: Modality[];
  taxonomy: { id: string; name: string; parentId: string | null; level: 'AREA' | 'SUBAREA' }[];
  submissions: Submission[];
  decisionDeliveries?: {
    id: string;
    kind: 'ACCEPTANCE' | 'REJECTION';
    action: 'VIEWED' | 'DOWNLOADED';
    createdAt: string;
    documentHash: string;
    submission: { title: string };
  }[];
  summary: { total: number; drafts: number; submitted: number };
  actorBoundary: { management: 'ORGANIZER'; authorActionsAvailableHere: false; message: string };
  nextAction: string;
};

const statusLabel: Record<SubmissionStatus, string> = {
  DRAFT: 'Rascunho',
  INCOMPLETE: 'Incompleto',
  SUBMITTED: 'Submetido',
  UNDER_REVIEW: 'Em avaliação',
  ACCEPTED: 'Aceito',
  REJECTED: 'Recusado',
  ACCEPTED_WITH_CHANGES: 'Aceito com alteração',
};

const reviewModeLabel: Record<ReviewMode, string> = {
  OPEN: 'Revisão aberta',
  SINGLE_BLIND: 'Revisão cega simples',
  DOUBLE_BLIND: 'Revisão duplo-cega',
};

function FormatWindowEditor({
  eventId, modalityId, window, abstractMax, abstractUnit, disabled, onSaved, onError, onSaving,
}: {
  eventId: string;
  modalityId: string;
  window: ModalityWindow;
  abstractMax: number;
  abstractUnit: CounterUnit;
  disabled: boolean;
  onSaved: (result: Payload) => void;
  onError: (message: string) => void;
  onSaving: (value: string) => void;
}) {
  const [opensAt, setOpensAt] = useState(localDateTimeInputValue(window.opensAt));
  const [closesAt, setClosesAt] = useState(localDateTimeInputValue(window.closesAt));
  const draftSequence = useRef(0);
  const toDraft = (block: SummaryBlock): SummaryBlockDraft => ({ ...block, editorKey: `saved:${block.code}` });
  const [blocks, setBlocks] = useState<SummaryBlockDraft[]>(window.blocks.map(toDraft));
  const [localError, setLocalError] = useState('');
  const savedSignature = `${window.opensAt ?? ''}|${window.closesAt ?? ''}|${window.blocks.map((block) => `${block.code}:${block.label}:${block.min}:${block.max}`).join(';')}`;

  useEffect(() => {
    setOpensAt(localDateTimeInputValue(window.opensAt));
    setClosesAt(localDateTimeInputValue(window.closesAt));
    setBlocks(window.blocks.map(toDraft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSignature]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    if ((opensAt && Number.isNaN(Date.parse(opensAt))) || (closesAt && Number.isNaN(Date.parse(closesAt)))) {
      setLocalError('Informe a abertura e o encerramento com data e hora completas.');
      return;
    }
    const hasInvalidLimits = blocks.some((block) => !Number.isInteger(block.min) || !Number.isInteger(block.max)
      || block.min < 0 || block.max < block.min || block.max > 20000);
    if (hasInvalidLimits) {
      setLocalError('Revise o mínimo e o máximo de cada bloco antes de salvar.');
      return;
    }
    const unitCharacterBudget = abstractUnit === 'WORDS' ? 8 : 1;
    const composedMaximum = blocks.reduce(
      (total, block) => total + block.label.trim().length + 1 + (block.max * unitCharacterBudget),
      0,
    ) + Math.max(0, blocks.length - 1) * 2;
    if (composedMaximum > 20000) {
      setLocalError('A soma dos limites e títulos dos blocos excede o limite seguro de 20000 caracteres.');
      return;
    }
    onSaving('window');
    onError('');
    setLocalError('');
    try {
      const result = await api<Payload>(`/scientific-events/${eventId}/submissions/modalities/${modalityId}/window`, {
        method: 'PUT',
        body: JSON.stringify({
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
          blocks: blocks.map((block) => ({
            label: block.label,
            min: Number(block.min),
            max: Number(block.max),
            ...(block.code ? { code: block.code } : {}),
          })),
        }),
      });
      onSaved(result);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Não foi possível salvar o prazo desta modalidade.';
      setLocalError(message);
      onError(message);
    } finally {
      onSaving('');
    }
  }

  return <form className={styles.windowBox} onSubmit={(event) => void save(event)}>
    <p>Prazo da modalidade. O horário de abertura e o de encerramento entram no prazo.</p>
    <div className={styles.twoCols}>
      <label className={styles.field}>Abre em<input type="datetime-local" step="1" value={opensAt} disabled={disabled} onChange={(event) => setOpensAt(event.target.value)} /></label>
      <label className={styles.field}>Encerra em<input type="datetime-local" step="1" value={closesAt} disabled={disabled} onChange={(event) => setClosesAt(event.target.value)} /></label>
    </div>
    <fieldset>
      <legend>Blocos do resumo</legend>
      {blocks.map((block, index) => <div key={block.editorKey}>
        <label className={styles.field}>Nome do bloco<input required minLength={2} maxLength={80} value={block.label} disabled={disabled} onChange={(event) => setBlocks(blocks.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></label>
        <div className={styles.twoCols}>
          <label className={styles.field}>Mínimo<input required type="number" min={0} max={20000} value={block.min} disabled={disabled} onChange={(event) => setBlocks(blocks.map((item, itemIndex) => itemIndex === index ? { ...item, min: Number(event.target.value) } : item))} /></label>
          <label className={styles.field}>Máximo<input required type="number" min={0} max={20000} value={block.max} disabled={disabled} onChange={(event) => setBlocks(blocks.map((item, itemIndex) => itemIndex === index ? { ...item, max: Number(event.target.value) } : item))} /></label>
        </div>
        <button type="button" className={styles.secondary} disabled={disabled} onClick={() => setBlocks(blocks.filter((_, itemIndex) => itemIndex !== index))}>Remover bloco</button>
      </div>)}
      <button type="button" className={styles.secondary} disabled={disabled || blocks.length >= 4} onClick={() => setBlocks([...blocks, { code: '', label: '', min: 0, max: abstractMax, editorKey: `new:${draftSequence.current++}` }])}>Adicionar bloco</button>
    </fieldset>
    {localError && <p role="alert">{localError}</p>}
    <button className={styles.primary} disabled={disabled}>Salvar prazo e blocos</button>
  </form>;
}

export default function ScientificSubmissions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [presentationLabel, setPresentationLabel] = useState('');
  const [taxonomyDraft, setTaxonomyDraft] = useState({ name: '', level: 'AREA' as 'AREA' | 'SUBAREA', parentId: '' });

  async function reload() {
    const result = await api<Payload>(`/scientific-events/${eventId}/submissions`);
    setPayload(result);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    reload()
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a configuração de submissões.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, router]);

  async function saveConfig(patch: Partial<Payload['config']>) {
    setSaving('config');
    setError('');
    setNotice('');
    try {
      const result = await api<Payload>(`/scientific-events/${eventId}/submissions/config`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setPayload(result);
      setNotice('Configuração do processo de submissão atualizada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar as regras de submissão.');
    } finally {
      setSaving('');
    }
  }

  async function addTaxonomy(event: FormEvent) {
    event.preventDefault();
    if (!payload) return;
    const level = payload.config.requireSubarea ? taxonomyDraft.level : 'AREA';
    if (level === 'SUBAREA' && !taxonomyDraft.parentId) {
      setError('Escolha a área da subárea.');
      return;
    }
    setSaving('taxonomy');
    setError('');
    setNotice('');
    try {
      await api(`/scientific-events/${eventId}/structure/taxonomy`, {
        method: 'POST',
        body: JSON.stringify({
          name: taxonomyDraft.name,
          level,
          parentId: level === 'SUBAREA' ? taxonomyDraft.parentId : undefined,
        }),
      });
      setTaxonomyDraft({ name: '', level: 'AREA', parentId: '' });
      await reload();
      setNotice(level === 'SUBAREA' ? 'Subárea inserida.' : 'Área inserida.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível inserir a área.');
    } finally {
      setSaving('');
    }
  }

  function visibleFormats(source: Payload) {
    if (source.presentationFormatsSaved) return source.config.presentationFormats;
    return source.config.presentationFormats.map((item) => ({ ...item, submissionEnabled: false }));
  }

  if (loading) return <main className={styles.page}><div className={styles.loading}>A EVA está preparando as configurações do processo de submissão...</div></main>;
  if (!payload) return <main className={styles.page}><div className={styles.error}>{error || 'Configuração de submissões indisponível.'}</div></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <Link className={styles.back} href={`/eventos/${eventId}/cientifico/trabalhos`}>Voltar aos trabalhos</Link>
    </header>

    <section className={styles.workspace}>
      <nav className={styles.flowReturn} aria-label="Retorno do fluxo">
        <Link href={`/eventos/${eventId}/cientifico/trabalhos`}>Voltar aos trabalhos</Link>
        <Link href={`/eventos/${eventId}/painel`}>Voltar ao painel</Link>
      </nav>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>GATE A6 · CONFIGURAÇÃO DE TRABALHOS CIENTÍFICOS</span>
          <h1>{payload.event.name}</h1>
          <p>Configure como os autores poderão submeter trabalhos. Esta área é do organizador: ela define regras, modalidades e acompanha o processo, mas não cria nem submete trabalhos em nome dos participantes.</p>
        </div>
        <div className={styles.metrics}>
          <div><strong>{payload.summary.total}</strong><span>Trabalhos recebidos</span></div>
          <div><strong>{payload.summary.drafts}</strong><span>Rascunhos dos autores</span></div>
          <div><strong>{payload.summary.submitted}</strong><span>Submetidos</span></div>
        </div>
      </div>

      <div className={styles.eva}><div className={styles.evaMark}>EVA</div><div><strong>Organizador configura; autor submete</strong><p>{payload.nextAction}</p></div></div>
      <div className={styles.notice} role="note"><strong>Separação de responsabilidades.</strong> {payload.actorBoundary.message}</div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <div className={styles.steps}><span>1. Regras</span><span>2. Modalidades</span><span>3. Limites</span><span>4. Acompanhar</span></div>

      <section className={styles.summary} aria-labelledby="effective-rules-title">
        <div><span className={styles.step}>RESUMO DAS REGRAS EFETIVAS</span><h2 id="effective-rules-title">O que o autor encontrará na submissão</h2></div>
        <ul>
          <li>Até <strong>{payload.config.maxSubmissionsPerAuthor}</strong> trabalho(s) por autor responsável</li>
          <li>{!payload.config.collectAdditionalAuthors || payload.config.maxAuthors === 1
            ? <>Somente quem envia a inscrição (<strong>1</strong> autor)</>
            : <><strong>{payload.config.minAuthors}</strong> a <strong>{payload.config.maxAuthors ?? 'sem limite definido'}</strong> autores por trabalho</>}</li>
          <li>Título com quantidade máxima de <strong>{payload.config.titleMaxLength}</strong> caracteres</li>
          <li>De <strong>{payload.config.minKeywords}</strong> a <strong>{payload.config.maxKeywords}</strong> palavras-chave</li>
          <li>Resumo em <strong>{payload.config.abstractCounterUnit === 'WORDS' ? 'palavras' : 'caracteres'}</strong>, de {payload.config.abstractMin} a {payload.config.abstractMax}</li>
          <li><strong>{payload.config.reviewersPerSubmission ?? 'Sem limite de'}</strong> avaliador(es) por trabalho</li>
        </ul>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <span className={styles.step}>1 · COMO FUNCIONA?</span><h2>Regras do processo</h2><p>Defina o que será obrigatório quando o autor preencher o trabalho em sua própria área.</p>
          <div className={styles.ruleList} role="radiogroup" aria-label="Área científica">
            <label><input type="radio" name="area-mode" checked={!payload.config.requireArea} disabled={Boolean(saving)} onChange={() => saveConfig({ requireArea: false, requireSubarea: false })} /> Não pedir área</label>
            <label><input type="radio" name="area-mode" checked={payload.config.requireArea && !payload.config.requireSubarea} disabled={Boolean(saving)} onChange={() => saveConfig({ requireArea: true, requireSubarea: false })} /> Apenas área</label>
            <label><input type="radio" name="area-mode" checked={payload.config.requireArea && payload.config.requireSubarea} disabled={Boolean(saving)} onChange={() => saveConfig({ requireArea: true, requireSubarea: true })} /> Área e subárea</label>
          </div>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.requireFile} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireFile: e.target.checked })} /> Exigir arquivo no envio</label>
            <label><input type="checkbox" checked={payload.config.allowCorrections} disabled={Boolean(saving)} onChange={(e) => saveConfig({ allowCorrections: e.target.checked })} /> Permitir nova versão quando houver correção</label>
          </div>
          {payload.config.requireArea && <form className={styles.form} onSubmit={addTaxonomy}>
            {payload.config.requireSubarea && <label className={styles.field}>Inserir<select value={taxonomyDraft.level} onChange={(e) => setTaxonomyDraft({ ...taxonomyDraft, level: e.target.value as 'AREA' | 'SUBAREA', parentId: '' })}><option value="AREA">Área</option><option value="SUBAREA">Subárea</option></select></label>}
            {payload.config.requireSubarea && taxonomyDraft.level === 'SUBAREA' && <label className={styles.field}>Área da subárea<select required value={taxonomyDraft.parentId} onChange={(e) => setTaxonomyDraft({ ...taxonomyDraft, parentId: e.target.value })}><option value="">Selecione</option>{payload.taxonomy.filter((item) => item.level === 'AREA').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            <label className={styles.field}>{payload.config.requireSubarea && taxonomyDraft.level === 'SUBAREA' ? 'Nome da subárea' : 'Nome da área'}<input required minLength={2} maxLength={140} value={taxonomyDraft.name} onChange={(e) => setTaxonomyDraft({ ...taxonomyDraft, name: e.target.value })} placeholder={payload.config.requireSubarea && taxonomyDraft.level === 'SUBAREA' ? 'Ex.: Cardiologia' : 'Ex.: Saúde'} /></label>
            <button className={styles.primary} disabled={Boolean(saving)}>{saving === 'taxonomy' ? 'Salvando…' : 'Inserir'}</button>
          </form>}
          {payload.config.requireArea && <div className={styles.chips}>{payload.taxonomy.filter((item) => item.level === 'AREA').map((area) => <span key={area.id}>{area.name}{payload.config.requireSubarea ? payload.taxonomy.filter((item) => item.level === 'SUBAREA' && item.parentId === area.id).map((item) => ` · ${item.name}`).join('') : ''}</span>)}</div>}
          <label className={styles.field}>Modelo de avaliação<select value={payload.config.reviewMode} disabled={Boolean(saving)} onChange={(e) => saveConfig({ reviewMode: e.target.value as ReviewMode })}><option value="OPEN">Revisão aberta</option><option value="SINGLE_BLIND">Revisão cega simples</option><option value="DOUBLE_BLIND">Revisão duplo-cega</option></select><small>Atual: {reviewModeLabel[payload.config.reviewMode]}</small></label>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>2 · CONTEÚDO DO TRABALHO</span><h2>Título e resumo</h2><p>A quantidade do título é em caracteres. A quantidade do resumo pode ser em caracteres ou em palavras.</p>
          <label className={styles.field}>Quantidade máxima de caracteres do título<input key={`title-${payload.config.titleMaxLength}`} type="number" min={50} max={1000} defaultValue={payload.config.titleMaxLength} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ titleMaxLength: Number(e.target.value) })} /><small>Padrão Evolvia: 250 caracteres.</small></label>
          <label className={styles.field}>Quantidade do resumo<select value={payload.config.abstractCounterUnit} disabled={Boolean(saving)} onChange={(e) => saveConfig({ abstractCounterUnit: e.target.value as CounterUnit })}><option value="CHARACTERS">Caracteres</option><option value="WORDS">Palavras</option></select></label>
          <div className={styles.twoCols}>
            <label className={styles.field}>Mínimo do resumo<input key={`abs-min-${payload.config.abstractMin}`} type="number" min={0} max={20000} defaultValue={payload.config.abstractMin} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ abstractMin: Number(e.target.value) })} /></label>
            <label className={styles.field}>Máximo do resumo<input key={`abs-max-${payload.config.abstractMax}`} type="number" min={0} max={20000} defaultValue={payload.config.abstractMax} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ abstractMax: Number(e.target.value) })} /></label>
          </div>
          <div className={styles.twoCols}>
            <label className={styles.field}>Mínimo de palavras-chave<input key={`keywords-min-${payload.config.minKeywords}`} type="number" min={0} max={20} defaultValue={payload.config.minKeywords} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ minKeywords: Number(e.target.value) })} /></label>
            <label className={styles.field}>Máximo de palavras-chave<input key={`keywords-max-${payload.config.maxKeywords}`} type="number" min={0} max={20} defaultValue={payload.config.maxKeywords} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ maxKeywords: Number(e.target.value) })} /></label>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>2 · O QUE SERÁ ACEITO?</span><h2>Modalidades de submissão</h2><p>Escolha o que o autor pode selecionar no envio: oral, tema livre, pôster, pôster digital ou outra modalidade deste evento.</p>
          <ul className={styles.formatList}>{visibleFormats(payload).map((item) => {
            const modality = payload.modalities.find((entry) => entry.code === item.code);
            return <li key={item.code}>
            <strong>{item.label}</strong>
            <label><input type="checkbox" checked={item.submissionEnabled} disabled={Boolean(saving)} onChange={(event) => {
              const next = visibleFormats(payload).map((format) => format.code === item.code ? { ...format, submissionEnabled: event.target.checked } : format);
              void saveConfig({ presentationFormats: next, requirePresentationSuggestion: next.some((format) => format.submissionEnabled) });
            }} /> Aceita submissão</label>
            <label><input type="checkbox" checked={item.evaluationEnabled} disabled={Boolean(saving)} onChange={(event) => {
              const next = visibleFormats(payload).map((format) => format.code === item.code ? { ...format, evaluationEnabled: event.target.checked } : format);
              void saveConfig({ presentationFormats: next, requirePresentationSuggestion: next.some((format) => format.submissionEnabled) });
            }} /> Entra na avaliação</label>
            {modality ? <FormatWindowEditor
              key={modality.id}
              eventId={eventId}
              modalityId={modality.id}
              window={modality.window ?? { opensAt: null, closesAt: null, blocks: [] }}
              abstractMax={payload.config.abstractMax}
              abstractUnit={payload.config.abstractCounterUnit}
              disabled={Boolean(saving)}
              onSaved={(result) => { setPayload(result); setNotice('Prazo e blocos da modalidade atualizados.'); }}
              onError={setError}
              onSaving={setSaving}
            /> : <p>Ative e salve a submissão desta modalidade para definir o prazo e os blocos.</p>}
          </li>;
          })}</ul>
          <form className={styles.inlineForm} onSubmit={(event) => {
            event.preventDefault();
            const label = presentationLabel.trim();
            if (!label) return;
            const next = [...visibleFormats(payload), { code: label, label, submissionEnabled: true, evaluationEnabled: true }];
            void saveConfig({ presentationFormats: next, requirePresentationSuggestion: true });
            setPresentationLabel('');
          }}>
            <label className={styles.field}>Outra modalidade<input value={presentationLabel} maxLength={80} onChange={(e) => setPresentationLabel(e.target.value)} placeholder="Ex.: Vídeo comentado" /></label>
            <button className={styles.secondary} disabled={Boolean(saving) || !presentationLabel.trim()}>Adicionar</button>
          </form>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>3 · LIMITES DO AUTOR</span><h2>Autoria</h2><p>Defina limites que serão validados no portal do autor. O organizador não preenche os autores aqui.</p>
          <div className={styles.twoCols}>
            <label className={styles.field}>Mínimo de autores<input key={`min-${payload.config.minAuthors}`} type="number" min={1} max={100} defaultValue={payload.config.minAuthors} disabled={Boolean(saving) || !payload.config.collectAdditionalAuthors} onBlur={(e) => saveConfig({ minAuthors: Number(e.target.value) })} /><small>1 aceita somente quem envia a inscrição.</small></label>
            <label className={styles.field}>Máximo de autores <small>Deixe vazio para sem limite</small><input key={`max-${payload.config.maxAuthors ?? 'none'}`} type="number" min={1} max={100} defaultValue={payload.config.maxAuthors ?? ''} disabled={Boolean(saving) || !payload.config.collectAdditionalAuthors} onBlur={(e) => saveConfig({ maxAuthors: e.target.value ? Number(e.target.value) : null })} /></label>
          </div>
            <label className={styles.field}>Máximo de trabalhos por autor responsável<input key={`works-${payload.config.maxSubmissionsPerAuthor}`} type="number" min={1} max={100} defaultValue={payload.config.maxSubmissionsPerAuthor} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ maxSubmissionsPerAuthor: Number(e.target.value) })} /></label>
          <label className={styles.field}>Máximo de apresentadores por trabalho<input key={`presenters-${payload.config.maxPresenters}`} type="number" min={1} max={20} defaultValue={payload.config.maxPresenters} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ maxPresenters: Number(e.target.value) })} /><small>Define quantos autores podem apresentar o mesmo trabalho. O limite vale também quando a indicação de apresentador é opcional.</small></label>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.collectAdditionalAuthors} disabled={Boolean(saving)} onChange={(e) => saveConfig(e.target.checked ? { collectAdditionalAuthors: true } : { collectAdditionalAuthors: false, minAuthors: 1, maxAuthors: 1 })} /> Pedir outros autores</label>
            <label><input type="checkbox" checked={payload.config.collectAuthorOrder} disabled={Boolean(saving)} onChange={(e) => saveConfig({ collectAuthorOrder: e.target.checked })} /> Pedir a ordem de autoria</label>
            <label><input type="checkbox" checked={payload.config.requireSubmitterAsFirstAuthor} disabled={Boolean(saving) || !payload.config.collectAuthorOrder} onChange={(e) => saveConfig({ requireSubmitterAsFirstAuthor: e.target.checked })} /> Quem envia a inscrição é o primeiro autor</label>
            <label><input type="checkbox" checked={payload.config.collectAuthorInstitution} disabled={Boolean(saving)} onChange={(e) => saveConfig(e.target.checked ? { collectAuthorInstitution: true } : { collectAuthorInstitution: false, requireAuthorInstitution: false })} /> Pedir a instituição dos autores</label>
            <label><input type="checkbox" checked={payload.config.requireAuthorInstitution} disabled={Boolean(saving) || !payload.config.collectAuthorInstitution} onChange={(e) => saveConfig({ requireAuthorInstitution: e.target.checked })} /> Exigir instituição para cada autor</label>
            <label><input type="checkbox" checked={payload.config.requirePresenter} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requirePresenter: e.target.checked })} /> Exigir apresentador</label>
            <label><input type="checkbox" checked={payload.config.requireCorrespondingAuthor} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireCorrespondingAuthor: e.target.checked })} /> Exigir autor correspondente</label>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>5 · O QUE O AUTOR PREENCHE</span><h2>Campos do trabalho</h2><p>Estes campos só aparecem para o autor quando você liga. O nome de apresentação continua vindo da inscrição.</p>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.collectTypedAbstract} disabled={Boolean(saving)} onChange={(e) => saveConfig({ collectTypedAbstract: e.target.checked })} /> Coletar resumo digitado</label>
            <label><input type="checkbox" checked={payload.config.collectReferences} disabled={Boolean(saving)} onChange={(e) => saveConfig({ collectReferences: e.target.checked })} /> Coletar referências bibliográficas</label>
            <label><input type="checkbox" checked={payload.config.collectScientificName} disabled={Boolean(saving)} onChange={(e) => saveConfig({ collectScientificName: e.target.checked })} /> Coletar nome científico</label>
            <label><input type="checkbox" checked={payload.config.collectInstitutionAddress} disabled={Boolean(saving)} onChange={(e) => saveConfig({ collectInstitutionAddress: e.target.checked })} /> Coletar endereço da instituição</label>
            <label><input type="checkbox" checked={payload.config.collectFundingAgency} disabled={Boolean(saving)} onChange={(e) => saveConfig({ collectFundingAgency: e.target.checked })} /> Coletar agência de fomento</label>
            <label><input type="checkbox" checked={payload.config.collectConflictOfInterest} disabled={Boolean(saving)} onChange={(e) => saveConfig({ collectConflictOfInterest: e.target.checked })} /> Coletar conflito de interesse</label>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>5 · ANAIS E SEGUNDA ENTREGA</span><h2>Autorização e e-pôster</h2><p>A autorização é o texto que o autor aceita antes de enviar. O e-pôster do trabalho aceito continua sendo PDF, sem execução no servidor.</p>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.showProceedingsAuthorization} disabled={Boolean(saving)} onChange={(e) => saveConfig({ showProceedingsAuthorization: e.target.checked })} /> Exigir autorização para os anais</label>
            <label><input type="checkbox" checked={payload.config.acceptedWorkUploadEnabled} disabled={Boolean(saving)} onChange={(e) => saveConfig({ acceptedWorkUploadEnabled: e.target.checked })} /> Permitir e-pôster depois do aceite</label>
          </div>
          <label className={styles.field}>Texto em português<textarea key={`auth-pt-${payload.config.proceedingsAuthorizationPt ?? ''}`} defaultValue={payload.config.proceedingsAuthorizationPt ?? ''} maxLength={2000} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ proceedingsAuthorizationPt: e.target.value })} placeholder="Eu autorizo a submissão do trabalho nos anais do evento." /></label>
          <label className={styles.field}>Texto em espanhol <small>Opcional</small><textarea key={`auth-es-${payload.config.proceedingsAuthorizationEs ?? ''}`} defaultValue={payload.config.proceedingsAuthorizationEs ?? ''} maxLength={2000} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ proceedingsAuthorizationEs: e.target.value })} /></label>
          <label className={styles.field}>Texto em inglês <small>Opcional</small><textarea key={`auth-en-${payload.config.proceedingsAuthorizationEn ?? ''}`} defaultValue={payload.config.proceedingsAuthorizationEn ?? ''} maxLength={2000} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ proceedingsAuthorizationEn: e.target.value })} /></label>
          <label className={styles.field}>Prazo do e-pôster do trabalho aceito<input key={`deadline-${payload.config.acceptedWorkUploadDeadline ?? ''}`} type="datetime-local" step="1" defaultValue={localDateTimeInputValue(payload.config.acceptedWorkUploadDeadline)} disabled={Boolean(saving)} onBlur={(e) => {
            if (e.target.validity.badInput) { setError('Prazo do e-pôster inválido.'); return; }
            if (e.target.value === localDateTimeInputValue(payload.config.acceptedWorkUploadDeadline)) return;
            if (!e.target.value) { void saveConfig({ acceptedWorkUploadDeadline: null }); return; }
            const parsed = new Date(e.target.value);
            if (Number.isNaN(parsed.getTime())) { setError('Prazo do e-pôster inválido.'); return; }
            void saveConfig({ acceptedWorkUploadDeadline: parsed.toISOString() });
          }} /></label>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>6 · COMO A BANCA DECIDE</span><h2>Avaliadores e nota</h2><p>A nota com peso continua nos critérios da avaliação. Aqui você define quantas pessoas leem o trabalho e quem fecha a situação.</p>
          <label className={styles.field}>Avaliadores por trabalho <small>Vazio não limita</small><input key={`reviewers-${payload.config.reviewersPerSubmission ?? 'none'}`} type="number" min={1} max={10} defaultValue={payload.config.reviewersPerSubmission ?? ''} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ reviewersPerSubmission: e.target.value ? Number(e.target.value) : null })} /></label>
          <label className={styles.field}>Forma da nota<select value={payload.config.evaluationStyle} disabled={Boolean(saving)} onChange={(e) => saveConfig({ evaluationStyle: e.target.value as EvaluationStyle })}><option value="ANALYTIC">Critérios com peso</option><option value="SYNTHETIC">Nota única de 0 a 10</option></select></label>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.coordinatorDecidesStatus} disabled={Boolean(saving)} onChange={(e) => saveConfig({ coordinatorDecidesStatus: e.target.checked })} /> Só o coordenador define aceite ou recusa</label>
          </div>
          <ScientificDecisionLetters
            key={`${payload.config.acceptanceLetterBody ?? ''}\n${payload.config.rejectionLetterBody ?? ''}`}
            acceptance={payload.config.acceptanceLetterBody}
            rejection={payload.config.rejectionLetterBody}
            disabled={Boolean(saving)}
            onSave={saveConfig}
          />
          <h3>Entregas na área do autor</h3>
          <p>A entrega acontece na área do autor. Não enviamos e-mail.</p>
          <ul className={styles.submissionList}>
            {(payload.decisionDeliveries ?? []).length === 0 && <li>Nenhuma carta foi aberta ou baixada ainda.</li>}
            {(payload.decisionDeliveries ?? []).map((delivery) => <li key={delivery.id}>
              <strong>{delivery.submission.title}</strong>
              <span> · {delivery.kind === 'REJECTION' ? 'Recusa' : 'Aceite'} · {delivery.action === 'DOWNLOADED' ? 'Baixada na área do autor' : 'Vista na área do autor'} · </span>
              <time dateTime={delivery.createdAt}>{new Date(delivery.createdAt).toLocaleString('pt-BR')}</time>
              <span> · Documento {delivery.documentHash.slice(0, 8)}</span>
            </li>)}
          </ul>
        </article>

        <ScientificStationPanel eventId={eventId} />

        <article className={`${styles.card} ${styles.cardWide}`}>
          <span className={styles.step}>4 · ACOMPANHAMENTO</span><h2>Trabalhos do evento</h2><p>Esta lista é administrativa e somente de acompanhamento. Edição de conteúdo, autoria, arquivo, correção e submissão acontecem na área do autor.</p>
          <div className={styles.submissionList}>
            {!payload.submissions.length && <div className={styles.empty}>Nenhum trabalho recebido ainda.</div>}
            {payload.submissions.map((submission) => <div className={styles.submission} key={submission.id}>
              <div className={styles.submissionMain}><div><span className={styles.badge}>{statusLabel[submission.status]}</span><h3>{submission.title}</h3><p>{submission.modality.name} · {submission.authors.length} autor(es){submission.currentVersion ? ` · versão ${submission.currentVersion}` : ''}</p></div></div>
            </div>)}
          </div>
        </article>
      </section>
    </section>
  </main>;
}



