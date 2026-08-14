import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './public-site-shell.module.css';

const navigation = [
  { href: '/eventos', label: 'Eventos' },
  { href: '/solucoes', label: 'Soluções' },
  { href: '/para-quem', label: 'Para quem' },
  { href: '/conteudos', label: 'Conteúdos' },
  { href: '/sobre', label: 'Sobre a Evolvia' },
] as const;

export function PublicSiteShell({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>
    <a className={styles.skip} href="#conteudo-principal">Ir para o conteúdo principal</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/" aria-label="Evolvia — página inicial">
          <span className={styles.brandMark} aria-hidden="true">E</span>
          EVOLVIA
        </Link>
        <nav className={styles.desktopNav} aria-label="Navegação principal">
          {navigation.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className={styles.access} aria-label="Acessos à plataforma">
          <Link className={styles.accessLink} href="/login?perfil=participante">Área do participante</Link>
          <Link className={styles.accessLink} href="/login?perfil=organizador">Área do organizador</Link>
          <Link className={styles.primary} href="/cadastro">Criar evento</Link>
        </div>
        <details className={styles.mobileNav}>
          <summary aria-label="Abrir menu">☰</summary>
          <nav className={styles.mobilePanel} aria-label="Navegação móvel">
            {navigation.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
            <span className={styles.mobileDivider} aria-hidden="true" />
            <Link href="/login?perfil=participante">Área do participante</Link>
            <Link href="/login?perfil=organizador">Área do organizador</Link>
            <Link href="/cadastro">Criar evento</Link>
          </nav>
        </details>
      </div>
    </header>
    <main className={styles.main} id="conteudo-principal">{children}</main>
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div>
          <div className={styles.footerBrand}>EVOLVIA</div>
          <p className={styles.footerLead}>Tecnologia para tornar a criação, divulgação, participação e operação de eventos mais simples, integrada e acessível.</p>
        </div>
        <div>
          <h2>Descobrir</h2>
          <nav aria-label="Descobrir eventos">
            <Link href="/eventos">Encontrar eventos</Link>
            <Link href="/eventos?formato=online">Eventos online</Link>
            <Link href="/eventos?formato=hibrido">Eventos híbridos</Link>
          </nav>
        </div>
        <div>
          <h2>Evolvia</h2>
          <nav aria-label="Institucional">
            <Link href="/sobre">O que é a Evolvia</Link>
            <Link href="/sobre#quem-somos">Quem somos</Link>
            <Link href="/sobre#onde-estamos">Onde estamos</Link>
            <Link href="/para-quem">Quem atendemos</Link>
          </nav>
        </div>
        <div>
          <h2>Conhecimento</h2>
          <nav aria-label="Conteúdos e soluções">
            <Link href="/conteudos">Conteúdos</Link>
            <Link href="/solucoes">Soluções</Link>
            <Link href="/login?perfil=organizador">Área do organizador</Link>
          </nav>
        </div>
      </div>
      <div className={styles.footerBottom}>
        <span>© Evolvia. Todos os direitos reservados.</span>
        <span>Privacidade, segurança e acessibilidade como requisitos de produto.</span>
      </div>
    </footer>
  </div>;
}

export { styles as publicSiteStyles };
