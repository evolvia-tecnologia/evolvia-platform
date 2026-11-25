import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import ParticipationPlanner from './participation-planner';
import styles from './planejar-participacao.module.css';

export const metadata: Metadata = {
  title: 'Planejar participação — orientação local',
  description: 'Compare modelos iniciais de acesso, composição, categorias e comprovante antes de configurar o evento. O resultado é local, sem criar inscrição, convite, aprovação ou publicação.',
  robots: { index: false, follow: false },
};

export default function PublicParticipationPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar participação</h1>
        <p className={styles.lead}>
          Compare um modelo genérico de acesso, a composição da participação,
          a existência de categorias distintas e a eventual necessidade de
          comprovante antes de configurar o evento. O resultado aparece só
          nesta página, em português do Brasil, e some ao recarregar. Esta
          ferramenta é orientativa: não cria inscrição, convite, aprovação,
          categoria, acompanhante ou publicação.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem publicação real. A EVA não decide; a autorização continua humana.
          </span>
        </div>

        <ParticipationPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não cria ficha, convite, aprovação, QR, acompanhante, lote,
            cupom, pagamento nem publicação. Não define permissão, autenticação,
            unicidade, elegibilidade, capacidade, preço ou obrigação documental.
            Não pede nome de categoria, contato, documento, comprovante, texto
            livre ou dado pessoal. Independente da combinação, o resultado só
            descreve o que está definido para planejar, o que ficou para
            decidir depois e o que exige pare e confirme.
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
