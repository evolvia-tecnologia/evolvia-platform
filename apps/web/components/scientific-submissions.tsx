'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './scientific-submissions.module.css';

type ReviewMode = 'OPEN' | 'SINGLE_BLIND' | 'DOUBLE_BLIND';
type SubmissionStatus = 'DRAFT' | 'INCOMPLETE' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'ACCEPTED_WITH_CHANGES';

type Person = { id: string; name: string; institution: string | null };
type Taxonomy = { id: string; level: 'AREA' | 'SUBAREA' | 'TOPIC'; name: string; parentId: string | null };
type Modality = { id: string; name: string; description: string | null; active: boolean };
type Author = { id: string; personId: string; sortOrder: number; isPresenter: boolean; isCorresponding: boolean; person: Person };
type Version = { id: string; versionNumber: number; submittedAt: string; fileKey: string | null; contentHash: string | null };
type Submission = {
  id: string;
  title: string;
  abstractText: string | null;
  keywords: string[] | null;
  status: SubmissionStatus;
  currentVersion: number;
  submittedAt: string | null;
  taxonomyAreaId: string | null;
  taxonomySubareaId: string | null;
  modality: Modality;
  authors: Author[];
  versions: Version[];
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
  people: Person[];
  taxonomy: Taxonomy[];
  summary: { total: number; drafts: number; submitted: number };
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
  const [modalityForm, setModalityForm] = useState({ name: '', description: '' });
  const [submissionForm, setSubmissionForm] = useState({ modalityId: '', title: '', abstractText: '', keywords: '', taxonomyAreaId: '', taxonomySubareaId: '' });
  const [authorForm, setAuthorForm] = useState({ submissionId: '', personId: '', isPresenter: false, isCorresponding: false });
  const [fileForm, setFileForm] = useState<Record<string, string>>({});

  async function reload() {
    const result = await api<Payload>(`/scientific-events/${eventId}/submissions`);
    setPayload(result);
    const firstModality = result.modalities.find((item) => item.active);
    if (!submissionForm.modalityId && firstModality) setSubmissionForm((current) => ({ ...current, modalityId: firstModality.id }));
    if (!authorForm.submissionId && result.submissions[0]) setAuthorForm((current) => ({ ...current, submissionId: result.submissions[0].id }));
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    reload()
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as submissões científicas.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, router]);

  const activeModalities = useMemo(() => payload?.modalities.filter((item) => item.active) ?? [], [payload]);
  const areas = useMemo(() => payload?.taxonomy.filter((item) => item.level === 'AREA') ?? [], [payload]);
  const subareas = useMemo(() => payload?.taxonomy.filter((item) => item.level === 'SUBAREA' && (!submissionForm.taxonomyAreaId || item.parentId === submissionForm.taxonomyAreaId)) ?? [], [payload, submissionForm.taxonomyAreaId]);
  const draftSubmissions = useMemo(() => payload?.submissions.filter((item) => item.status === 'DRAFT' || item.status === 'INCOMPLETE') ?? [], [payload]);

  async function saveConfig(patch: Partial<Payload['config']>) {
    setSaving('config'); setError('');
    try {
      await api(`/scientific-events/${eventId}/submissions/config`, { method: 'PUT', body: JSON.stringify(patch) });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar as regras de submissão.');
    } finally { setSaving(''); }
  }

  async function createModality(event: FormEvent) {
    event.preventDefault(); setSaving('modality'); setError('');
    try {
      await api(`/scientific-events/${eventId}/submissions/modalities`, {
        method: 'POST', body: JSON.stringify({ name: modalityForm.name, description: modalityForm.description || undefined }),
      });
      setModalityForm({ name: '', description: '' });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a modalidade.');
    } finally { setSaving(''); }
  }

  async function createSubmission(event: FormEvent) {
    event.preventDefault(); setSaving('submission'); setError('');
    try {
      const result = await api<Payload & { createdSubmissionId?: string }>(`/scientific-events/${eventId}/submissions`, {
        method: 'POST',
        body: JSON.stringify({
          modalityId: submissionForm.modalityId,
          title: submissionForm.title,
          abstractText: submissionForm.abstractText || undefined,
          keywords: submissionForm.keywords.split(',').map((item) => item.trim()).filter(Boolean),
          taxonomyAreaId: submissionForm.taxonomyAreaId || undefined,
          taxonomySubareaId: submissionForm.taxonomySubareaId || undefined,
        }),
      });
      setPayload(result);
      setSubmissionForm((current) => ({ ...current, title: '', abstractText: '', keywords: '', taxonomyAreaId: '', taxonomySubareaId: '' }));
      if (result.createdSubmissionId) setAuthorForm((current) => ({ ...current, submissionId: result.createdSubmissionId! }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o trabalho.');
    } finally { setSaving(''); }
  }

  async function addAuthor(event: FormEvent) {
    event.preventDefault(); setSaving('author'); setError('');
    const selected = payload?.submissions.find((item) => item.id === authorForm.submissionId);
    const sortOrder = (selected?.authors.length ?? 0) + 1;
    try {
      await api(`/scientific-events/${eventId}/submissions/${authorForm.submissionId}/authors`, {
        method: 'POST',
        body: JSON.stringify({ personId: authorForm.personId, sortOrder, isPresenter: authorForm.isPresenter, isCorresponding: authorForm.isCorresponding }),
      });
      setAuthorForm((current) => ({ ...current, personId: '', isPresenter: false, isCorresponding: false }));
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o autor.');
    } finally { setSaving(''); }
  }

  async function submitWork(submissionId: string) {
    setSaving(`submit:${submissionId}`); setError('');
    try {
      await api(`/scientific-events/${eventId}/submissions/${submissionId}/submit`, {
        method: 'POST', body: JSON.stringify({ fileKey: fileForm[submissionId] || undefined }),
      });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'O trabalho ainda possui pendências para submissão.');
    } finally { setSaving(''); }
  }

  if (loading) return <main className={styles.page}><div className={styles.loading}>A EVA está preparando o portal de trabalhos científicos...</div></main>;
  if (!payload) return <main className={styles.page}><div className={styles.error}>{error || 'Submissões indisponíveis.'}</div></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <Link className={styles.back} href={`/eventos/${eventId}/cientifico`}>Voltar à Central científica</Link>
    </header>

    <section className={styles.workspace}>
      <div className={styles.hero}>
        <div><span className={styles.eyebrow}>GATE A6 · TRABALHOS CIENTÍFICOS</span><h1>{payload.event.name}</h1><p>Configure as regras e crie trabalhos em etapas curtas. O sistema preserva versões submetidas e nunca altera autoria ou conteúdo submetido silenciosamente.</p></div>
        <div className={styles.metrics}><div><strong>{payload.summary.total}</strong><span>Trabalhos</span></div><div><strong>{payload.summary.drafts}</strong><span>Rascunhos</span></div><div><strong>{payload.summary.submitted}</strong><span>Submetidos</span></div></div>
      </div>

      <div className={styles.eva}><div className={styles.evaMark}>EVA</div><div><strong>Próxima ação recomendada</strong><p>{payload.nextAction}</p></div></div>
      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.steps}><span>1. Regras</span><span>2. Modalidade</span><span>3. Trabalho</span><span>4. Autores</span><span>5. Revisar</span><span>6. Submeter</span></div>

      <section className={styles.grid}>
        <article className={styles.card}>
          <span className={styles.step}>1 · COMO FUNCIONA?</span><h2>Regras da submissão</h2><p>Defina apenas o que será obrigatório. Área, subárea e arquivo podem permanecer opcionais conforme o perfil do evento.</p>
          <div className={styles.ruleList}>
            <label><input type="checkbox" checked={payload.config.requireArea} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireArea: e.target.checked, ...(e.target.checked ? {} : { requireSubarea: false }) })} /> Exigir área científica</label>
            <label><input type="checkbox" checked={payload.config.requireSubarea} disabled={Boolean(saving) || !payload.config.requireArea} onChange={(e) => saveConfig({ requireSubarea: e.target.checked, requireArea: true })} /> Exigir subárea</label>
            <label><input type="checkbox" checked={payload.config.requireFile} disabled={Boolean(saving)} onChange={(e) => saveConfig({ requireFile: e.target.checked })} /> Exigir arquivo no envio</label>
            <label><input type="checkbox" checked={payload.config.allowCorrections} disabled={Boolean(saving)} onChange={(e) => saveConfig({ allowCorrections: e.target.checked })} /> Permitir correções controladas</label>
          </div>
          <label className={styles.field}>Modelo de avaliação<select value={payload.config.reviewMode} disabled={Boolean(saving)} onChange={(e) => saveConfig({ reviewMode: e.target.value as ReviewMode })}><option value="OPEN">Revisão aberta</option><option value="SINGLE_BLIND">Revisão cega simples</option><option value="DOUBLE_BLIND">Revisão duplo-cega</option></select><small>Atual: {reviewModeLabel[payload.config.reviewMode]}</small></label>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>2 · O QUE SERÁ ACEITO?</span><h2>Modalidades</h2><p>Ex.: Resumo simples, trabalho completo, pôster ou apresentação oral.</p>
          <form className={styles.form} onSubmit={createModality}>
            <label className={styles.field}>Nome<input required minLength={2} value={modalityForm.name} onChange={(e) => setModalityForm({ ...modalityForm, name: e.target.value })} placeholder="Resumo científico" /></label>
            <label className={styles.field}>Descrição <small>Opcional</small><textarea value={modalityForm.description} onChange={(e) => setModalityForm({ ...modalityForm, description: e.target.value })} placeholder="Resumo de até 500 palavras" /></label>
            <button className={styles.primary} disabled={Boolean(saving)}>{saving === 'modality' ? 'Salvando…' : 'Adicionar modalidade'}</button>
          </form>
          <div className={styles.chips}>{activeModalities.map((item) => <span key={item.id}>{item.name}</span>)}</div>
        </article>

        <article className={styles.cardWide}>
          <span className={styles.step}>3 · CRIE O TRABALHO</span><h2>Dados essenciais</h2><p>Comece pelo título e modalidade. Resumo, palavras-chave e taxonomia podem ser preenchidos conforme a configuração do evento.</p>
          <form className={styles.form} onSubmit={createSubmission}>
            <div className={styles.twoCols}>
              <label className={styles.field}>Modalidade<select required value={submissionForm.modalityId} onChange={(e) => setSubmissionForm({ ...submissionForm, modalityId: e.target.value })}><option value="">Selecione</option>{activeModalities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className={styles.field}>Título<input required minLength={2} value={submissionForm.title} onChange={(e) => setSubmissionForm({ ...submissionForm, title: e.target.value })} placeholder="Impacto da inteligência artificial na prática clínica" /></label>
            </div>
            <label className={styles.field}>Resumo <small>Opcional nesta etapa</small><textarea value={submissionForm.abstractText} onChange={(e) => setSubmissionForm({ ...submissionForm, abstractText: e.target.value })} placeholder="Apresente objetivo, método, resultados e conclusão." /></label>
            <label className={styles.field}>Palavras-chave <small>Separe por vírgulas</small><input value={submissionForm.keywords} onChange={(e) => setSubmissionForm({ ...submissionForm, keywords: e.target.value })} placeholder="inteligência artificial, saúde, inovação" /></label>
            <details className={styles.optional}><summary>Área e subárea {payload.config.requireArea ? '(necessário antes do envio)' : '(opcional)'}</summary><div className={styles.twoCols}>
              <label className={styles.field}>Área<select value={submissionForm.taxonomyAreaId} onChange={(e) => setSubmissionForm({ ...submissionForm, taxonomyAreaId: e.target.value, taxonomySubareaId: '' })}><option value="">Não definir agora</option>{areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className={styles.field}>Subárea<select value={submissionForm.taxonomySubareaId} onChange={(e) => setSubmissionForm({ ...submissionForm, taxonomySubareaId: e.target.value })}><option value="">Não definir agora</option>{subareas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </div></details>
            <button className={styles.primary} disabled={Boolean(saving) || !activeModalities.length}>{saving === 'submission' ? 'Criando…' : 'Criar rascunho'}</button>
          </form>
        </article>

        <article className={styles.card}>
          <span className={styles.step}>4 · QUEM PARTICIPA?</span><h2>Autores e apresentador</h2><p>Reutilize pessoas já cadastradas na estrutura científica; não criamos cadastro paralelo de autor.</p>
          <form className={styles.form} onSubmit={addAuthor}>
            <label className={styles.field}>Trabalho<select required value={authorForm.submissionId} onChange={(e) => setAuthorForm({ ...authorForm, submissionId: e.target.value })}><option value="">Selecione</option>{draftSubmissions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className={styles.field}>Pessoa<select required value={authorForm.personId} onChange={(e) => setAuthorForm({ ...authorForm, personId: e.target.value })}><option value="">Selecione</option>{payload.people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.institution ? ` — ${person.institution}` : ''}</option>)}</select></label>
            <label className={styles.check}><input type="checkbox" checked={authorForm.isPresenter} onChange={(e) => setAuthorForm({ ...authorForm, isPresenter: e.target.checked })} /> Será o apresentador</label>
            <label className={styles.check}><input type="checkbox" checked={authorForm.isCorresponding} onChange={(e) => setAuthorForm({ ...authorForm, isCorresponding: e.target.checked })} /> Autor correspondente</label>
            <button className={styles.primary} disabled={Boolean(saving) || !draftSubmissions.length}>{saving === 'author' ? 'Adicionando…' : 'Adicionar autor'}</button>
          </form>
        </article>

        <article className={styles.cardWide}>
          <span className={styles.step}>5–6 · REVISAR E SUBMETER</span><h2>Trabalhos do evento</h2><p>Antes do envio, confira modalidade, autoria e campos obrigatórios. Ao submeter, uma versão imutável é preservada para auditoria.</p>
          <div className={styles.submissionList}>
            {!payload.submissions.length && <div className={styles.empty}>Nenhum trabalho criado ainda.</div>}
            {payload.submissions.map((submission) => <div className={styles.submission} key={submission.id}>
              <div className={styles.submissionMain}><div><span className={styles.badge}>{statusLabel[submission.status]}</span><h3>{submission.title}</h3><p>{submission.modality.name} · {submission.authors.length} autor(es){submission.currentVersion ? ` · versão ${submission.currentVersion}` : ''}</p></div><div className={styles.authorLine}>{submission.authors.map((author) => <span key={author.id}>{author.sortOrder}. {author.person.name}{author.isPresenter ? ' · apresentador' : ''}</span>)}</div></div>
              {(submission.status === 'DRAFT' || submission.status === 'INCOMPLETE') && <div className={styles.submitBox}>
                <label className={styles.field}>Referência do arquivo <small>{payload.config.requireFile ? 'Obrigatório para envio' : 'Opcional'}</small><input value={fileForm[submission.id] ?? ''} onChange={(e) => setFileForm({ ...fileForm, [submission.id]: e.target.value })} placeholder="trabalhos/resumo-001.pdf" /></label>
                <button className={styles.primary} disabled={Boolean(saving)} onClick={() => submitWork(submission.id)}>{saving === `submit:${submission.id}` ? 'Submetendo…' : 'Submeter versão'}</button>
              </div>}
            </div>)}
          </div>
        </article>
      </section>
    </section>
  </main>;
}
