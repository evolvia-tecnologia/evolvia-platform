'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './scientific-event-central.module.css';

type Choice = 'RECOMMENDED' | 'CUSTOMIZED' | 'LATER';
type ScientificFlow = 'entry' | 'works' | 'program';

type ScientificCentralBlock = {
  id: string;
  label: string;
  description: string;
  gate: string;
  availabilityLabel: string;
  moduleStatus: 'AVAILABLE' | 'PREPARATION_ONLY';
  choice: Choice | null;
  active: boolean;
  decisionStatus: 'PENDING' | 'DECIDED' | 'LATER';
};

type ScientificCentralPayload = {
  event: {
    id: string;
    name: string;
    status: string;
    profileCode: string;
    organizationId: string;
    organization: { id: string; name: string; slug: string; status: string };
    updatedAt: string;
  };
  central: {
    completionPercent: number;
    decidedCount: number;
    totalCount: number;
    pendingCount: number;
    nextAction: string;
  };
  blocks: ScientificCentralBlock[];
};

const WORK_IDS = ['submissions', 'review', 'decisions'];
const PROGRAM_IDS = ['structure', 'speakers', 'program'];

const icons: Record<string, string> = {
  structure: 'A3', submissions: 'T', review: '✓', decisions: 'D', speakers: 'P', program: '▦', communication: '✉', publication: 'GO',
};

const statusLabels: Record<ScientificCentralBlock['decisionStatus'], string> = {
  PENDING: 'Pendente', DECIDED: 'Definido', LATER: 'Decidir depois',
};

const eventStatusLabels: Record<string, string> = {
  SETUP: 'Preparação', DRAFT: 'Rascunho', HOMOLOGATION: 'Homologação',
  READY_TO_PUBLISH: 'Pronto para publicar', SUSPENDED: 'Suspenso', FINISHED: 'Finalizado',
  PUBLISHED: 'Publicado', CLOSED: 'Encerrado', CANCELLED: 'Cancelado',
};

const flowNotes: Record<string, string> = {
  structure: 'As áreas também classificam o resumo enviado pelo participante. O envio, a distribuição, a avaliação e o resultado ficam no fluxo de Trabalhos.',
  submissions: 'O participante envia o resumo na própria área. Esta etapa configura o processo e acompanha os envios.',
  review: 'A distribuição e o acompanhamento da avaliação ficam neste fluxo. O parecer é preenchido pelo avaliador.',
  decisions: 'Resultados do trabalho: aceite, recusa e cartas. Horários e atividades não entram aqui.',
  speakers: 'Cadastro de quem participa da grade. Não configura submissão de resumo.',
  program: 'Locais, dias, horários e atividades desta grade.',
};

const copy: Record<ScientificFlow, { eyebrow: string; title: string; lead: string; evaTitle: string; evaBody: string; sectionTitle: string; sectionBody: string }> = {
  entry: {
    eyebrow: 'CENTRAL DO EVENTO CIENTÍFICO',
    title: 'Área científica',
    lead: 'Trabalhos e programação científica são fluxos separados. Em Trabalhos ficam a configuração da submissão, o envio do resumo pelo participante, a distribuição, a avaliação e os resultados. Na programação ficam palestrantes, atividades, locais, dias e horários. Após a publicação, a fundação e a grade científica deixam de aceitar alterações.',
    evaTitle: 'Dois fluxos, duas portas',
    evaBody: 'Não misture resumos com a grade. Abra Trabalhos para configurar a submissão, acompanhar o envio do participante, distribuir, avaliar e ver resultados. Abra Programação para cadastrar palestrantes, atividades, locais, dias e horários.',
    sectionTitle: 'Fora dos dois fluxos',
    sectionBody: 'Comunicação e publicação do evento continuam aqui, sem entrar na sequência de trabalhos nem na grade.',
  },
  works: {
    eyebrow: 'FLUXO DE TRABALHOS',
    title: 'Trabalhos',
    lead: 'Configure a submissão de resumos. O participante envia o trabalho na própria área. Neste fluxo ficam a distribuição, a avaliação e os resultados.',
    evaTitle: 'Este fluxo é só de resumos',
    evaBody: 'A EVA acompanha a configuração, a distribuição, a avaliação e os resultados. O participante envia o trabalho na área dele. Palestrantes, atividades, locais, dias e horários ficam na programação.',
    sectionTitle: 'Configuração, distribuição, avaliação e resultados',
    sectionBody: 'Escolha uma recomendação ou abra a etapa deste fluxo.',
  },
  program: {
    eyebrow: 'GRADE DE PROGRAMAÇÃO',
    title: 'Programação científica',
    lead: 'Cadastre palestrantes, atividades, locais, dias e horários. A submissão de resumos, a distribuição, a avaliação e os resultados ficam no fluxo de Trabalhos.',
    evaTitle: 'Esta página é a grade',
    evaBody: 'A EVA ajuda a montar palestrantes, atividades, locais, dias e horários. A configuração de resumos não entra nesta grade.',
    sectionTitle: 'Palestrantes, atividades, locais, dias e horários',
    sectionBody: 'Escolha uma recomendação ou abra a etapa desta grade.',
  },
};

