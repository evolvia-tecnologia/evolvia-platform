'use client';

import { useEffect, useState } from 'react';

type Policy = { published: boolean; message: string; pending: string | null };

export default function RegistrationRefundNotice({ slug, paid }: { slug: string; paid: boolean }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(paid);

  useEffect(() => {
    if (!paid) return;
    let active = true;
    setLoading(true);
    fetch(`/api/public/events/${encodeURIComponent(slug)}/refund-policy`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || payload.message || 'Não foi possível mostrar a regra de reembolso.');
        return payload as Policy;
      })
      .then((next) => { if (active) { setPolicy(next); setError(''); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível mostrar a regra de reembolso.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, paid]);

  if (!paid) return null;
  return <section aria-labelledby="refund-policy-title">
    <h2 id="refund-policy-title">Regra de reembolso</h2>
    {loading && <p role="status">Carregando a regra de reembolso…</p>}
    {error && <p role="alert">{error}</p>}
    {policy && <p>{policy.message}</p>}
  </section>;
}
