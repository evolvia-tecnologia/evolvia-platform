import type { Metadata } from 'next';
import { PublicSiteShell } from '../../components/public-site-shell';
import styles from '../../components/public-site-shell.module.css';

export const metadata: Metadata = {
  title: 'Sobre a Evolvia',
  description: 'Conheça a proposta da Evolvia, quem ela atende e os princípios que orientam sua tecnologia para eventos.',
};

export default function AboutPage() {
  return <PublicSiteShell>
    <div className={styles.page}>
      <p className={styles.eyebrow}>SOBRE A EVOLVIA</p>
      <h1 className={styles.title}>Uma plataforma para reduzir a complexidade de criar e viver eventos.</h1>
      <p className={styles.lead}>A Evolvia está sendo construída como uma plataforma integrada para diferentes perfis de evento, conectando configuração, divulgação, participação, ciência, operação e pós-evento sem perder segurança, acessibilidade e controle.</p>

      <section className={styles.section} aria-labelledby="o-que-e">
        <div className={styles.sectionHead}><div><h2 id="o-que-e">O que é a Evolvia</h2><p>Um produto self-service assistido pela EVA, pensado para tornar decisões complexas mais compreensíveis e manter dados e jornadas conectados ao longo do evento.</p></div></div>
        <div className={styles.grid}>
          <article className={styles.card}><h3>Integração</h3><p>Uma mesma base de evento sustenta divulgação, inscrições, programação, operação, relatórios e demais capacidades que forem habilitadas.</p></article>
          <article className={styles.card}><h3>Clareza</h3><p>A complexidade pode existir internamente; a interface deve continuar progressiva, previsível e adequada ao papel de cada pessoa.</p></article>
          <article className={styles.card}><h3>Confiança</h3><p>Segurança, LGPD, auditoria, isolamento entre organizações, acessibilidade e qualidade técnica fazem parte da Definition of Done.</p></article>
        </div>
      </section>

      <section className={styles.section} id="quem-somos" aria-labelledby="quem-somos-titulo">
        <div className={styles.card}>
          <h2 id="quem-somos-titulo">Quem somos</h2>
          <p>A presença institucional pública será construída apenas com informações oficiais e verificadas da Evolvia. Equipe, história, números, cases e parceiros não serão inventados para preencher a página.</p>
        </div>
      </section>

      <section className={styles.section} id="onde-estamos" aria-labelledby="onde-estamos-titulo">
        <div className={styles.card}>
          <h2 id="onde-estamos-titulo">Onde estamos</h2>
          <p>Endereço, canais institucionais e dados cadastrais serão publicados aqui somente a partir de informações oficiais validadas. A estrutura já está preparada para isso sem criar conteúdo local fictício para SEO.</p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="principios">
        <div className={styles.sectionHead}><div><h2 id="principios">Princípios de produto</h2><p>O portal institucional deve demonstrar a mesma qualidade exigida dentro da plataforma.</p></div></div>
        <div className={styles.grid}>
          <article className={styles.card}><h3>Acessível por padrão</h3><p>WCAG 2.2 AA, navegação por teclado, foco visível, contraste, reflow e redução de movimento fazem parte da base técnica.</p></article>
          <article className={styles.card}><h3>Dados reais</h3><p>Sem métricas, eventos, depoimentos, insights ou benefícios apresentados como fatos quando ainda não houver fonte real.</p></article>
          <article className={styles.card}><h3>Software sustentável</h3><p>Código enxuto, dependências justificadas, performance, observabilidade e manutenção simples orientam as decisões de engenharia.</p></article>
        </div>
      </section>
    </div>
  </PublicSiteShell>;
}