function editorPath(eventId: string, blockId: string): string | null {
  if (blockId === 'structure') return `/eventos/${eventId}/cientifico/estrutura`;
  if (blockId === 'speakers') return `/eventos/${eventId}/cientifico/palestrantes`;
  if (blockId === 'program') return `/eventos/${eventId}/cientifico/programacao`;
  if (blockId === 'submissions') return `/eventos/${eventId}/cientifico/submissoes`;
  if (blockId === 'review') return `/eventos/${eventId}/cientifico/avaliacao`;
  return null;
}

function blocksIn(flow: ScientificFlow, blocks: ScientificCentralBlock[]) {
  const ids = flow === 'works' ? WORK_IDS : flow === 'program' ? PROGRAM_IDS : null;
  if (!ids) return blocks.filter((block) => !WORK_IDS.includes(block.id) && !PROGRAM_IDS.includes(block.id));
  return ids.flatMap((id) => {
    const block = blocks.find((item) => item.id === id);
    return block ? [block] : [];
  });
}

function countDecisions(blocks: ScientificCentralBlock[]) {
  const decided = blocks.filter((block) => block.decisionStatus !== 'PENDING').length;
  const total = blocks.length;
  return {
    decided,
    total,
    pending: total - decided,
    percent: total === 0 ? 0 : Math.round((decided / total) * 100),
  };
}

