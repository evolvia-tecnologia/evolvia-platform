import type { Metadata } from 'next';
import { PublicSiteShell } from '../../components/public-site-shell';
import styles from '../../components/public-site-shell.module.css';

export const metadata: Metadata = {
  title: 'Conteúdos sobre eventos e tecnologia',
  description: 'Guias, tendências e boas práticas para organizar e participar de eventos com mais clareza, tecnologia e acessibilidade.',
};

const pillars = [
  ['Organização de eventos', 'Planejamento, equipes, cronogramas, riscos, fornecedores e decisões operacionais.'],
  ['Eventos científicos e acadêmicos', 'Submissões, avaliação, programação, autores, pareceristas e comunicação científica.'],
  ['Eventos corporativos', 'Treinamentos, convenções, encontros de relacionamento, conteúdo e experiência.'],
  ['Feiras, exposições e patrocínios', 'Expositores, espaços, ativação, leads consentidos, relacionamento e retorno.'],
  ['Tecnologia, virtual e híbrido', 'Streaming, salas, acesso, interação, integrações e desenho de experiências digitais.'],
  ['Acessibilidade e experiência', 'Conteúdo, navegação, atendimento e operação inclusivos desde a configuração do evento.'],
] as const;

export default function ContentHubPage() {
  return <PublicSiteShell>
    <div className={styles.page}>
      <p className={styles.eyebrow}>CONTEÚDOS</p>
      <h1 className={styles.title}>Conhecimento prático para quem organiza, participa e faz eventos acontecerem.</h1>
      <p className={styles.lead}>Este espaço será editorial, não um depósito de palavras-chave. Artigos só serão publicados quando houver conteúdo original, útil, revisado e com autoria e atualização identificáveis.</p>
      <section className={styles.section} aria-labelledby="pilares-editoriais">
        <div className={styles.sectionHead}><div><h2 id="pilares-editoriais">Pilares editoriais</h2><p>A estrutura foi preparada para construir autoridade temática sem doorway pages, textos automáticos rasos ou conteúdo duplicado.</p></div></div>
        <div className={styles.grid}>
          {pillars.map(([title, description]) => <article className={styles.card} key={title}><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="publicacao-editorial">
        <div className={styles.card}><h2 id="publicacao-editorial">Publicação responsável</h2><p>O próximo lote editorial adicionará modelo de matéria, autoria, datas de publicação e atualização, categorias, imagem, metadados sociais e dados estruturados somente quando o conteúdo real estiver disponível.</p></div>
      </section>
    </div>
  </PublicSiteShell>;
}
