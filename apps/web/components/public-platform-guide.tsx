import Link from 'next/link';
import { PUBLIC_SUBJECT_AREAS } from '../lib/public-discovery';
import styles from './public-platform-guide.module.css';

const FEATURES = [
  { href: '/ajuda/inscricoes', title: 'Inscrições', icon: 'ticket', text: 'Categoria, lote, ficha e protocolo. O pagamento só começa quando a vaga é paga.' },
  { href: '/ajuda/programacao', title: 'Programação', icon: 'calendar', text: 'O que foi publicado fica na página do evento. Rascunho e avaliação não vazam para o público.' },
  { href: '/ajuda/certificados', title: 'Certificados', icon: 'seal', text: 'A credencial de entrada já acompanha a inscrição. Certificado automático ainda não é emitido aqui.' },
  { href: '/ajuda/credenciamento', title: 'Credenciamento', icon: 'badge', text: 'A equipe valida a credencial na entrada, sem lista de e-mail ou documento.' },
  { href: '/ajuda/trabalhos-cientificos', title: 'Trabalhos científicos', icon: 'paper', text: 'Submissão e avaliação só aparecem no evento que realmente precisa delas.' },
  { href: '/ajuda/evento-online', title: 'Evento online', icon: 'screen', text: 'Formato online, híbrido ou presencial, com inscrição e área do participante nos três.' },
] as const;

function FeatureIcon({ name }: { name: (typeof FEATURES)[number]['icon'] }) {
  const common = {
    viewBox: '0 0 32 32',
    'aria-hidden': true,
    className: styles.icon,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (name === 'ticket') {
    return <svg {...common}><path d="M6 11h20v4a2.5 2.5 0 0 0 0 5v4H6v-4a2.5 2.5 0 0 0 0-5v-4Z" /><path d="M16 11v13" /></svg>;
  }
  if (name === 'calendar') {
    return <svg {...common}><rect x="6" y="8" width="20" height="17" rx="2" /><path d="M6 13h20M11 6v4M21 6v4" /></svg>;
  }
  if (name === 'seal') {
    return <svg {...common}><circle cx="16" cy="15" r="7" /><path d="m12.5 21.5-1.5 5 5-2.2 5 2.2-1.5-5" /></svg>;
  }
  if (name === 'badge') {
    return <svg {...common}><rect x="8" y="6" width="16" height="20" rx="2" /><path d="M12 12h8M12 16h8M12 20h5" /></svg>;
  }
  if (name === 'paper') {
    return <svg {...common}><path d="M10 6h8l6 6v14H10V6Z" /><path d="M18 6v6h6M13 17h8M13 21h6" /></svg>;
  }
  return <svg {...common}><rect x="5" y="7" width="22" height="14" rx="2" /><path d="M12 25h8M16 21v4" /></svg>;
}

export default function PublicPlatformGuide() {
  return <>
    <section className={styles.section} aria-labelledby="platform-features-title">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>O QUE A EVOLVIA FAZ</p>
        <h2 id="platform-features-title">Funcionalidades com o que já está no produto</h2>
        <p className={styles.intro}>Cada cartão leva a uma explicação curta. O que ainda não é emitido, como o certificado automático, está dito com clareza.</p>
        <div className={styles.grid}>
          {FEATURES.map((feature) => <article className={styles.card} key={feature.href}>
            <FeatureIcon name={feature.icon} />
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
            <Link href={feature.href}>Saiba mais</Link>
          </article>)}
        </div>
      </div>
    </section>

    <section className={styles.sectionAlt} aria-labelledby="platform-areas-title">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>ENCONTRE POR ASSUNTO</p>
        <h2 id="platform-areas-title">Áreas de atuação</h2>
        <p className={styles.intro}>A busca usa o perfil do evento e as palavras publicadas no nome, no tipo e na descrição. Não há uma classificação escondida.</p>
        <div className={styles.areas}>
          {PUBLIC_SUBJECT_AREAS.map((area) => <Link key={area.id} href={`/eventos?area=${area.id}`}>
            <strong>{area.label}</strong>
            <span>{area.description}</span>
          </Link>)}
        </div>
      </div>
    </section>

    <section className={styles.section} aria-labelledby="platform-access-title">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>POR ONDE ENTRAR</p>
        <h2 id="platform-access-title">Participante, organizador e ajuda</h2>
        <div className={styles.access}>
          <article>
            <h3>Participante</h3>
            <p>Consulte inscrições, credencial e trabalhos com a conta de quem participa.</p>
            <Link href="/participante">Abrir área do participante</Link>
          </article>
          <article>
            <h3>Organizador</h3>
            <p>Crie o evento, homologue a página e publique. A entrada da equipe é outra conta.</p>
            <Link href="/login">Entrar como organizador</Link>
          </article>
          <article>
            <h3>Ajuda e acessibilidade</h3>
            <p>Teclado, foco visível, texto que reflow e o resumo de acessibilidade de cada evento.</p>
            <Link href="/ajuda">Ver a ajuda</Link>
            <Link href="/acessibilidade">Acessibilidade do site</Link>
          </article>
        </div>
      </div>
    </section>
  </>;
}
