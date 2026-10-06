'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, api, getToken } from '../../../../../lib/api';
import { maskTaxId } from '../../../../../lib/event-flow';
import EventWorkspace from '../../../../../components/event-workspace';
import ScientificEvaHelp from '../../../../../components/scientific-eva-help';
import styles from './page.module.css';

type FeeBearer = 'ORGANIZER' | 'PARTICIPANT';
type Configuration = { revision: number; sellerOrganizationId: string; sellerLegalProfileRevision: number; feeBearer: FeeBearer } | null;
type Response = {
  event: { id: string; organizationId: string; status: string; registrationMode: string };
  seller: { kind: 'PERSON' | 'COMPANY'; legalName: string; tradeName: string | null; taxId: string; revision: number } | null;
  configuration: Configuration;
  commission: {
    percent: number | null;
    minPercent: number;
    maxPercent: number;
    bearer: FeeBearer;
    walletLinked: boolean;
    certificateCents: 0;
    submissionCents: 0;
  };
  ready: boolean;
  documentIssuanceAvailable: false;
};

const financialEva = [
  {
    question: 'Quando a Evolvia cobra comissão?',
    answer: 'Somente na inscrição paga. A comissão fica entre 10% e 15%, no percentual negociado com o Asaas. Evento gratuito, certificado e trabalho científico não têm taxa da plataforma.',
  },
  {
    question: 'Como o valor é dividido?',
    answer: 'O Asaas separa na cobrança: a comissão fica com a Evolvia e o restante vai para a carteira do organizador. A EVA não mostra saldo, documento, chave ou dado de cartão.',
  },
  {
    question: 'Quais meios o participante vê?',
    answer: 'No Brasil, Pix e cartão, com parcelamento em até 6 vezes. Em outro país, cartão internacional. O checkout do Asaas não oferece boleto nem meios locais de outros países. O recebimento é em reais.',
  },
];

export default function EventFinancialPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const [data, setData] = useState<Response | null>(null);
  const [trackedEventId, setTrackedEventId] = useState(id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bearer, setBearer] = useState<FeeBearer>('ORGANIZER');
  if (trackedEventId !== id) {
    setTrackedEventId(id);
    setData(null);
    setLoading(Boolean(id));
    setSaving(false);
    setError('');
    setBearer('ORGANIZER');
  }

  useEffect(() => {
    if (!id) {
      setData(null);
      setLoading(false);
      setError('Não foi possível carregar o responsável financeiro.');
      return;
    }
    if (!getToken()) { router.replace('/login'); return; }
    let active = true;
    setLoading(true);
    setData(null);
    setError('');
    api<Response>(`/events/${encodeURIComponent(id)}/financial-responsibility`)
      .then((result) => {
        if (!active || result.event.id !== id) return;
        setData(result);
        setBearer(result.commission.bearer);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o responsável financeiro.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
          feeBearer: bearer,
        }),
      });
      setData(result);
      setBearer(result.commission.bearer);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 409
        ? 'A configuração ou os dados da organização mudaram. Recarregue antes de confirmar novamente.'
        : reason instanceof Error ? reason.message : 'Não foi possível salvar.');
    } finally { setSaving(false); }
  }

  return <EventWorkspace eventId={id} section="financial" contentTag="div"><main className={styles.page} id="main-content">
    <header><p className={styles.eyebrow}>INSCRIÇÕES · FINANCEIRO</p><h1>Responsável financeiro</h1>
      <p>Para este evento, confirme a pessoa física ou jurídica da organização que vende a inscrição. Ela será a referência do futuro documento fiscal. A emissão ainda depende de integração e homologação próprias.</p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <p role="status">Carregando configuração…</p> : data?.event.id === id && <section className={styles.card}>
      <h2>Responsável financeiro do evento</h2>
      {data.seller ? <>
        <dl><div><dt>Tipo</dt><dd>{data.seller.kind === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física'}</dd></div>
          <div><dt>Nome ou razão social</dt><dd>{data.seller.legalName}</dd></div>
          <div><dt>{data.seller.kind === 'COMPANY' ? 'CNPJ' : 'CPF'}</dt><dd>{maskTaxId(data.seller.taxId)}</dd></div></dl>
        <p>Vendedor, recebedor e responsável pela futura emissão: esta organização. Dados declarados, ainda não verificados para emissão fiscal.</p>
        <p role="status">{data.ready ? 'Configuração confirmada com a versão atual dos dados da organização.' : 'Confirme estes dados para concluir a configuração financeira do evento.'}</p>
        <button type="button" disabled={saving || !['DRAFT', 'SETUP', 'HOMOLOGATION'].includes(data.event.status)} onClick={() => void save()}>
          {saving ? 'Salvando…' : data.ready ? 'Confirmar novamente' : 'Confirmar responsável financeiro'}
        </button>
      </> : <p>Cadastre primeiro os dados PF/PJ da organização. Eventos pagos não avançam para publicação sem essa configuração.</p>}
      <Link href={`/organizacoes/${data.event.organizationId}/dados-fiscais`}>{data.seller ? 'Revisar dados PF/PJ da organização' : 'Cadastrar dados PF/PJ da organização'}</Link>
      <h2>Comissão da inscrição paga</h2>
      <p>A Evolvia fica com {data.commission.percent ?? '—'}% de cada inscrição paga, dentro da faixa de {data.commission.minPercent}% a {data.commission.maxPercent}% negociada com o Asaas. Evento gratuito, certificado e trabalho científico não têm taxa.</p>
      <fieldset disabled={saving || !['DRAFT', 'SETUP', 'HOMOLOGATION'].includes(data.event.status)}>
        <legend>Quem paga a comissão</legend>
        <label><input type="radio" name="feeBearer" checked={bearer === 'ORGANIZER'} onChange={() => setBearer('ORGANIZER')} /> A organização absorve a comissão. O participante paga o valor do lote.</label>
        <label><input type="radio" name="feeBearer" checked={bearer === 'PARTICIPANT'} onChange={() => setBearer('PARTICIPANT')} /> O participante paga a comissão junto com a inscrição.</label>
      </fieldset>
      <h2>Meio de pagamento</h2>
      <p>A inscrição paga usa o Asaas, já operado pela Evolvia. O organizador não cola chave, token nem credencial de cartão nesta tela.</p>
      <p>PagSeguro e Mercado Pago não estão habilitados. A comissão não é um percentual escolhido pelo organizador: o Asaas divide a cobrança e a parte da Evolvia fica na carteira da plataforma.</p>
      <p>{data.commission.walletLinked ? 'A carteira Asaas do organizador está ligada. O restante da inscrição vai para essa carteira no momento do pagamento.' : 'Informe a carteira Asaas nos dados da organização. Sem ela, a inscrição paga não abre, para a Evolvia não receber o valor inteiro.'}</p>
      <p>Participante no Brasil: Pix e cartão, com parcelamento em até 6 vezes. Participante de outro país: cartão internacional. O checkout do Asaas não oferece boleto nem meios locais de outros países. O recebimento é em reais.</p>
      <p className={styles.note}>O comprador/tomador é informado no checkout. Nenhuma nota fiscal é emitida por esta tela. Certificado e trabalho científico continuam sem taxa.</p>
    </section>}
  </main>
  <ScientificEvaHelp
    context="Financeiro da inscrição"
    intro="A EVA explica a comissão e os meios de pagamento sem ler cartão, documento ou saldo."
    questions={financialEva}
  />
  </EventWorkspace>;
}
