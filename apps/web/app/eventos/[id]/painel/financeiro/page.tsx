'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, api, getToken } from '../../../../../lib/api';
import styles from './page.module.css';

type Configuration = { revision: number; sellerOrganizationId: string; sellerLegalProfileRevision: number } | null;
type Response = {
  event: { id: string; organizationId: string; status: string; registrationMode: string };
  seller: { kind: 'PERSON' | 'COMPANY'; legalName: string; tradeName: string | null; taxId: string; revision: number } | null;
  configuration: Configuration;
  ready: boolean;
  documentIssuanceAvailable: false;
};

export default function EventFinancialPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    if (!getToken()) { router.replace('/login'); return; }
    api<Response>(`/events/${encodeURIComponent(id)}/financial-responsibility`)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o responsável financeiro.'))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function save() {
    if (!data?.seller || saving) return;
    setSaving(true); setError('');
    try {
      const result = await api<Response>(`/events/${encodeURIComponent(id)}/financial-responsibility`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedRevision: data.configuration?.revision ?? 0,
          sellerOrganizationId: data.event.organizationId,
        }),
      });
      setData(result);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 409
        ? 'A configuração ou os dados da organização mudaram. Recarregue antes de confirmar novamente.'
        : reason instanceof Error ? reason.message : 'Não foi possível salvar.');
    } finally { setSaving(false); }
  }

  return <main className={styles.page} id="main-content">
    <Link href={`/eventos/${id}/painel`}>← Voltar ao menu do evento</Link>
    <header><p className={styles.eyebrow}>EVENTO · FINANCEIRO</p><h1>Quem responde pela venda?</h1>
      <p>Para este evento, confirme a pessoa física ou jurídica da organização que vende a inscrição. Ela será a referência do futuro documento fiscal. A emissão ainda depende de integração e homologação próprias.</p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <p role="status">Carregando configuração…</p> : data && <section className={styles.card}>
      <h2>Responsável financeiro do evento</h2>
      {data.seller ? <>
        <dl><div><dt>Tipo</dt><dd>{data.seller.kind === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física'}</dd></div>
          <div><dt>Nome ou razão social</dt><dd>{data.seller.legalName}</dd></div>
          <div><dt>{data.seller.kind === 'COMPANY' ? 'CNPJ' : 'CPF'}</dt><dd>{data.seller.taxId}</dd></div></dl>
        <p>Vendedor, recebedor e responsável pela futura emissão: esta organização. Dados declarados, ainda não verificados para emissão fiscal.</p>
        <p role="status">{data.ready ? 'Configuração confirmada com a versão atual dos dados da organização.' : 'Confirme estes dados para concluir a configuração financeira do evento.'}</p>
        <button type="button" disabled={saving || !['DRAFT', 'SETUP', 'HOMOLOGATION'].includes(data.event.status)} onClick={() => void save()}>
          {saving ? 'Salvando…' : data.ready ? 'Confirmar novamente' : 'Confirmar responsável financeiro'}
        </button>
      </> : <p>Cadastre primeiro os dados PF/PJ da organização. Eventos pagos não avançam para publicação sem essa configuração.</p>}
      <Link href={`/organizacoes/${data.event.organizationId}/dados-fiscais`}>{data.seller ? 'Revisar dados PF/PJ da organização' : 'Cadastrar dados PF/PJ da organização'}</Link>
      <h2>Meio de pagamento</h2>
      <p>A inscrição paga usa o Asaas, já operado pela Evolvia. O organizador não cola chave, token nem credencial de cartão nesta tela.</p>
      <p>PagSeguro, Mercado Pago e a escolha de split pelo organizador ainda não estão habilitados. O split da plataforma será definido pela Evolvia, não por uma credencial colada no evento.</p>
      <p className={styles.note}>O comprador/tomador é informado no checkout. Nenhuma nota fiscal é emitida por esta tela.</p>
    </section>}
  </main>;
}
