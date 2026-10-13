'use client';

import Link from 'next/link';
import styles from '../../../../components/post-event-reports.module.css';
import { useParams } from 'next/navigation';
import EventAdminDashboard from '../../../../components/event-admin-dashboard';

export default function PainelDoEventoPage() {
  const params = useParams<{ id: string }>();
  return <><EventAdminDashboard eventId={params.id} section="overview" /><nav className={styles.entry} aria-label="Resultados do evento"><div><strong>Pós-evento</strong><p>Consulte resultados de inscrições, credenciamento e campos habilitados.</p></div><Link className={styles.secondary} href={`/eventos/${params.id}/painel/pos-evento`}>Abrir relatórios</Link></nav><nav className={styles.entry} aria-label="Pessoas do evento"><div><strong>Inscritos</strong><p>Veja quem confirmou e exporte a ficha deste evento, um campo por coluna.</p></div><Link className={styles.secondary} href={`/eventos/${params.id}/painel/pessoas`}>Abrir inscritos</Link></nav></>;
}

