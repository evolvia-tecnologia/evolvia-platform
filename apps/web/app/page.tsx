'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PublicDiscoveryStrip from '../components/public-discovery-strip';
import PublicEventsPreview from '../components/public-events-preview';
import PublicPlatformGuide from '../components/public-platform-guide';
import PublicSiteHeader from '../components/public-site-header';
import PublicSiteFooter from '../components/public-site-footer';
import { EVENT_PROFILE_GROUPS, findEventProfileGroup } from '../lib/event-profile-catalog';
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
        <p className="event-status">EVOLVIA CORE v0.2</p>
        <h2>Seu evento começa com uma conversa.</h2>
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

        <div className={styles.profileCatalog} tabIndex={0} role="region" aria-label="Catálogo de perfis de evento">
          {EVENT_PROFILE_GROUPS.map((group) => <div className={styles.profileFamily} key={group.id}>
            <h3 id={`home-profile-${group.id}`}>{group.label}</h3>
            <p className={styles.familyDescription}>{group.description}</p>
            <div className="options-grid" role="group" aria-labelledby={`home-profile-${group.id}`}>
              {group.options.map((profile) => {
                const selected = selectedEventType === profile.value;
                return <button
                  key={profile.value}
                  type="button"
                  className={`option${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => chooseEventType(profile.value)}
                >
                  <strong>{profile.title}</strong>
                  <span>{profile.description}</span>
                </button>;
              })}
            </div>
          </div>)}
        </div>

        <p className={`muted small ${styles.selectionStatus}`} aria-live="polite">
          {selectedEventType
            ? `Perfil inicial escolhido: ${selectedEventType}. A EVA levará essa escolha para o Wizard.`
            : 'Todos os tipos estão nesta lista. Escolha o mais próximo da sua realidade. Você poderá alterar depois.'}
        </p>
      </div>
    </section>

      <PublicEventsPreview />
      <PublicPlatformGuide />
    </main>
    <PublicSiteFooter />
  </>;
}
