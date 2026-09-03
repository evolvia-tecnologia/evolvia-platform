import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import { EVENT_PROFILE_GROUPS } from '../../../lib/event-profile-catalog';
import AccessControlPlanner from './access-control-planner';
import styles from './planejar-controle-acesso.module.css';

export const metadata: Metadata = {
  title: 'Planejar controle de acesso — orientação local',
  description: 'Prepare decisões mínimas de controle de acesso antes de configurar o evento. O resultado é local, sem validar QR, conceder permissão, abrir catraca ou registrar presença.',
  robots: { index: false, follow: false },
};

const entertainmentGroup = EVENT_PROFILE_GROUPS.find((group) => group.id === 'entertainment');

export default function PublicAccessControlPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar controle de acesso</h1>
        <p className={styles.lead}>
          Antecipe o cenário preliminar de entrada, a forma conceitual de
          validação, a existência de áreas ou atividades com acesso distinto,
          uma faixa genérica de fluxo e a contingência manual ou offline antes
          de configurar o evento. O resultado aparece só nesta página, em
          português do Brasil, e some ao recarregar. Esta ferramenta é
          orientativa: não valida QR, não concede permissão, não abre catraca e
          não registra presença.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem operação real. A EVA não decide; a autorização continua humana.
            Esta página não afirma disponibilidade operacional, compatibilidade
            de hardware, segurança de acesso nem certificação.
          </span>
        </div>

        {entertainmentGroup ? (
          <section className={styles.policy} aria-labelledby="entertainment-policy-title">
            <h2 id="entertainment-policy-title">Controle de acesso em entretenimento</h2>
            <p>
              A política canônica do Wizard trata a capability{' '}
              <code>access_control</code> (Controle de acesso) como estrutural
              para a família {entertainmentGroup.label}. Os tipos abaixo vêm do
              catálogo dos 19 tipos, em leitura. Esta página não altera o
              catálogo e não cria uma regra paralela de obrigatoriedade.
            </p>
            <ul className={styles.policyList}>
              {entertainmentGroup.options.map((option) => (
                <li key={option.value}>
                  <span className={styles.policyType}>{option.title}</span>
                  <span>{option.value}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <AccessControlPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não valida QR, não concede permissão, não abre catraca e
            não registra presença. Não configura ponto, leitor, câmera, rede,
            capacidade real, política de reentrada, ACL ou autorização de área.
            Não pede nome, e-mail, documento, ingresso, QR, área, pessoa, texto
            livre ou dado pessoal.             Independente da combinação, o resultado só
            descreve o que está definido para planejar, o que ficou para
            decidir depois e o que exige pare e confirme. Nenhuma combinação autoriza operação real.
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
