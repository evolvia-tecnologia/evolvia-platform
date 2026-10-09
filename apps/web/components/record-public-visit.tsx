'use client';

import { useEffect, useRef } from 'react';
import { publicVisitRequest } from '../lib/public-page-visit';

/** Conta uma abertura no navegador, uma vez por montagem. Não envia identificação. */
export default function RecordPublicVisit({ slug }: { slug: string }) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === slug) return;
    sent.current = slug;
    const { url, init } = publicVisitRequest(slug);
    void fetch(url, init).catch(() => undefined);
  }, [slug]);
  return null;
}
