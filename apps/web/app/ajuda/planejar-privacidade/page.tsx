import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import PrivacyPlanner from './privacy-planner';
import styles from './planejar-privacidade.module.css';

export const metadata: Metadata = {
  title: 'Planejar privacidade — orientação local',
  description: 'Planejador público e local para a pessoa organizadora preparar decisões mínimas de privacidade antes de configurar a ficha do evento, sem coletar dados nem emitir parecer jurídico.',
  robots: { index: false, follow: false },
};

export default function PublicPrivacyPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar privacidade</h1>
        <p className={styles.lead}>
          Prepare decisões mínimas de privacidade antes de configurar a ficha
          do evento. Classifique uma finalidade inicial, a categoria mínima de
          dados prevista, uma diretriz preliminar de retenção e se haverá
          compartilhamento operacional com fornecedor. O resultado aparece só
          nesta página, em português do Brasil, e some ao recarregar. Esta
          ferramenta é orientativa: não coleta, não salva, não transmite, não
          autoriza tratamento, não altera política e não configura o evento.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem publicação real. A EVA não decide; a autorização continua humana.
            Esta página não substitui a minuta de Privacidade e não afirma conformidade.
          </span>
        </div>

        <PrivacyPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não coleta nome, e-mail, telefone, documento, empresa ou
            necessidade de acessibilidade. Não escolhe base legal, não fixa
            prazo jurídico, não registra aceite e não altera Termos ou
            Privacidade. Não cria ficha, inscrição, credencial, certificado,
            fornecedor, integração, contrato, evento ou publicação. Independente
            da combinação, o resultado só descreve o que está definido para
            planejar, o que ficou para decidir depois e o que exige pare e
            confirme. Nenhuma combinação afirma conformidade automática.
          </p>
          <ul className={styles.nextLinks}>
            <li><Link href="/eventos">Explorar eventos</Link></li>
            <li><Link href="/">Voltar ao início</Link></li>
            <li><Link href="/privacidade">Ler a minuta de Privacidade</Link></li>
            <li><Link href="/termos-de-uso">Ler a minuta de Termos de Uso</Link></li>
          </ul>
        </section>
      </article>
    </main>
  </>;
}
