import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './avaliar-prontidao.module.css';
import ReadinessChecker from './readiness-checker';

export const metadata: Metadata = {
  title: 'Avaliar prontidão — orientação local',
  description: 'Checklist público e efêmero para a pessoa organizadora marcar critérios locais de prontidão antes da prévia e da homologação, sem guardar dados nem publicar.',
  robots: { index: false, follow: false },
};

export default function PublicReadinessPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Avaliar prontidão antes da prévia</h1>
        <p className={styles.lead}>
          Marque o que já conferiu neste evento. O resultado aparece só nesta página,
          em português do Brasil, e some ao recarregar. Esta ferramenta é orientativa:
          não certifica WCAG, não certifica LGPD, não homologa e não publica.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As respostas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem publicação real. A EVA não decide; a autorização continua humana.
          </span>
        </div>

        <ReadinessChecker />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O checklist não substitui a prévia, a homologação nem a confirmação humana
            de publicação. Independente do tipo de evento, o estado final só descreve
            uma leitura local: pronto para decisão humana, nunca pronto para publicar.
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
