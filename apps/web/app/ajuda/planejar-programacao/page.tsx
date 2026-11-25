import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import SchedulePlanner from './schedule-planner';
import styles from './planejar-programacao.module.css';

export const metadata: Metadata = {
  title: 'Planejar programação — orientação local',
  description: 'Estruture a programação inicial do evento antes de entrar no Wizard. O resultado é local, sem criar agenda, atividade, sala, palestrante, inscrição, reserva ou publicação.',
  robots: { index: false, follow: false },
};

export default function PublicSchedulePlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar programação</h1>
        <p className={styles.lead}>
          Compare uma estrutura preliminar, a duração sem datas reais, a
          necessidade genérica de salas, a dependência de pessoas convidadas
          e se as atividades poderão exigir inscrição ou capacidade específica
          antes de entrar no Wizard. O resultado aparece só nesta página, em
          português do Brasil, e some ao recarregar. Esta ferramenta é orientativa: não cria agenda, atividade, sala, palestrante, inscrição, reserva ou publicação.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso, calendário integrado nem publicação real.
            A EVA não decide; a autorização continua humana. Esta leitura não
            afirma disponibilidade operacional, ausência automática de conflitos
            nem conformidade ou certificação.
          </span>
        </div>

        <SchedulePlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não cria agenda, atividade, sala, palestrante, inscrição,
            reserva, trilha, convite, vaga, presença, certificado nem publicação.
            Não pede nome, contato, data, horário, local, título de atividade,
            texto livre ou dado pessoal. Não configura capacidade, preço,
            inscrição de atividade, regra de acesso, transmissão ou gravação.
            Independente da combinação, o resultado só descreve o que está
            definido para planejar, o que ficou para decidir depois e o que
            exige pare e confirme. Nenhuma combinação autoriza programação real.
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
