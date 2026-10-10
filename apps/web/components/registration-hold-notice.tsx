'use client';

import { useEffect, useState } from 'react';
import styles from './registration-hold-notice.module.css';

type PublicRegistration = {
  event?: { registrationMode?: string };
  reservationMinutes?: number;
};

export default function RegistrationHoldNotice({ slug }: { slug: string }) {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/public/events/${encodeURIComponent(slug)}/registration`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<PublicRegistration>;
      })
      .then((payload) => {
        if (!payload || payload.event?.registrationMode !== 'PAID') return;
        if (typeof payload.reservationMinutes !== 'number' || !Number.isInteger(payload.reservationMinutes)) return;
        setMinutes(payload.reservationMinutes);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [slug]);

  if (minutes === null) return null;
  return (
    <p className={styles.notice} role="status">
      A vaga paga fica reservada por {minutes} minutos depois que a ficha é enviada. Se o pagamento não for concluído nesse prazo, a vaga volta a ficar disponível.
    </p>
  );
}
