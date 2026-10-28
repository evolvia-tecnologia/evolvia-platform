import type { Metadata } from 'next';
import ExhibitorCompanyArea from '../../../../components/exhibitor-company-area';
import PublicSiteHeader from '../../../../components/public-site-header';

export const metadata: Metadata = {
  title: 'Área do expositor',
  robots: { index: false, follow: false },
};

export default async function ExhibitorCompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <>
    <a className="skip-link" href="#exhibitor-company-main">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="evento" />
    <div id="exhibitor-company-main" tabIndex={-1}>
      <ExhibitorCompanyArea slug={slug} />
    </div>
  </>;
}

