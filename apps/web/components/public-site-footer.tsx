import Link from 'next/link';
import { PUBLIC_EVENT_PROFILES } from '../lib/public-event-profile';
import styles from './public-site-footer.module.css';

const RESOURCES = [
  { href: '/ajuda/inscricoes', label: 'Inscrições e participantes' },
  { href: '/ajuda/credenciamento', label: 'Credenciamento e acesso' },
  { href: '/ajuda/programacao', label: 'Programação do evento' },
  { href: '/ajuda/trabalhos-cientificos', label: 'Trabalhos científicos' },
  { href: '/ajuda/certificados', label: 'Certificados de participação' },
  { href: '/ajuda/evento-online', label: 'Eventos online e híbridos' },
] as const;

const ACCESS = [
  { href: '/cadastro', label: 'Começar como organizador' },
  { href: '/login', label: 'Entrar no painel' },
  { href: '/participante', label: 'Área do participante' },
  { href: '/eventos', label: 'Encontrar um evento' },
  { href: '/ajuda', label: 'Central de ajuda' },
] as const;

/** Navegação pública. Perfis e destinos reutilizam os contratos já existentes. */
export default function PublicSiteFooter() {
  return (
    <footer className={styles.footer} aria-label="Evolvia — informações e navegação">
      <div className={styles.inner}>
        <div className={styles.invitation}>
          <div>
            <p className={styles.eyebrow}>PESSOAS, IDEIAS E NOVOS ENCONTROS</p>
            <h2>Seu próximo evento começa aqui.</h2>
            <p>Um espaço para quem organiza. Um caminho para quem participa.</p>
          </div>
          <Link className={styles.cta} href="/cadastro">
            Criar meu evento <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <div className={styles.directory}>
          <div className={styles.identity}>
            <Link className={styles.brand} href="/" aria-label="Evolvia — início">EVOLVIA<span aria-hidden="true">.</span></Link>
            <p>Tecnologia para organizar encontros, conectar pessoas e dar continuidade a cada experiência.</p>
            <p className={styles.eva}>Com a EVA, orientação faz parte do caminho.</p>
            <span className={styles.locale} lang="pt-BR">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z" />
              </svg>
              Português (Brasil)
            </span>
          </div>

          <nav className={styles.column} aria-label="Contextos de evento">
            <h3>Para diferentes encontros</h3>
            <ul>
              {PUBLIC_EVENT_PROFILES.map((profile) => (
                <li key={profile.value}>
                  <Link href={`/eventos?profile=${profile.value}`}>{profile.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className={styles.column} aria-label="Recursos da Evolvia">
            <h3>Conheça os recursos</h3>
            <ul>
              {RESOURCES.map((resource) => (
                <li key={resource.href}><Link href={resource.href}>{resource.label}</Link></li>
              ))}
            </ul>
          </nav>

          <nav className={styles.column} aria-label="Acessos da Evolvia">
            <h3>Encontre seu caminho</h3>
            <ul>
              {ACCESS.map((access) => (
                <li key={access.href}><Link href={access.href}>{access.label}</Link></li>
              ))}
            </ul>
          </nav>
        </div>

        <div className={styles.bottom}>
          <p>© Evolvia. Encontros que conectam. Experiências que evoluem.</p>
          <nav aria-label="Documentos jurídicos">
            <Link href="/termos-de-uso">Termos de uso</Link>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/acessibilidade">Acessibilidade</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
