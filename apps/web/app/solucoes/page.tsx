import type { Metadata } from 'next';
import { PublicSiteShell } from '../../components/public-site-shell';
import styles from '../../components/public-site-shell.module.css';

export const metadata: Metadata = {
  title: 'Soluções para eventos',
  description: 'Conheça como a Evolvia conecta planejamento, divulgação, inscrições, ciência, operação e pós-evento.',
};

const solutionGroups = [
  ['Planejamento e configuração', 'Estruture modalidades, jornadas, regras e capacidades do evento com orientação progressiva.'],
  ['Divulgação e presença pública', 'Transforme dados canônicos do evento em páginas públicas seguras, acessíveis e preparadas para descoberta.'],
  ['Inscrições e relacionamento', 'Centralize entrada de participantes, comunicação e área reservada sem duplicar identidade.'],
  ['Eventos científicos', 'Conecte configuração, submissões, avaliação, decisão e programação respeitando papéis e auditoria.'],
  ['Operação presencial, virtual e híbrida', 'Planeje acesso, credenciamento, programação, salas e experiência com uma mesma base de participantes.'],
  ['Dados, financeiro e pós-evento', 'Evolua para conciliação, resultados, relatórios, certificados e aprendizado a partir de dados reais.'],
] as const;

export default function SolutionsPage() {
  return <PublicSiteShell>
    <div className={styles.page}>
      <p className={styles.eyebrow}>SOLUÇÕES</p>
      <h1 className={styles.title}>Tecnologia que acompanha o evento inteiro, sem transformar cada etapa em um sistema diferente.</h1>
      <p className={styles.lead}>A Evolvia organiza a complexidade em jornadas conectadas. Cada capacidade entra no produto quando seus Gates técnicos, de segurança, UX e acessibilidade estiverem concluídos.</p>
      <section className={styles.section} aria-labelledby="solucoes-grupos">
        <div className={styles.sectionHead}><div><h2 id="solucoes-grupos">Do planejamento ao aprendizado pós-evento</h2><p>As áreas abaixo representam capacidades do produto e sua direção de evolução; não substituem o estado real de entrega de cada módulo.</p></div></div>
        <div className={styles.grid}>
          {solutionGroups.map(([title, description]) => <article className={styles.card} key={title}><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>
    </div>
  </PublicSiteShell>;
}
