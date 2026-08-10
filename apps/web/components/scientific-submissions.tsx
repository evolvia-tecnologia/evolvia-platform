'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
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
    minAuthors: number;
    maxAuthors: number | null;
    reviewMode: ReviewMode;
    allowCorrections: boolean;
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
          <span className={styles.step}>2 · O QUE SERÁ ACEITO?</span><h2>Modalidades</h2><p>Cadastre os formatos que o participante poderá escolher, como resumo simples, trabalho completo, pôster ou apresentação oral.</p>
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
