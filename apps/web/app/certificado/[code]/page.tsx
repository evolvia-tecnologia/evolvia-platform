import type { Metadata } from 'next';
import PresenceCertificateView from '../../../components/presence-certificate-view';

export const metadata: Metadata = {
  title: 'Certificado',
  description: 'Consulta de autenticidade do certificado de participação. O download não é cobrado.',
};

export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PresenceCertificateView code={code} />;
}
