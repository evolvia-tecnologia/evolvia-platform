import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import SupportPlanner from './support-planner';
import styles from './planejar-atendimento.module.css';

export const metadata: Metadata = {
  title: 'Planejar atendimento — orientação local',
  description: 'Prepare o atendimento ao participante antes de configurar o evento. O resultado é local, sem mensagem, chamado, prazo, contato ou atendimento real.',
  robots: { index: false, follow: false },
};

export default function PublicSupportPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar atendimento</h1>
        <p className={styles.lead}>
          Compare momentos preliminares de suporte, canais só conceituais,
          grupos de dúvidas esperadas, uma faixa genérica de demanda, a
          necessidade de escalonamento humano e a alternativa acessível antes
          de configurar o evento. O resultado aparece só nesta página, em
          português do Brasil, e some ao recarregar. Esta ferramenta é
          orientativa: não envia mensagem, não abre chamado, não promete prazo
          e não oferece atendimento real.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso, chamado, fila, prazo nem atendimento real.
            A EVA pode orientar, mas não atende, não abre chamado e não dispara
            mensagem nesta ferramenta. Esta página não afirma disponibilidade de
            canal, tempo de resposta, resolução nem certificação.
          </span>
        </div>

        <SupportPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não envia mensagem, não abre chamado, não promete prazo e
            não oferece atendimento real. Não pede nome, e-mail, telefone,
            endereço, assunto, mensagem, necessidade individual, texto livre ou
            dado pessoal. Não cria equipe, responsável real, escala, contato,
            canal, resposta automática ou histórico. Independente da combinação,
            o resultado só descreve o que está definido para planejar, o que
            ficou para decidir depois e o que exige pare e confirme. Nenhuma combinação
            abre chamado ou promete atendimento.
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
