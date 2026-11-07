'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PublicDiscoveryStrip from '../components/public-discovery-strip';
import PublicEventsPreview from '../components/public-events-preview';
import PublicPlatformGuide from '../components/public-platform-guide';
import PublicSiteHeader from '../components/public-site-header';
import PublicProfilePicker from '../components/public-profile-picker';
import { findEventProfileGroup } from '../lib/event-profile-catalog';
import styles from './home-viewport.module.css';

const WIZARD_PRESTART_KEY = 'evolvia_wizard_prestart_v2';

function readPersistedEventType(): string {
  try {
    const raw = localStorage.getItem(WIZARD_PRESTART_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { eventType?: unknown };
    return findEventProfileGroup(parsed.eventType) ? parsed.eventType as string : '';
  } catch {
    return '';
  }
}

function persistEventType(eventType: string) {
  try {
    const raw = localStorage.getItem(WIZARD_PRESTART_KEY);
    const previous = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    localStorage.setItem(WIZARD_PRESTART_KEY, JSON.stringify({ ...previous, eventType }));
  } catch {
    localStorage.setItem(WIZARD_PRESTART_KEY, JSON.stringify({ eventType }));
  }
}

export default function HomePage() {
  const [selectedEventType, setSelectedEventType] = useState('');

  useEffect(() => {
    setSelectedEventType(readPersistedEventType());
  }, []);

  function chooseEventType(eventType: string) {
    setSelectedEventType(eventType);
    persistEventType(eventType);
  }

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <main id="main-content" className={`shell ${styles.viewport}`} tabIndex={-1}>
    <PublicSiteHeader current="home" />
    <PublicDiscoveryStrip />

    <section className="container hero">
      <div>
        <h1>Seu evento começa com uma conversa.</h1>
        <p>A EVA faz perguntas simples, sugere as melhores configurações e ajuda você a construir seu evento sem depender de uma equipe técnica.</p>
        <div className={`nav-actions ${styles.primaryActions}`}>
          <Link className="btn btn-primary" href="/cadastro">Começar meu evento</Link>
          <Link className="btn btn-secondary" href="/eventos">Explorar eventos</Link>
        </div>
      </div>

      <div className="hero-card">
        <div className="eva-bubble" id="event-type-question">
          Olá! Eu sou a EVA. Para começarmos, qual é o perfil do seu evento?
        </div>

        <PublicProfilePicker selectedEventType={selectedEventType} onChoose={chooseEventType} />
      </div>
    </section>

      <PublicEventsPreview />
      <PublicPlatformGuide />
      <footer className={styles.legalFooter}>
        <span>Evolvia — privacidade e acessibilidade desde a origem.</span>
        <div className={styles.footerLinks}>
          <nav aria-label="Ajuda">
            <Link href="/ajuda">Ajuda</Link>
            <Link href="/acessibilidade">Acessibilidade</Link>
            <Link href="/eventos">Eventos</Link>
          </nav>
          <nav aria-label="Documentos jurídicos">
            <Link href="/termos-de-uso">Termos de Uso</Link>
            <Link href="/privacidade">Privacidade</Link>
          </nav>
        </div>
      </footer>
    </main>
  </>;
}
