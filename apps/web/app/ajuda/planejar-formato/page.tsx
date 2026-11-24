import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import FormatPlanner from './format-planner';
import styles from './planejar-formato.module.css';

export const metadata: Metadata = {
  title: 'Planejar formato e capacidade — orientação local',
  description: 'Compare perfil, formato e faixa de público antes de entrar no Wizard. O resultado é uma lista local de preparações essenciais, sem salvar nem publicar.',
  robots: { index: false, follow: false },
};

export default function PublicFormatPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar formato e capacidade</h1>
        <p className={styles.lead}>
          Compare um perfil amplo, o formato de participação e uma faixa genérica
          de público antes de entrar no Wizard. O resultado aparece só nesta página,
          em português do Brasil, e some ao recarregar. Esta ferramenta é orientativa:
          não configura, não homologa e não publica evento.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem publicação real. A EVA não decide; a autorização continua humana.
          </span>
        </div>

        <FormatPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não escolhe tipo canônico, não estima custo, prazo, equipe,
            capacidade física, disponibilidade contínua nem obrigação jurídica.
            Independente da combinação, o resultado só descreve pontos a confirmar
            antes de avançar: nunca configura, homologa ou publica um evento.
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
