import type { Metadata } from 'next';
import LegalDocumentPage from '../../components/legal-document-page';
import { LEGAL_DOCUMENTS } from '../../lib/legal-documents';

export const metadata: Metadata = {
  title: 'Política de Privacidade — minuta em homologação | Evolvia',
  description: 'Estrutura da Política de Privacidade da Evolvia em validação responsável.',
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={LEGAL_DOCUMENTS.privacy} />;
}
