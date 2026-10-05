'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './scientific-event-central.module.css';

type Choice = 'RECOMMENDED' | 'CUSTOMIZED' | 'LATER';

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

const icons: Record<string, string> = {
  structure: 'A3', submissions: 'T', review: '✓', decisions: 'D', speakers: 'P', program: '▦', communication: '✉', publication: 'GO',
};

const statusLabels: Record<ScientificCentralBlock['decisionStatus'], string> = {
  PENDING: 'Pendente', DECIDED: 'Definido', LATER: 'Decidir depois',
};

function editorPath(eventId: string, blockId: string): string | null {
  if (blockId === 'structure') return `/eventos/${eventId}/cientifico/estrutura`;
  if (blockId === 'speakers') return `/eventos/${eventId}/cientifico/palestrantes`;
  if (blockId === 'program') return `/eventos/${eventId}/cientifico/programacao`;
  if (blockId === 'submissions') return `/eventos/${eventId}/cientifico/submissoes`;
  if (blockId === 'review') return `/eventos/${eventId}/cientifico/avaliacao`;
  return null;
}

export default function ScientificEventCentral({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ScientificCentralPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBlock, setSavingBlock] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    let active = true;
    api<ScientificCentralPayload>(`/scientific-events/${eventId}/central`)
      .then((result) => { if (active) setPayload(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a Central científica.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, router]);

  const nextBlock = useMemo(() => payload?.blocks.find((block) => block.choice === null) ?? null, [payload]);

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
      <div className={styles.hero}><div className={styles.heroMain}><p className={styles.eyebrow}>CENTRAL DO EVENTO CIENTÍFICO</p><h1>{payload.event.name}</h1><p className={styles.lead}>Configure a jornada científica em blocos curtos. Monte a grade antes de publicar a página: depois de publicar, a fundação e a grade científica deixam de aceitar alterações. A EVA mostra o que é recomendado, o que pode ser personalizado e o que pode ficar para depois, sem publicar nada automaticamente.</p></div><aside className={styles.summary}><div className={styles.summaryHead}><div><span>Progresso da Central</span><strong>{payload.central.completionPercent}%</strong></div><span>{payload.central.decidedCount} de {payload.central.totalCount} definidos</span></div><div className={styles.track}><div className={styles.trackValue} style={{ width: `${payload.central.completionPercent}%` }} /></div><div className={styles.summaryGrid}><div className={styles.metric}><strong>{payload.central.pendingCount}</strong><span>Pendências iniciais</span></div><div className={styles.metric}><strong>{payload.event.status === 'SETUP' ? 'Setup' : payload.event.status}</strong><span>Estado do evento</span></div></div></aside></div>
      <div className={styles.eva}><div className={styles.evaMark}>EVA</div><div><strong>Cada pessoa atua na área certa</strong><p>A Central é a área administrativa do organizador. A3–A5 organizam estrutura, convidados e programação; A6 configura o processo de submissão e acompanha trabalhos; A7 configura e acompanha avaliações. Criar/submeter trabalhos e preencher pareceres pertencem, respectivamente, às áreas próprias do autor e do avaliador.</p><p><Link href={`/eventos/${eventId}/cientifico/submissoes#estacao`}>Abrir a estação científica</Link> para publicar resumo e e-poster e copiar o link do totem.</p></div></div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.sectionHead}><div><h2>Jornada científica</h2><p>Defina agora apenas o necessário para orientar a próxima etapa. Ao abrir uma configuração disponível, cada campo explica sua finalidade e deixa claro quem é responsável pela ação.</p></div><span className={styles.eyebrow}>SELF-SERVICE ASSISTIDO</span></div>
      <div className={styles.cards}>{payload.blocks.map((block) => {
        const badgeClass = block.decisionStatus === 'DECIDED' ? styles.decided : block.decisionStatus === 'LATER' ? styles.later : styles.pending;
        const busy = savingBlock === block.id; const available = block.moduleStatus === 'AVAILABLE'; const path = editorPath(eventId, block.id);
        return <article className={styles.card} key={block.id}><div className={styles.cardHead}><div className={styles.cardIdentity}><div className={styles.icon}>{icons[block.id] ?? '•'}</div><div><span className={styles.gate}>{block.gate}</span><h3>{block.label}</h3></div></div><span className={`${styles.badge} ${badgeClass}`}>{statusLabels[block.decisionStatus]}</span></div><p className={styles.description}>{block.description}</p><p className={styles.availability}><strong>{block.availabilityLabel}.</strong> {available ? 'Esta configuração administrativa já pode ser usada pelo organizador.' : 'A Central registra sua decisão e prepara a sequência; a configuração detalhada será liberada no Gate correspondente.'}</p><div className={styles.actions}><button className={`${styles.choice} ${block.choice === 'RECOMMENDED' ? styles.choiceSelected : ''}`} disabled={Boolean(savingBlock)} onClick={() => choose(block.id, 'RECOMMENDED')}>{busy && block.choice !== 'RECOMMENDED' ? 'Salvando…' : 'Usar recomendação'}</button><button className={`${styles.choice} ${block.choice === 'CUSTOMIZED' ? styles.choiceSelected : ''}`} disabled={Boolean(savingBlock)} onClick={() => choose(block.id, 'CUSTOMIZED')}>Personalizar</button><button className={`${styles.choice} ${block.choice === 'LATER' ? styles.choiceSelected : ''}`} disabled={Boolean(savingBlock)} onClick={() => choose(block.id, 'LATER')}>Decidir depois</button>{available && path && <Link className={`${styles.button} ${styles.primary} ${styles.configure}`} href={path}>Abrir configuração do Gate {block.gate}</Link>}</div></article>;
      })}</div>
      <div className={styles.next}><div><strong>{nextBlock ? `Próxima decisão: ${nextBlock.label}` : 'Decisões iniciais concluídas'}</strong><p>{payload.central.nextAction}</p></div><Link className={`${styles.button} ${styles.primary}`} href={`/eventos/${eventId}/painel`}>Voltar ao menu do evento</Link></div>
    </section>
  </main>;
}
