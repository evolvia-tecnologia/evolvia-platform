'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './scientific-submissions.module.css';

type ReviewMode = 'OPEN' | 'SINGLE_BLIND' | 'DOUBLE_BLIND';
type CounterUnit = 'CHARACTERS' | 'WORDS';
type EvaluationStyle = 'ANALYTIC' | 'SYNTHETIC';
type PresentationFormat = { code: string; label: string; submissionEnabled: boolean; evaluationEnabled: boolean };
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
  };
  modalities: Modality[];
  submissions: Submission[];
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

export default function ScientificSubmissions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalityForm, setModalityForm] = useState({ name: '', description: '' });
  const [presentationLabel, setPresentationLabel] = useState('');

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

      <div className={styles.steps}><span>1. Regras</span><span>2. Modalidades</span><span>3. Limites</span><span>4. Acompanhar</span></div>

      <section className={styles.summary} aria-labelledby="effective-rules-title">
        <div><span className={styles.step}>RESUMO DAS REGRAS EFETIVAS</span><h2 id="effective-rules-title">O que o autor encontrará na submissão</h2></div>
        <ul>
          <li>Até <strong>{payload.config.maxSubmissionsPerAuthor}</strong> trabalho(s) por autor responsável</li>
          <li><strong>{payload.config.minAuthors}</strong> a <strong>{payload.config.maxAuthors ?? 'sem limite definido'}</strong> autores por trabalho</li>
          <li>Título com até <strong>{payload.config.titleMaxLength}</strong> caracteres</li>
          <li>De <strong>{payload.config.minKeywords}</strong> a <strong>{payload.config.maxKeywords}</strong> palavras-chave</li>
          <li>Resumo em <strong>{payload.config.abstractCounterUnit === 'WORDS' ? 'palavras' : 'caracteres'}</strong>, de {payload.config.abstractMin} a {payload.config.abstractMax}</li>
          <li><strong>{payload.config.reviewersPerSubmission ?? 'Sem limite de'}</strong> avaliador(es) por trabalho</li>
        </ul>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <span className={styles.step}>1 · COMO FUNCIONA?</span><h2>Regras do processo</h2><p>Defina o que será obrigatório quando o autor preencher o trabalho em sua própria área.</p>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.requireArea} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireArea: e.target.checked, ...(e.target.checked ? {} : { requireSubarea: false }) })} /> Exigir área científica</label>
            <label><input type="checkbox" checked={payload.config.requireSubarea} disabled={Boolean(saving) || !payload.config.requireArea} onChange={(e) => saveConfig({ requireSubarea: e.target.checked, requireArea: true })} /> Exigir subárea</label>
            <label><input type="checkbox" checked={payload.config.requireFile} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireFile: e.target.checked })} /> Exigir arquivo no envio</label>
            <label><input type="checkbox" checked={payload.config.allowCorrections} disabled={Boolean(saving)} onChange={(e) => saveConfig({ allowCorrections: e.target.checked })} /> Permitir nova versão quando houver correção</label>
          </div>
          <label className={styles.field}>Modelo de avaliação<select value={payload.config.reviewMode} disabled={Boolean(saving)} onChange={(e) => saveConfig({ reviewMode: e.target.value as ReviewMode })}><option value="OPEN">Revisão aberta</option><option value="SINGLE_BLIND">Revisão cega simples</option><option value="DOUBLE_BLIND">Revisão duplo-cega</option></select><small>Atual: {reviewModeLabel[payload.config.reviewMode]}</small></label>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>2 · CONTEÚDO DO TRABALHO</span><h2>Título e palavras-chave</h2><p>Os padrões recomendados já vêm preenchidos e podem ser ajustados dentro dos limites seguros.</p>
          <label className={styles.field}>Máximo de caracteres no título<input key={`title-${payload.config.titleMaxLength}`} type="number" min={50} max={1000} defaultValue={payload.config.titleMaxLength} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ titleMaxLength: Number(e.target.value) })} /><small>Padrão Evolvia: 250 caracteres.</small></label>
          <div className={styles.twoCols}>
            <label className={styles.field}>Mínimo de palavras-chave<input key={`keywords-min-${payload.config.minKeywords}`} type="number" min={0} max={20} defaultValue={payload.config.minKeywords} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ minKeywords: Number(e.target.value) })} /></label>
            <label className={styles.field}>Máximo de palavras-chave<input key={`keywords-max-${payload.config.maxKeywords}`} type="number" min={0} max={20} defaultValue={payload.config.maxKeywords} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ maxKeywords: Number(e.target.value) })} /></label>
          </div>
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
          <span className={styles.step}>3 · LIMITES DO AUTOR</span><h2>Autoria</h2><p>Defina limites que serão validados no portal do autor. O organizador não preenche os autores aqui.</p>
          <div className={styles.twoCols}>
            <label className={styles.field}>Mínimo de autores<input key={`min-${payload.config.minAuthors}`} type="number" min={1} max={100} defaultValue={payload.config.minAuthors} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ minAuthors: Number(e.target.value) })} /></label>
            <label className={styles.field}>Máximo de autores <small>Deixe vazio para sem limite</small><input key={`max-${payload.config.maxAuthors ?? 'none'}`} type="number" min={1} max={100} defaultValue={payload.config.maxAuthors ?? ''} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ maxAuthors: e.target.value ? Number(e.target.value) : null })} /></label>
          </div>
            <label className={styles.field}>Máximo de trabalhos por autor responsável<input key={`works-${payload.config.maxSubmissionsPerAuthor}`} type="number" min={1} max={100} defaultValue={payload.config.maxSubmissionsPerAuthor} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ maxSubmissionsPerAuthor: Number(e.target.value) })} /></label>
          <label className={styles.field}>Apresentadores por trabalho<input key={`presenters-${payload.config.maxPresenters}`} type="number" min={1} max={20} defaultValue={payload.config.maxPresenters} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ maxPresenters: Number(e.target.value) })} /><small>Vale quando o apresentador é exigido.</small></label>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.requirePresenter} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requirePresenter: e.target.checked })} /> Exigir apresentador</label>
            <label><input type="checkbox" checked={payload.config.requireCorrespondingAuthor} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireCorrespondingAuthor: e.target.checked })} /> Exigir autor correspondente</label>
            <label><input type="checkbox" checked={payload.config.requireAuthorInstitution} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireAuthorInstitution: e.target.checked })} /> Exigir instituição para cada autor</label>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>4 · COMO SERÁ APRESENTADO?</span><h2>Formas de apresentação</h2><p>Esta classificação é diferente da modalidade do trabalho. Mantenha Oral, Pôster e ePoster ou acrescente outra forma usada pelo evento.</p>
          <ul className={styles.formatList}>{payload.config.presentationFormats.map((item) => <li key={item.code}>
            <strong>{item.label}</strong>
            <label><input type="checkbox" checked={item.submissionEnabled} disabled={Boolean(saving)} onChange={(event) => saveConfig({ presentationFormats: payload.config.presentationFormats.map((format) => format.code === item.code ? { ...format, submissionEnabled: event.target.checked } : format) })} /> Aceita submissão</label>
            <label><input type="checkbox" checked={item.evaluationEnabled} disabled={Boolean(saving)} onChange={(event) => saveConfig({ presentationFormats: payload.config.presentationFormats.map((format) => format.code === item.code ? { ...format, evaluationEnabled: event.target.checked } : format) })} /> Entra na avaliação</label>
          </li>)}</ul>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.requirePresentationSuggestion} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requirePresentationSuggestion: e.target.checked })} /> O autor sugere a forma de apresentação</label>
          </div>
          <form className={styles.inlineForm} onSubmit={(event) => { event.preventDefault(); const label = presentationLabel.trim(); if (!label) return; void saveConfig({ presentationFormats: [...payload.config.presentationFormats, { code: label, label, submissionEnabled: true, evaluationEnabled: true }] }); setPresentationLabel(''); }}>
            <label className={styles.field}>Outra forma de apresentação<input value={presentationLabel} maxLength={80} onChange={(e) => setPresentationLabel(e.target.value)} placeholder="Ex.: Vídeo comentado" /></label>
            <button className={styles.secondary} disabled={Boolean(saving) || !presentationLabel.trim()}>Adicionar</button>
          </form>
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
            <label><input type="checkbox" checked={payload.config.requireSubmitterAsFirstAuthor} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireSubmitterAsFirstAuthor: e.target.checked })} /> O inscrito entra como primeiro autor</label>
          </div>
          <label className={styles.field}>Contagem do resumo<select value={payload.config.abstractCounterUnit} disabled={Boolean(saving)} onChange={(e) => saveConfig({ abstractCounterUnit: e.target.value as CounterUnit })}><option value="CHARACTERS">Caracteres</option><option value="WORDS">Palavras</option></select></label>
          <div className={styles.twoCols}>
            <label className={styles.field}>Mínimo do resumo<input key={`abs-min-${payload.config.abstractMin}`} type="number" min={0} max={20000} defaultValue={payload.config.abstractMin} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ abstractMin: Number(e.target.value) })} /></label>
            <label className={styles.field}>Máximo do resumo<input key={`abs-max-${payload.config.abstractMax}`} type="number" min={0} max={20000} defaultValue={payload.config.abstractMax} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ abstractMax: Number(e.target.value) })} /></label>
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
          <label className={styles.field}>Prazo do e-pôster do trabalho aceito<input key={`deadline-${payload.config.acceptedWorkUploadDeadline ?? ''}`} type="datetime-local" defaultValue={payload.config.acceptedWorkUploadDeadline ? payload.config.acceptedWorkUploadDeadline.slice(0, 16) : ''} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ acceptedWorkUploadDeadline: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>6 · COMO A BANCA DECIDE</span><h2>Avaliadores e nota</h2><p>A nota com peso continua nos critérios da avaliação. Aqui você define quantas pessoas leem o trabalho e quem fecha a situação.</p>
          <label className={styles.field}>Avaliadores por trabalho <small>Vazio não limita</small><input key={`reviewers-${payload.config.reviewersPerSubmission ?? 'none'}`} type="number" min={1} max={10} defaultValue={payload.config.reviewersPerSubmission ?? ''} disabled={Boolean(saving)} onBlur={(e) => saveConfig({ reviewersPerSubmission: e.target.value ? Number(e.target.value) : null })} /></label>
          <label className={styles.field}>Forma da nota<select value={payload.config.evaluationStyle} disabled={Boolean(saving)} onChange={(e) => saveConfig({ evaluationStyle: e.target.value as EvaluationStyle })}><option value="ANALYTIC">Critérios com peso</option><option value="SYNTHETIC">Nota única de 0 a 10</option></select></label>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.coordinatorDecidesStatus} disabled={Boolean(saving)} onChange={(e) => saveConfig({ coordinatorDecidesStatus: e.target.checked })} /> Só o coordenador define aceite ou recusa</label>
          </div>
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
