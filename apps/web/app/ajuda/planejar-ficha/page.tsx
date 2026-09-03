import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './planejar-ficha.module.css';
import RegistrationPlanner from './registration-planner';

export const metadata: Metadata = {
  title: 'Planejar ficha mínima — orientação local',
  description: 'Planejador público e local para a pessoa organizadora definir uma ficha de inscrição mínima antes de configurar o evento, sem coletar dados nem guardar o plano.',
  robots: { index: false, follow: false },
};

export default function PublicRegistrationPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · PLANEJAMENTO LOCAL</p>
        <h1>Planeje os campos mínimos da ficha de inscrição</h1>
        <p className={styles.lead}>
          Use este planejador no navegador, em português do Brasil, para decidir o
          que pedir na ficha — antes de configurá-la. Nome completo, como deseja
          ser chamado e e-mail já entram como mínimo recomendado. Categorias
          opcionais são escolhas locais, sem texto livre. Nada aqui coleta dado
          pessoal, autentica, envia ou guarda o plano.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — minimização e finalidade, sem aconselhamento jurídico.</strong>
          <span>
            O plano vive só na memória desta página e some ao recarregar ou ao
            reiniciar. Não há conta, cookie, armazenamento local, telemetria nem
            chamada de rede. Esta ferramenta não configura a ficha real e
            não afirma conformidade. Não substitui a minuta de Privacidade. A
            decisão de pedir um dado continua humana.
          </span>
        </div>

        <RegistrationPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo é uma leitura local e determinística. Itens sensíveis ou
            potencialmente excessivos pedem justificativa de finalidade e
            não bloqueiam o uso. Continue pelas rotas públicas já existentes; nada
            nesta página abre a ficha autenticada nem substitui Termos e Privacidade.
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
