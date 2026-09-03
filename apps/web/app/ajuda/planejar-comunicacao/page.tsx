import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import CommunicationPlanner from './communication-planner';
import styles from './planejar-comunicacao.module.css';

export const metadata: Metadata = {
  title: 'Planejar comunicação — orientação local',
  description: 'Planejador público e local para a pessoa organizadora definir momentos, canais e cuidados mínimos da comunicação antes de abrir o Wizard, sem enviar mensagens nem coletar contatos.',
  robots: { index: false, follow: false },
};

export default function PublicCommunicationPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar a comunicação do evento</h1>
        <p className={styles.lead}>
          Defina momentos, canais e cuidados mínimos antes de abrir o Wizard.
          O plano aparece só nesta página, em português do Brasil, e some ao
          recarregar. Esta ferramenta é orientativa: não envia, não agenda, não
          configura canal e não coleta destinatário.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência, sem envio e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, cookie, armazenamento local, telemetria
            nem chamada de rede. A EVA pode orientar este plano, mas não aprova
            nem dispara comunicação nesta ferramenta.
          </span>
        </div>

        <CommunicationPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não dispara e-mail, mensagem instantânea ou aviso na área
            do participante. Não promete disponibilidade de canal, prazo, SLA,
            entrega, template real nem conformidade jurídica. Continue pelas
            rotas públicas já existentes; a autorização de qualquer envio
            futuro continua humana.
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
