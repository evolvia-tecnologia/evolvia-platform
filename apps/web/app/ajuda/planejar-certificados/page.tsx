import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import CertificatesPlanner from './certificates-planner';
import styles from './planejar-certificados.module.css';

export const metadata: Metadata = {
  title: 'Planejar certificados — orientação local',
  description: 'Prepare decisões preliminares sobre certificados antes de configurar o evento. O resultado é local, sem emitir documento, comprovar participação, validar presença ou alterar o evento.',
  robots: { index: false, follow: false },
};

export default function PublicCertificatesPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar certificados</h1>
        <p className={styles.lead}>
          Compare uma finalidade preliminar, um critério conceitual de
          elegibilidade, a necessidade de modelos distintos por perfil, o
          formato conceitual e a necessidade futura de validação pública ou
          segunda via antes de configurar o evento. O resultado aparece só
          nesta página, em português do Brasil, e some ao recarregar. Esta
          ferramenta é orientativa: não emite certificado, não comprova
          participação, não valida presença e não altera o evento.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem documento gerado. A EVA não decide; a
            autorização continua humana. Esta página não afirma validade
            jurídica, autenticidade, elegibilidade real nem disponibilidade
            operacional.
          </span>
        </div>

        <CertificatesPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não emite certificado, não comprova participação, não
            valida presença e não altera o evento. Não gera PDF, assinatura,
            QR, hash, protocolo, segunda via, envio, download ou impressão.
            Não pede nome, e-mail, documento, inscrição, presença, atividade,
            trabalho, texto livre ou dado pessoal. Não cria template, campo
            dinâmico, regra de presença, aprovação científica, categoria ou
            modelo. Independente da combinação, o resultado só descreve o que
            está definido para planejar, o que ficou para decidir depois e o
            que exige pare e confirme. Nenhuma combinação emite documento ou
            comprova participação.
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
