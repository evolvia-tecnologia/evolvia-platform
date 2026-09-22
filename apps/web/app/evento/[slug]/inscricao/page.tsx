import type { Metadata } from 'next';
import PublicRegistrationForm from '../../../../components/public-registration-form';

export const metadata: Metadata = {
  title: 'Inscrição no evento',
  robots: { index: false, follow: false },
};

export default async function PublicRegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <>
    <a className="skip-link" href="#registration-main">Pular para o formulário de inscrição</a>
    <div id="registration-main">
      <PublicRegistrationForm slug={slug} />
    </div>
  </>;
}
