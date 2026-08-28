import type { Metadata } from 'next';
import LegalDocumentPage from '../../components/legal-document-page';
import { LEGAL_DOCUMENTS } from '../../lib/legal-documents';

export const metadata: Metadata = {
  title: 'Termos de Uso — minuta em homologação | Evolvia',
  description: 'Estrutura dos Termos de Uso da Evolvia em validação responsável.',
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return <LegalDocumentPage document={LEGAL_DOCUMENTS.terms} />;
}
