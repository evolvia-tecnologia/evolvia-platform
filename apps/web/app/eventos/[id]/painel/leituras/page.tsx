'use client';

import { useParams } from 'next/navigation';
import EventWorkspace from '../../../../../components/event-workspace';
import OperationalReadings from '../../../../../components/operational-readings';
import styles from '../../../../../components/operational-readings.module.css';

export default function OperationalReadingsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return (
    <EventWorkspace key={id} eventId={id} section="overview">
      <main className={styles.page} id="main-content">
        <h1>Contas do evento</h1>
        <p>Quinze somas deste evento. A comissão continua decidindo o trabalho, e o certificado continua no fluxo próprio.</p>
        <OperationalReadings eventId={id} />
      </main>
    </EventWorkspace>
  );
}
