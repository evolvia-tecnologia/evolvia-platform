import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import SpeakersPlanner from './speakers-planner';
import styles from './planejar-palestrantes.module.css';

export const metadata: Metadata = {
  title: 'Planejar palestrantes — orientação local',
  description: 'Antecipe formato, origem do conteúdo, perfil público, materiais, autorização, acessibilidade e simultaneidade antes de configurar o evento. O resultado é local, sem convidar, cadastrar, agendar, publicar ou enviar conteúdo.',
  robots: { index: false, follow: false },
};

export default function PublicSpeakersPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar palestrantes</h1>
        <p className={styles.lead}>
          Antecipe o formato preliminar de participação, a origem conceitual do
          conteúdo, a necessidade de perfil público, as decisões futuras de
          materiais, autorização de uso e acessibilidade, e uma faixa genérica
          de simultaneidade. O resultado aparece só nesta página, em português
          do Brasil, e some ao recarregar. Esta ferramenta é orientativa: não
          convida, não cadastra, não agenda, não publica e não envia conteúdo.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem publicação real. A EVA não decide; a
            autorização continua humana. Esta página não pede nome, biografia,
            foto, contato, tema, arquivo ou dado pessoal.
          </span>
        </div>

        <SpeakersPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não convida pessoa, não cadastra palestrante, não cria
            sessão, sala, agenda, submissão, perfil público, autorização jurídica,
            curadoria, avaliação nem comunicação real. Não afirma confirmação,
            disponibilidade, direito de uso ou acessibilidade certificada. Não
            pede nome, e-mail, telefone, biografia, foto, empresa, cargo, tema,
            arquivo, texto livre ou dado pessoal. Independente da combinação, o
            resultado só descreve o que está definido para planejar, o que ficou
            para decidir depois e o que exige pare e confirme.
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
