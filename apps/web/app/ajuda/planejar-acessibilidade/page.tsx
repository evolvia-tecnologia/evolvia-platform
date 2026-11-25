import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import AccessibilityPlanner from './accessibility-planner';
import styles from './planejar-acessibilidade.module.css';

export const metadata: Metadata = {
  title: 'Planejar acessibilidade — orientação local',
  description: 'Planejador público e efêmero para a pessoa organizadora antecipar necessidades genéricas de acessibilidade antes de abrir o Wizard, sem guardar dados nem alterar o evento.',
  robots: { index: false, follow: false },
};

export default function PublicAccessibilityPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar acessibilidade do evento</h1>
        <p className={styles.lead}>
          Marque necessidades genéricas para antecipar o que planejar, o que
          confirmar com o fornecedor ou o local e o que validar com a pessoa
          responsável, antes de abrir o Wizard. Nada é enviado, nada fica salvo
          e o evento não muda. Esta ferramenta não certifica acessibilidade e
          não substitui a escuta das pessoas.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem persistência, sem coleta e sem alteração do evento.</strong>
          <span>
            As marcações ficam apenas na memória deste navegador enquanto a
            página permanece aberta. Não há conta, envio, cookie, armazenamento
            local, rastreamento de uso nem mudança no evento real. Não peça
            nome, contato, documento, diagnóstico, deficiência ou condição de
            saúde nesta página.
          </span>
        </div>

        <AccessibilityPlanner />

        <section className={styles.guidance} aria-labelledby="orientacoes-title">
          <h2 id="orientacoes-title">Orientações genéricas e não conclusivas</h2>
          <p>
            Estas notas lembram pontos frequentes. Elas não fecham diagnóstico,
            não certificam WCAG e não substituem ouvir as pessoas que vão ao evento.
          </p>
          <ul>
            <li>Libras e legendas: planeje interpretação e legendas sem garantir qualidade automática.</li>
            <li>Audiodescrição e alternativas textuais: descreva o essencial das imagens, vídeos e documentos.</li>
            <li>Rotas acessíveis: confirme com o local a chegada, a circulação e a saída.</li>
            <li>Assentos e banheiros: reserve circulação e confirme banheiro acessível com o local.</li>
            <li>Contraste e tamanho: revise a leitura em tela e nos materiais, sem selo de conformidade.</li>
            <li>Pausas: preveja ritmo e intervalos na programação, sem protocolo clínico.</li>
            <li>Canal humano: defina como pedir ajuda no evento, sem cadastrar pessoa aqui.</li>
          </ul>
        </section>

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O planejador não abre formulário de solicitação, não cria canal de
            atendimento, não envia orçamento e não altera Wizard, mídia, catálogo
            ou evento publicado. A leitura local nunca afirma que o evento é
            acessível, conforme ou pronto para certificação.
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
