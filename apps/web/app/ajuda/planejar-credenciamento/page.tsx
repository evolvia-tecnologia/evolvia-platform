import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import CredentialingPlanner from './credentialing-planner';
import styles from './planejar-credenciamento.module.css';

export const metadata: Metadata = {
  title: 'Planejar credenciamento — orientação local',
  description: 'Prepare o modelo inicial de credenciamento antes de configurar o evento. O resultado é local, sem check-in, validação de QR, impressão, credencial ou registro de presença.',
  robots: { index: false, follow: false },
};

export default function PublicCredentialingPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar credenciamento</h1>
        <p className={styles.lead}>
          Compare um modelo preliminar de chegada, a identificação prevista, a
          necessidade de impressão local, uma faixa genérica de simultaneidade
          e a contingência offline ou manual antes de configurar o evento. O
          resultado aparece só nesta página, em português do Brasil, e some ao
          recarregar. Esta ferramenta é orientativa: não faz check-in, não
          valida QR, não imprime, não cria credencial e não registra presença.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem operação real. A EVA não decide; a autorização continua humana.
            Esta página não afirma disponibilidade operacional, compatibilidade
            de hardware nem certificação de acessibilidade.
          </span>
        </div>

        <CredentialingPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não faz check-in, não valida QR, não imprime, não cria
            credencial e não registra presença. Não configura dispositivo,
            impressora, leitor, rede, capacidade real, equipe ou tempo de
            atendimento. Não pede nome, e-mail, documento, QR, categoria,
            necessidade individual, texto livre ou dado pessoal. Independente
            da combinação, o resultado só descreve o que está definido para
            planejar, o que ficou para decidir depois e o que exige pare e
            confirme. Nenhuma combinação autoriza operação real.
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
