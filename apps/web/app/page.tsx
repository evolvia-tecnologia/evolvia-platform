import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicSiteShell } from '../components/public-site-shell';
import styles from './public-home.module.css';

export const metadata: Metadata = {
  title: 'Eventos e tecnologia para organizar melhor',
  description: 'Descubra eventos e conheça a Evolvia, uma plataforma para criação, divulgação, inscrição, operação e evolução de eventos.',
};

const eventTypes = [
  ['Científicos e acadêmicos', 'congresso-cientifico'],
  ['Corporativos e treinamentos', 'corporativo'],
  ['Feiras e exposições', 'feira-exposicao'],
  ['Shows e entretenimento', 'entretenimento'],
] as const;

const contentPillars = [
  ['Organização de eventos', 'Planejamento, divulgação, inscrições e operação com decisões mais claras.'],
  ['Tecnologia para eventos', 'Experiências digitais, híbridas e presenciais com menos fragmentação.'],
  ['Acessibilidade e experiência', 'Boas práticas para tornar jornadas mais inclusivas, simples e previsíveis.'],
  ['Ciência e conhecimento', 'Submissões, avaliação, programação e participação acadêmica conectadas ao evento.'],
] as const;

export default function HomePage() {
  return <PublicSiteShell>
    <section className={styles.hero}>
      <div>
        <p className={styles.eyebrow}>EVENTOS, CONHECIMENTO E TECNOLOGIA</p>
        <h1>Encontre experiências. Crie eventos melhores.</h1>
        <p className={styles.heroLead}>A Evolvia conecta quem procura eventos a quem precisa planejá-los, divulgá-los e operá-los com uma experiência mais simples, integrada e acessível.</p>
        <div className={styles.heroActions}>
          <Link className={styles.primary} href="/eventos">Encontrar eventos</Link>
          <Link className={styles.secondary} href="/cadastro">Criar meu evento</Link>
        </div>
      </div>

      <form className={styles.searchCard} action="/eventos" method="get" role="search">
        <h2>O que você quer viver?</h2>
        <p>Pesquise por tema, nome do evento ou lugar. Filtros avançados ficam na página de descoberta.</p>
        <div className={styles.searchGrid}>
          <div className={styles.field}>
            <label htmlFor="evento-busca">Evento ou palavra-chave</label>
            <input id="evento-busca" name="q" placeholder="Ex.: congresso de medicina" autoComplete="off" />
          </div>
          <div className={styles.field}>
            <label htmlFor="evento-local">Cidade ou região</label>
            <input id="evento-local" name="local" placeholder="Ex.: Recife" autoComplete="address-level2" />
          </div>
          <button className={styles.searchButton} type="submit">Buscar eventos</button>
        </div>
        <div className={styles.quickLinks} aria-label="Buscas rápidas">
          <Link href="/eventos?formato=online">Online</Link>
          <Link href="/eventos?formato=hibrido">Híbridos</Link>
          <Link href="/eventos?preco=gratuito">Gratuitos</Link>
          <Link href="/eventos?submissoes=abertas">Submissões abertas</Link>
        </div>
      </form>
    </section>

    <section className={styles.section} aria-labelledby="tipos-evento">
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}>DESCUBRA POR PERFIL</p>
          <h2 id="tipos-evento">Eventos para diferentes momentos e públicos</h2>
          <p>A navegação temática cresce apenas com eventos reais publicados, evitando páginas vazias e conteúdo artificial.</p>
        </div>
        <Link className={styles.textLink} href="/eventos">Ver todos os eventos</Link>
      </div>
      <div className={styles.cards}>
        {eventTypes.map(([label, slug]) => <article className={styles.card} key={slug}>
          <span className={styles.cardTag}>Tipo de evento</span>
          <h3>{label}</h3>
          <p>Explore eventos publicados e elegíveis para descoberta neste perfil.</p>
          <p><Link className={styles.textLink} href={`/eventos?tipo=${slug}`}>Explorar →</Link></p>
        </article>)}
      </div>
    </section>

    <section className={styles.band} aria-labelledby="organizar-evento">
      <div className={styles.bandInner}>
        <div>
          <p className={styles.eyebrow}>PARA QUEM ORGANIZA</p>
          <h2 id="organizar-evento">Uma jornada única, do planejamento ao pós-evento.</h2>
          <p>A plataforma evolui por etapas conectadas para reduzir retrabalho, sistemas paralelos e decisões sem contexto.</p>
        </div>
        <div className={styles.steps} aria-label="Jornada de organização">
          {[
            ['Planeje', 'Estruture o evento e suas regras.'],
            ['Publique', 'Transforme configuração em comunicação pública.'],
            ['Inscreva', 'Receba participantes e dados com segurança.'],
            ['Opere', 'Conduza programação, acesso e experiência.'],
            ['Analise', 'Aprenda com resultados e histórico real.'],
          ].map(([title, description]) => <div className={styles.step} key={title}><strong>{title}</strong><span>{description}</span></div>)}
        </div>
      </div>
    </section>

    <section className={styles.section} aria-labelledby="publicos">
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}>PARA QUEM</p>
          <h2 id="publicos">Um produto, várias jornadas especializadas</h2>
          <p>A Evolvia organiza experiências diferentes sem transformar a plataforma em onze sistemas desconectados.</p>
        </div>
        <Link className={styles.textLink} href="/para-quem">Conhecer públicos atendidos</Link>
      </div>
      <div className={styles.audience}>
        <article><h3>Organizadores</h3><p>Empresas, universidades, associações, produtoras e equipes que precisam configurar e operar eventos.</p></article>
        <article><h3>Participantes e convidados</h3><p>Inscrição, acesso, programação e comunicação em jornadas claras e adaptadas ao evento.</p></article>
        <article><h3>Ecossistema do evento</h3><p>Autores, avaliadores, palestrantes, expositores e patrocinadores com permissões e experiências próprias.</p></article>
      </div>
    </section>

    <section className={styles.section} aria-labelledby="eva-home">
      <div className={styles.eva}>
        <div className={styles.evaMark} aria-hidden="true">EVA</div>
        <div><h2 id="eva-home">Assistência contextual sem tirar o controle de você</h2><p>A EVA ajuda a interpretar etapas, configurações, acessibilidade e pendências. Ela orienta quando há contexto real e não executa ações irreversíveis silenciosamente.</p></div>
      </div>
    </section>

    <section className={styles.section} aria-labelledby="conteudos-home">
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}>CONTEÚDOS E CONHECIMENTO</p>
          <h2 id="conteudos-home">Informação útil para quem vive eventos</h2>
          <p>O hub editorial será construído com materiais originais, úteis e conectados às necessidades reais de organizadores e participantes.</p>
        </div>
        <Link className={styles.textLink} href="/conteudos">Acessar conteúdos</Link>
      </div>
      <div className={styles.cards}>
        {contentPillars.map(([title, description]) => <article className={styles.card} key={title}><span className={styles.cardTag}>Pilar editorial</span><h3>{title}</h3><p>{description}</p></article>)}
      </div>
    </section>

    <section className={styles.cta} aria-labelledby="cta-final">
      <div><h2 id="cta-final">Seu próximo evento pode começar aqui.</h2><p>Crie sua conta e deixe a Evolvia organizar a complexidade por trás da experiência.</p></div>
      <Link href="/cadastro">Começar meu evento</Link>
    </section>
  </PublicSiteShell>;
}
