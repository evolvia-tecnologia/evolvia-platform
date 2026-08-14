import type { Metadata } from 'next';
import { PublicSiteShell } from '../../components/public-site-shell';
import styles from '../../components/public-site-shell.module.css';

export const metadata: Metadata = {
  title: 'Para quem é a Evolvia',
  description: 'Jornadas para organizadores, participantes, autores, avaliadores, palestrantes, expositores e patrocinadores.',
};

const audiences = [
  ['Organizadores e equipes', 'Empresas, universidades, associações, produtoras e equipes que precisam estruturar e operar eventos com controle.'],
  ['Participantes', 'Pessoas que querem descobrir, se inscrever, acompanhar programação e acessar seus eventos com clareza.'],
  ['Autores e pesquisadores', 'Fluxos científicos separados da administração, com identidade própria, submissão e acompanhamento.'],
  ['Avaliadores', 'Experiência específica para análise científica, critérios, conflitos e decisões sem confundir papéis.'],
  ['Palestrantes e convidados', 'Convites, informações de participação, agenda e comunicação conectados ao evento.'],
  ['Expositores e patrocinadores', 'Jornadas próprias para empresas, equipes, espaços, materiais, leads consentidos e retorno sobre participação.'],
] as const;

export default function AudiencesPage() {
  return <PublicSiteShell>
    <div className={styles.page}>
      <p className={styles.eyebrow}>PARA QUEM</p>
      <h1 className={styles.title}>Cada pessoa vive uma jornada diferente. O evento continua sendo um só.</h1>
      <p className={styles.lead}>A arquitetura da Evolvia separa permissões e experiências sem duplicar dados ou transformar o produto em ferramentas desconectadas.</p>
      <section className={styles.section} aria-labelledby="publicos-lista">
        <div className={styles.sectionHead}><div><h2 id="publicos-lista">Públicos atendidos</h2><p>As interfaces e capacidades aparecem conforme o papel, o tipo de evento e a etapa real da jornada.</p></div></div>
        <div className={styles.grid}>
          {audiences.map(([title, description]) => <article className={styles.card} key={title}><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>
    </div>
  </PublicSiteShell>;
}
