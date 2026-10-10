'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import ScientificRanking from '../../../../../components/scientific-ranking';
import styles from '../../painel/financeiro/page.module.css';

export default function ScientificRankingPage() {
  const { id } = useParams<{ id: string }>();
  return <main className={styles.page} id="main-content">
    <Link href={`/eventos/${id}/cientifico`}>← Voltar à área científica</Link>
    <header>
      <p className={styles.eyebrow}>EVENTO · CIENTÍFICO</p>
      <h1>Classificação dos trabalhos</h1>
      <p>O corte eliminatório e a ordem classificatória usam os pareceres já enviados deste evento. A comissão continua decidindo o aceite ou a recusa.</p>
    </header>
    <ScientificRanking eventId={id} />
  </main>;
}