export default function ScientificEventCentral({ eventId, flow = 'entry' }: { eventId: string; flow?: ScientificFlow }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ScientificCentralPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBlock, setSavingBlock] = useState('');
  const [error, setError] = useState('');
  const text = copy[flow];

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    let active = true;
    api<ScientificCentralPayload>(`/scientific-events/${eventId}/central`)
      .then((result) => { if (active) setPayload(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a Central científica.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, router]);

  const worksProgress = useMemo(() => countDecisions(blocksIn('works', payload?.blocks ?? [])), [payload]);
  const programProgress = useMemo(() => countDecisions(blocksIn('program', payload?.blocks ?? [])), [payload]);
  const visible = useMemo(() => blocksIn(flow, payload?.blocks ?? []), [flow, payload]);
  const nextBlock = visible.find((block) => block.choice === null) ?? null;
  const hubProgress = flow === 'works' ? worksProgress : programProgress;

  async function choose(blockId: string, choice: Choice) {
    setSavingBlock(blockId); setError('');
    try {
      const result = await api<ScientificCentralPayload>(`/scientific-events/${eventId}/central`, { method: 'PATCH', body: JSON.stringify({ blockId, choice }) });
      setPayload(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar esta decisão.');
    } finally { setSavingBlock(''); }
  }

  if (loading) return <main className={styles.page}><header className={styles.topbar}><Link className={styles.brand} href="/painel">EVOLVIA</Link></header><div className={styles.loading}><div className={styles.loadingBox}><div className={styles.loadingMark}>E</div><p>A EVA está organizando sua Central científica...</p></div></div></main>;
  if (!payload) return <main className={styles.page}><header className={styles.topbar}><Link className={styles.brand} href="/painel">EVOLVIA</Link></header><section className={styles.workspace}><div className={styles.error}>{error || 'A Central científica não pôde ser carregada.'}</div><Link className={`${styles.button} ${styles.secondary}`} href={`/eventos/${eventId}/painel`}>Voltar ao menu do evento</Link></section></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}><Link className={styles.brand} href="/painel">EVOLVIA</Link><div className={styles.topActions}><Link className={`${styles.button} ${styles.ghost}`} href={`/eventos/${eventId}/painel`}>Menu do evento</Link></div></header>
    <section className={styles.workspace}>
      <div className={styles.hero}>
        <div className={styles.heroMain}>
          <p className={styles.eyebrow}>{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className={styles.lead}>{text.lead}</p>
        </div>
        {flow === 'entry' ? <aside className={styles.summary}>
          <div className={styles.summaryHead}><div><span>Dois fluxos separados</span><strong>Trabalhos e programação</strong></div></div>
          <div className={styles.summaryGrid}>
            <div className={styles.metric}><strong>{worksProgress.decided} de {worksProgress.total}</strong><span>Trabalhos definidos</span></div>
            <div className={styles.metric}><strong>{programProgress.decided} de {programProgress.total}</strong><span>Programação definida</span></div>
          </div>
        </aside> : <aside className={styles.summary}>
          <div className={styles.summaryHead}><div><span>Progresso deste fluxo</span><strong>{hubProgress.percent}%</strong></div><span>{hubProgress.decided} de {hubProgress.total} definidos</span></div>
          <div className={styles.track}><div className={styles.trackValue} style={{ width: `${hubProgress.percent}%` }} /></div>
          <div className={styles.summaryGrid}>
            <div className={styles.metric}><strong>{hubProgress.pending}</strong><span>Pendências deste fluxo</span></div>
            <div className={styles.metric}><strong>{eventStatusLabels[payload.event.status] ?? 'Em andamento'}</strong><span>Estado do evento</span></div>
          </div>
        </aside>}
      </div>
      <div className={styles.eva}>
        <div className={styles.evaMark}>EVA</div>
        <div>
          <strong>{text.evaTitle}</strong>
          <p>{text.evaBody}</p>
          {flow === 'works' && <p><Link href={`/eventos/${eventId}/cientifico/submissoes#estacao`}>Abrir a estação científica</Link> para publicar resumo e e-poster e copiar o link do totem.</p>}
        </div>
      </div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {flow === 'entry' && <div className={styles.doors}>
        <article className={styles.door}>
          <p className={styles.eyebrow}>TRABALHOS</p>
          <h2>Resumos</h2>
          <p>Configuração da submissão, envio pelo participante, distribuição, avaliação e resultados.</p>
          <Link className={`${styles.button} ${styles.primary}`} href={`/eventos/${eventId}/cientifico/trabalhos`}>Abrir trabalhos</Link>
        </article>
        <article className={styles.door}>
          <p className={styles.eyebrow}>PROGRAMAÇÃO</p>
          <h2>Grade científica</h2>
          <p>Palestrantes, atividades, locais, dias e horários.</p>
          <Link className={`${styles.button} ${styles.primary}`} href={`/eventos/${eventId}/cientifico/grade`}>Abrir a programação</Link>
        </article>
      </div>}
      <div className={styles.sectionHead}><div><h2>{text.sectionTitle}</h2><p>{text.sectionBody}</p></div><span className={styles.eyebrow}>SELF-SERVICE ASSISTIDO</span></div>
      <div className={styles.cards}>{visible.map((block) => {
        const badgeClass = block.decisionStatus === 'DECIDED' ? styles.decided : block.decisionStatus === 'LATER' ? styles.later : styles.pending;
        const busy = savingBlock === block.id;
        const available = block.moduleStatus === 'AVAILABLE';
        const path = editorPath(eventId, block.id);
        return <article className={styles.card} key={block.id}>
          <div className={styles.cardHead}>
            <div className={styles.cardIdentity}><div className={styles.icon}>{icons[block.id] ?? '•'}</div><div><span className={styles.gate}>{block.gate}</span><h3>{block.label}</h3></div></div>
            <span className={`${styles.badge} ${badgeClass}`}>{statusLabels[block.decisionStatus]}</span>
          </div>
          <p className={styles.description}>{block.description} {flowNotes[block.id]}</p>
          <p className={styles.availability}><strong>{block.availabilityLabel}.</strong> {available ? 'Esta configuração administrativa já pode ser usada pelo organizador.' : 'A Central registra sua decisão e prepara a sequência; a configuração detalhada será liberada no Gate correspondente.'}</p>
          <div className={styles.actions}>
            <button className={`${styles.choice} ${block.choice === 'RECOMMENDED' ? styles.choiceSelected : ''}`} disabled={Boolean(savingBlock)} onClick={() => choose(block.id, 'RECOMMENDED')}>{busy && block.choice !== 'RECOMMENDED' ? 'Salvando…' : 'Usar recomendação'}</button>
            <button className={`${styles.choice} ${block.choice === 'CUSTOMIZED' ? styles.choiceSelected : ''}`} disabled={Boolean(savingBlock)} onClick={() => choose(block.id, 'CUSTOMIZED')}>Personalizar</button>
            <button className={`${styles.choice} ${block.choice === 'LATER' ? styles.choiceSelected : ''}`} disabled={Boolean(savingBlock)} onClick={() => choose(block.id, 'LATER')}>Decidir depois</button>
            {available && path && <Link className={`${styles.button} ${styles.primary} ${styles.configure}`} href={path}>Abrir configuração</Link>}
          </div>
        </article>;
      })}</div>
      <div className={styles.next}>
        <div>
          <strong>{flow === 'entry' ? 'Escolha um fluxo' : nextBlock ? `Próxima decisão: ${nextBlock.label}` : 'Decisões deste fluxo concluídas'}</strong>
          <p>{flow === 'entry' ? 'Trabalhos e programação não compartilham a mesma sequência.' : nextBlock ? `Continue em ${nextBlock.label}, ainda neste fluxo.` : 'As decisões visíveis desta página já foram registradas.'}</p>
        </div>
        <Link className={`${styles.button} ${styles.primary}`} href={flow === 'entry' ? `/eventos/${eventId}/painel` : `/eventos/${eventId}/cientifico`}>{flow === 'entry' ? 'Voltar ao menu do evento' : 'Voltar à área científica'}</Link>
      </div>
    </section>
  </main>;
}
