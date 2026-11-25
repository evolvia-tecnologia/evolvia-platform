import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import MaterialsPlanner from './materials-planner';
import styles from './planejar-materiais.module.css';

export const metadata: Metadata = {
  title: 'Planejar materiais e kits — orientação local',
  description: 'Prepare decisões preliminares sobre materiais e kits antes de configurar capacidades operacionais. O resultado é local, sem cadastrar item, movimentar estoque ou registrar entrega.',
  robots: { index: false, follow: false },
};

export default function PublicMaterialsPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar materiais e kits</h1>
        <p className={styles.lead}>
          Compare a necessidade preliminar, o momento conceitual de entrega, a
          diferenciação por categoria, uma faixa genérica de volume e a
          necessidade de comprovante ou registro antes de configurar capacidades
          operacionais. O resultado aparece só nesta página, em português do
          Brasil, e some ao recarregar. Esta ferramenta é orientativa: não cria
          item, estoque, lote, categoria, comprovante ou registro de entrega.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência e sem decisão automática.</strong>
          <span>
            As escolhas ficam apenas na memória deste navegador enquanto a página
            permanece aberta. Não há conta, envio, cookie, armazenamento local,
            rastreamento de uso nem operação real. A EVA não decide; a autorização continua humana.
            Esta página não afirma disponibilidade operacional, rastreabilidade
            real nem conformidade.
          </span>
        </div>

        <MaterialsPlanner />

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não cria item, estoque, lote, categoria, comprovante ou
            registro de entrega. Não cadastra itens, não movimenta estoque e não
            registra entregas. Não pede nome, e-mail, documento, categoria, item,
            quantidade, data, local, texto livre ou dado pessoal. Não configura
            fornecedor, equipe, capacidade física, logística, impressão, QR,
            RFID ou dispositivo. Independente da combinação, o resultado só
            descreve o que está definido para planejar, o que ficou para
            decidir depois e o que exige pare e confirme. Nenhuma combinação
            movimenta ou autoriza estoque ou entrega.
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
