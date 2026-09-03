import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import { EVENT_PROFILE_GROUPS } from '../../../lib/event-profile-catalog';
import ExhibitorsPlanner from './exhibitors-planner';
import styles from './planejar-expositores.module.css';

export const metadata: Metadata = {
  title: 'Planejar expositores — orientação local',
  description: 'Antecipe decisões sobre expositores e estandes antes de configurar uma feira. O resultado é local: esta ferramenta não vende estande, não cadastra expositor, não reserva espaço e não coleta lead.',
  robots: { index: false, follow: false },
};

const fairGroup = EVENT_PROFILE_GROUPS.find((group) => group.id === 'fair');

export default function PublicExhibitorsPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar expositores</h1>
        <p className={styles.lead}>
          Antecipe o modelo preliminar de presença, a origem conceitual, a
          necessidade futura de perfil público, as necessidades conceituais de
          infraestrutura, credenciais de equipe e coleta de leads, e uma faixa
          genérica de simultaneidade antes de configurar uma feira. O resultado
          aparece só nesta página, em português do Brasil, e some ao recarregar.
          Esta ferramenta é orientativa: não vende estande, não cadastra
          expositor, não reserva espaço e não coleta lead.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem operação real. A EVA não decide; a autorização continua humana.
            Esta página não pede empresa, marca, logo, contato, metragem, valor
            ou mapa. Não afirma reserva, contratação, disponibilidade,
            conformidade ou autorização.
          </span>
        </div>

        {fairGroup ? (
          <section className={styles.policy} aria-labelledby="fair-orientation-title">
            <h2 id="fair-orientation-title">Orientação de feira a partir do catálogo</h2>
            <p>
              A família {fairGroup.label} vem do catálogo dos 19 tipos, em
              leitura. Os tipos abaixo são os do próprio catálogo. Esta página
              não altera o catálogo e não cria uma regra paralela de
              obrigatoriedade, venda, reserva ou cadastro.
            </p>
            <p>{fairGroup.description}</p>
            <ul className={styles.policyList}>
              {fairGroup.options.map((option) => (
                <li key={option.value}>
                  <span className={styles.policyType}>{option.title}</span>
                  <span>{option.value}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ExhibitorsPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não vende estande, não cadastra expositor, não reserva
            espaço e não coleta lead. Não configura empresa, marca, logo,
            contato, metragem, valor, mapa, contrato, credencial, scanner,
            produto ou inventário. Não pede empresa, marca, logo, contato,
            nome, arquivo, texto livre ou dado pessoal.
            Independente da combinação, o resultado só descreve o que está
            definido para planejar, o que ficou para decidir depois e o que
            exige pare e confirme. Nenhuma combinação vende, reserva ou coleta.
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
