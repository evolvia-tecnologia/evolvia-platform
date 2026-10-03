import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../components/public-site-header';
import styles from './acessibilidade.module.css';

export const metadata: Metadata = {
  title: 'Acessibilidade',
  description: 'Compromissos, limitações conhecidas e canal de feedback de acessibilidade da Evolvia, sem declaração de conformidade homologada.',
  robots: { index: false, follow: false },
};

export default function AccessibilityStatementPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>DECLARAÇÃO PÚBLICA DE ACESSIBILIDADE</p>
        <h1>Acessibilidade na Evolvia</h1>
        <p className={styles.lead}>
          Esta página descreve compromissos atuais, limitações conhecidas e o canal
          público já existente para feedback. Ela não declara conformidade WCAG 2.2 AA,
          não apresenta selo e não substitui homologação ainda em curso.
        </p>

        <div className={styles.notice} role="status">
          <strong>Declaração técnica verificável — conformidade não homologada.</strong>
          <span>
            O Gate 1 permanece em validação. Não há certificação, SLA de atendimento
            nem garantia de acessibilidade total neste texto.
          </span>
        </div>

        <section aria-labelledby="compromissos-title">
          <h2 id="compromissos-title">Compromissos atuais</h2>
          <ul className={styles.list}>
            <li>Navegação por teclado e indicador de foco visível nos controles públicos.</li>
            <li>Link para pular ao conteúdo principal e uma única área principal por página.</li>
            <li>Reflow a partir de 320 px, zoom do navegador e espaçamento de texto sem cortar o conteúdo.</li>
            <li>Leitura em modo de contraste forçado e linguagem em português do Brasil.</li>
            <li>Uso de tecnologias assistivas com título único e estrutura semântica previsível.</li>
          </ul>
        </section>

        <section aria-labelledby="limitacoes-title">
          <h2 id="limitacoes-title">Limitações conhecidas</h2>
          <ul className={styles.list}>
            <li>Não há declaração de conformidade WCAG 2.2 AA, selo ou certificação nesta página.</li>
            <li>Informações de acessibilidade de cada evento dependem do que a organização publica.</li>
            <li>Termos de Uso e Privacidade continuam minutas técnicas, ainda não vigentes.</li>
            <li>Esta página não define prazo de resposta nem coleta dados pessoais.</li>
          </ul>
        </section>

        <section className={styles.feedback} aria-labelledby="feedback-title">
          <h2 id="feedback-title">Canal de feedback</h2>
          <p>
            O contato corporativo público já canônico da Evolvia são as páginas institucionais de
            {' '}<Link href="/termos-de-uso">Termos de Uso</Link>
            {' '}e{' '}
            <Link href="/privacidade">Privacidade</Link>.
            Esta página não abre formulário, não publica e-mail, telefone ou dado pessoal e não
            inventa um canal paralelo.
          </p>
        </section>
      </article>
    </main>
  </>;
}
