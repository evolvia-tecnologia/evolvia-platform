'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import {
  resolveScientificNumericRules,
  SCIENTIFIC_NUMERIC_RULE_BOUNDS,
  SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
  type ScientificNumericRuleField,
  type ScientificNumericRules,
} from '../lib/scientific-submission-numeric-rules';
import styles from './scientific-submissions.module.css';

type ReviewMode = 'OPEN' | 'SINGLE_BLIND' | 'DOUBLE_BLIND';
type SubmissionStatus = 'DRAFT' | 'INCOMPLETE' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'ACCEPTED_WITH_CHANGES';
type Modality = { id: string; name: string; description: string | null; active: boolean };
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
    titleMaxLength: number;
    minKeywords: number;
    maxKeywords: number;
    presentationFormats: Array<{ code: string; label: string }>;
    reviewMode: ReviewMode;
    allowCorrections: boolean;
  };
  modalities: Modality[];
  submissions: Submission[];
  summary: { total: number; drafts: number; submitted: number };
  actorBoundary: { management: 'ORGANIZER'; authorActionsAvailableHere: false; message: string };
  nextAction: string;
};

type NumericDraft = Record<ScientificNumericRuleField, string>;

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

const bounds = SCIENTIFIC_NUMERIC_RULE_BOUNDS;

function draftFromConfig(config: Payload['config']): NumericDraft {
  return {
    maxSubmissionsPerAuthor: String(config.maxSubmissionsPerAuthor),
    minAuthors: String(config.minAuthors),
    maxAuthors: config.maxAuthors == null ? '' : String(config.maxAuthors),
    titleMaxLength: String(config.titleMaxLength),
    minKeywords: String(config.minKeywords),
    maxKeywords: String(config.maxKeywords),
  };
}

function parseNumericDraft(draft: NumericDraft): ScientificNumericRules {
  return {
    maxSubmissionsPerAuthor: Number(draft.maxSubmissionsPerAuthor),
    minAuthors: Number(draft.minAuthors),
    maxAuthors: draft.maxAuthors.trim() === '' ? null : Number(draft.maxAuthors),
    titleMaxLength: Number(draft.titleMaxLength),
    minKeywords: Number(draft.minKeywords),
    maxKeywords: Number(draft.maxKeywords),
  };
}

