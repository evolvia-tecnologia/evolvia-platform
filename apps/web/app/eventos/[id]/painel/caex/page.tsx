import ExhibitorCaex from '../../../../../components/exhibitor-caex';

export default async function CaexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <>
    <a className="skip-link" href="#caex-main">Pular para o atendimento do expositor</a>
    <main id="caex-main" tabIndex={-1}><ExhibitorCaex eventId={id} /></main>
  </>;
}

