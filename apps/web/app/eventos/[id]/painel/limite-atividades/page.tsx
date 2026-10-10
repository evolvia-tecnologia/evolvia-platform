'use client';

import { useParams } from 'next/navigation';
import ActivityEnrollmentLimit from '../../../../../components/activity-enrollment-limit';
import styles from '../../../../../components/activity-enrollment-limit.module.css';
import EventWorkspace from '../../../../../components/event-workspace';

export default function ActivityEnrollmentLimitPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return (
    <EventWorkspace key={id} eventId={id} section="overview">
      <main className={styles.page} id="main-content">
        <h1>Limite de atividades</h1>
        <p>A pessoa reserva a vaga na própria agenda. Este teto não confirma presença e não escolhe quem apresenta.</p>
        <ActivityEnrollmentLimit eventId={id} />
      </main>
    </EventWorkspace>
  );
}