export default function ScientificSubmissions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [numericDraft, setNumericDraft] = useState<NumericDraft>(draftFromConfig({
    ...SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
    requireArea: false,
    requireSubarea: false,
    requireFile: false,
    requirePresenter: true,
    requireCorrespondingAuthor: true,
    requireAuthorInstitution: true,
    presentationFormats: [],
    reviewMode: 'SINGLE_BLIND',
    allowCorrections: true,
  }));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ScientificNumericRuleField, string>>>({});
  const [modalityForm, setModalityForm] = useState({ name: '', description: '' });
  const [presentationLabel, setPresentationLabel] = useState('');

  async function reload() {
    const result = await api<Payload>(`/scientific-events/${eventId}/submissions`);
    setPayload(result);
    setNumericDraft(draftFromConfig(result.config));
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

  async function saveConfig(patch: Partial<Payload['config']>, success = 'Configuração do processo de submissão atualizada.') {
    setSaving('config');
    setError('');
    setNotice('');
    try {
      const result = await api<Payload>(`/scientific-events/${eventId}/submissions/config`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setPayload(result);
      setNumericDraft(draftFromConfig(result.config));
      setFieldErrors({});
      setNotice(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar as regras de submissão.');
    } finally {
      setSaving('');
    }
  }

  async function saveNumericRules(event: FormEvent) {
    event.preventDefault();
    const resolved = resolveScientificNumericRules(null, parseNumericDraft(numericDraft));
    if (!resolved.ok) {
      setFieldErrors(Object.fromEntries(resolved.errors.map((item) => [item.field, item.message])));
      setError(resolved.errors[0].message);
      setNotice('');
      return;
    }
    await saveConfig(resolved.rules, 'Regras essenciais de submissão atualizadas.');
  }

  async function createModality(event: FormEvent) {
    event.preventDefault();
    setSaving('modality');
    setError('');
    setNotice('');
    try {
      const result = await api<Payload>(`/scientific-events/${eventId}/submissions/modalities`, {
        method: 'POST',
        body: JSON.stringify({ name: modalityForm.name, description: modalityForm.description || undefined }),
      });
      setPayload(result);
      setModalityForm({ name: '', description: '' });
      setNotice('Modalidade adicionada ao processo de submissão.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a modalidade.');
    } finally {
      setSaving('');
    }
  }

  if (loading) return <main className={styles.page}><div className={styles.loading}>A EVA está preparando as configurações do processo de submissão...</div></main>;
  if (!payload) return <main className={styles.page}><div className={styles.error}>{error || 'Configuração de submissões indisponível.'}</div></main>;

  const saveState = saving === 'config'
    ? 'Salvando regras essenciais…'
    : saving === 'modality'
      ? 'Salvando modalidade…'
      : '';

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <Link className={styles.back} href={`/eventos/${eventId}/cientifico`}>Voltar à Central científica</Link>
    </header>

    <section className={styles.workspace}>
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
      <p className={styles.saveState} role="status" aria-live="polite">{saveState || 'As regras essenciais usam padrões Evolvia até você salvar um ajuste.'}</p>

      <nav aria-label="Etapas da configuração de trabalhos">
        <ol className={styles.steps}>
          <li>1. Regras essenciais</li>
          <li>2. Modalidades</li>
          <li>3. Autoria</li>
          <li>4. Acompanhar</li>
        </ol>
      </nav>

      <section className={styles.summary} aria-labelledby="effective-rules-title">
        <div><span className={styles.step}>RESUMO DAS REGRAS EFETIVAS</span><h2 id="effective-rules-title">O que o autor encontrará na submissão</h2></div>
        <ul>
          <li>Até <strong>{payload.config.maxSubmissionsPerAuthor}</strong> trabalho(s) por inscrito/autor responsável</li>
          <li><strong>{payload.config.minAuthors}</strong> a <strong>{payload.config.maxAuthors ?? 'sem limite definido'}</strong> autores por trabalho</li>
          <li>Título com até <strong>{payload.config.titleMaxLength}</strong> caracteres</li>
          <li>De <strong>{payload.config.minKeywords}</strong> a <strong>{payload.config.maxKeywords}</strong> palavras-chave</li>
        </ul>
      </section>

      <section className={styles.grid}>
        <article className={`${styles.card} ${styles.cardWide}`}>
          <form className={styles.form} onSubmit={saveNumericRules} noValidate>
            <span className={styles.step}>1 · REGRAS ESSENCIAIS</span>
            <h2>Limites numéricos da submissão</h2>
            <p>Estes padrões já vêm preenchidos. Ajuste apenas o que o evento precisar; o servidor recusa combinações inválidas.</p>
            <div className={styles.twoCols}>
              <NumericField
                id="max-submissions"
                label="Máximo de trabalhos por autor responsável"
                help={`Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.maxSubmissionsPerAuthor}. Limite seguro: ${bounds.maxSubmissionsPerAuthor.min} a ${bounds.maxSubmissionsPerAuthor.max} por inscrito/autor responsável.`}
                min={bounds.maxSubmissionsPerAuthor.min}
                max={bounds.maxSubmissionsPerAuthor.max}
                value={numericDraft.maxSubmissionsPerAuthor}
                error={fieldErrors.maxSubmissionsPerAuthor}
                disabled={Boolean(saving)}
                onChange={(value) => setNumericDraft({ ...numericDraft, maxSubmissionsPerAuthor: value })}
              />
              <NumericField
                id="title-max"
                label="Máximo de caracteres no título"
                help={`Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.titleMaxLength}. Limite seguro: ${bounds.titleMaxLength.min} a ${bounds.titleMaxLength.max}.`}
                min={bounds.titleMaxLength.min}
                max={bounds.titleMaxLength.max}
                value={numericDraft.titleMaxLength}
                error={fieldErrors.titleMaxLength}
                disabled={Boolean(saving)}
                onChange={(value) => setNumericDraft({ ...numericDraft, titleMaxLength: value })}
              />
            </div>
            <div className={styles.twoCols}>
              <NumericField
                id="min-authors"
                label="Mínimo de autores por trabalho"
                help={`Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.minAuthors}. Deve ser menor ou igual ao máximo.`}
                min={bounds.minAuthors.min}
                max={bounds.minAuthors.max}
                value={numericDraft.minAuthors}
                error={fieldErrors.minAuthors}
                disabled={Boolean(saving)}
                onChange={(value) => setNumericDraft({ ...numericDraft, minAuthors: value })}
              />
              <NumericField
                id="max-authors"
                label="Máximo de autores por trabalho"
                help="Opcional. Deixe vazio para não limitar. Não pode ser menor que o mínimo."
                min={bounds.maxAuthors.min}
                max={bounds.maxAuthors.max}
                value={numericDraft.maxAuthors}
                error={fieldErrors.maxAuthors}
                disabled={Boolean(saving)}
                optional
                onChange={(value) => setNumericDraft({ ...numericDraft, maxAuthors: value })}
              />
            </div>
            <div className={styles.twoCols}>
              <NumericField
                id="min-keywords"
                label="Mínimo de palavras-chave"
                help={`Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.minKeywords}. Limite seguro: ${bounds.minKeywords.min} a ${bounds.minKeywords.max}.`}
                min={bounds.minKeywords.min}
                max={bounds.minKeywords.max}
                value={numericDraft.minKeywords}
                error={fieldErrors.minKeywords}
                disabled={Boolean(saving)}
                onChange={(value) => setNumericDraft({ ...numericDraft, minKeywords: value })}
              />
              <NumericField
                id="max-keywords"
                label="Máximo de palavras-chave"
                help={`Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.maxKeywords}. Deve ser maior ou igual ao mínimo, até ${bounds.maxKeywords.max}.`}
                min={bounds.maxKeywords.min}
                max={bounds.maxKeywords.max}
                value={numericDraft.maxKeywords}
                error={fieldErrors.maxKeywords}
                disabled={Boolean(saving)}
                onChange={(value) => setNumericDraft({ ...numericDraft, maxKeywords: value })}
              />
            </div>
            <button className={styles.primary} disabled={Boolean(saving)}>{saving === 'config' ? 'Salvando…' : 'Salvar regras essenciais'}</button>
          </form>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>2 · COMO FUNCIONA?</span><h2>Regras do processo</h2><p>Defina o que será obrigatório quando o autor preencher o trabalho em sua própria área.</p>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.requireArea} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireArea: e.target.checked, ...(e.target.checked ? {} : { requireSubarea: false }) })} /> Exigir área científica</label>
            <label><input type="checkbox" checked={payload.config.requireSubarea} disabled={Boolean(saving) || !payload.config.requireArea} onChange={(e) => saveConfig({ requireSubarea: e.target.checked, requireArea: true })} /> Exigir subárea</label>
            <label><input type="checkbox" checked={payload.config.requireFile} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireFile: e.target.checked })} /> Exigir arquivo no envio</label>
            <label><input type="checkbox" checked={payload.config.allowCorrections} disabled={Boolean(saving)} onChange={(e) => saveConfig({ allowCorrections: e.target.checked })} /> Permitir nova versão quando houver correção</label>
          </div>
          <label className={styles.field}>Modelo de avaliação<select value={payload.config.reviewMode} disabled={Boolean(saving)} onChange={(e) => saveConfig({ reviewMode: e.target.value as ReviewMode })}><option value="OPEN">Revisão aberta</option><option value="SINGLE_BLIND">Revisão cega simples</option><option value="DOUBLE_BLIND">Revisão duplo-cega</option></select><small>Atual: {reviewModeLabel[payload.config.reviewMode]}</small></label>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>2 · O QUE SERÁ ACEITO?</span><h2>Modalidades do trabalho</h2><p>Cadastre o tipo de submissão que o participante poderá escolher, como resumo simples, resumo expandido ou trabalho completo. A forma de apresentação, como oral, pôster ou ePoster, será uma configuração própria quando habilitada pelo evento.</p>
          <form className={styles.form} onSubmit={createModality}>
            <label className={styles.field}>Nome<input required minLength={2} value={modalityForm.name} onChange={(e) => setModalityForm({ ...modalityForm, name: e.target.value })} placeholder="Resumo científico" /></label>
            <label className={styles.field}>Descrição <small>Opcional</small><textarea value={modalityForm.description} onChange={(e) => setModalityForm({ ...modalityForm, description: e.target.value })} placeholder="Resumo estruturado de até 500 palavras" /></label>
            <button className={styles.primary} disabled={Boolean(saving)}>{saving === 'modality' ? 'Salvando…' : 'Adicionar modalidade'}</button>
          </form>
          <div className={styles.chips}>{payload.modalities.filter((item) => item.active).map((item) => <span key={item.id}>{item.name}</span>)}</div>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>3 · AUTORIA</span><h2>Papéis da autoria</h2><p>Estas exigências serão validadas no portal do autor. O organizador não preenche os autores aqui.</p>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.requirePresenter} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requirePresenter: e.target.checked })} /> Exigir exatamente um apresentador</label>
            <label><input type="checkbox" checked={payload.config.requireCorrespondingAuthor} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireCorrespondingAuthor: e.target.checked })} /> Exigir autor correspondente</label>
            <label><input type="checkbox" checked={payload.config.requireAuthorInstitution} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireAuthorInstitution: e.target.checked })} /> Exigir instituição para cada autor</label>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>4 · COMO SERÁ APRESENTADO?</span><h2>Formas de apresentação</h2><p>Esta classificação é diferente da modalidade do trabalho. Mantenha Oral, Pôster e ePoster ou acrescente outra forma usada pelo evento.</p>
          <div className={styles.chips}>{payload.config.presentationFormats.map((item) => <span key={item.code}>{item.label}</span>)}</div>
          <form className={styles.inlineForm} onSubmit={(event) => { event.preventDefault(); const label = presentationLabel.trim(); if (!label) return; void saveConfig({ presentationFormats: [...payload.config.presentationFormats, { code: label, label }] }); setPresentationLabel(''); }}>
            <label className={styles.field}>Outra forma de apresentação<input value={presentationLabel} maxLength={80} onChange={(e) => setPresentationLabel(e.target.value)} placeholder="Ex.: Vídeo comentado" /></label>
            <button className={styles.secondary} disabled={Boolean(saving) || !presentationLabel.trim()}>Adicionar</button>
          </form>
        </article>

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

function NumericField({
  id,
  label,
  help,
  min,
  max,
  value,
  error,
  disabled,
  optional,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  min: number;
  max: number;
  value: string;
  error?: string;
  disabled: boolean;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  return <div className={styles.field}>
    <label htmlFor={id}>{label}{optional ? <small> Opcional</small> : null}</label>
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      aria-invalid={Boolean(error)}
      aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
      onChange={(event) => onChange(event.target.value)}
    />
    <small id={helpId}>{help}</small>
    {error ? <strong id={errorId} className={styles.fieldError} role="alert">{error}</strong> : null}
  </div>;
}
