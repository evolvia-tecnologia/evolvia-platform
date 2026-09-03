'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PublicEventsPreview from '../components/public-events-preview';
import PublicSiteHeader from '../components/public-site-header';
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

function clearPersistedEventType() {
  try {
    const raw = localStorage.getItem(WIZARD_PRESTART_KEY);
    const previous = raw ? JSON.parse(raw) : {};
    const next = previous && typeof previous === 'object' && !Array.isArray(previous)
      ? { ...(previous as Record<string, unknown>) }
      : {};
    delete next.eventType;
    localStorage.setItem(WIZARD_PRESTART_KEY, JSON.stringify(next));
  } catch {
    localStorage.removeItem(WIZARD_PRESTART_KEY);
  }
}

export default function HomePage() {
  const [selectedEventType, setSelectedEventType] = useState('');
  const [activeGroupId, setActiveGroupId] = useState('');

  const activeGroup = useMemo(
    () => EVENT_PROFILE_GROUPS.find((group) => group.id === activeGroupId),
    [activeGroupId],
  );

  useEffect(() => {
    const persistedEventType = readPersistedEventType();
    setSelectedEventType(persistedEventType);
    setActiveGroupId(findEventProfileGroup(persistedEventType)?.id ?? '');
  }, []);

  function chooseGroup(groupId: string) {
    setActiveGroupId(groupId);
  }

  function chooseEventType(eventType: string) {
    setSelectedEventType(eventType);
    persistEventType(eventType);
  }

  function returnToGroups() {
    setActiveGroupId('');
    setSelectedEventType('');
    clearPersistedEventType();
  }

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <main id="main-content" className={`shell ${styles.viewport}`} tabIndex={-1}>
    <PublicSiteHeader current="home" />

    <section className="container hero">
      <div>
        <p className="event-status">EVOLVIA CORE v0.2</p>
        <h1>Seu evento começa com uma conversa.</h1>
        <p>A EVA faz perguntas simples, sugere as melhores configurações e ajuda você a construir seu evento sem depender de uma equipe técnica.</p>
        <div className={`nav-actions ${styles.primaryActions}`}>
          <Link className="btn btn-primary" href="/cadastro">Começar meu evento</Link>
          <Link className="btn btn-secondary" href="/eventos">Explorar eventos</Link>
        </div>
      </div>

      <div className="hero-card">
        <div className="eva-bubble" id="event-type-question" aria-live="polite">
          {activeGroup
            ? `${activeGroup.label}: qual tipo descreve melhor seu evento?`
            : 'Olá! Eu sou a EVA. Para começarmos, qual é o perfil do seu evento?'}
        </div>

        {activeGroup ? <>
          <p className={`muted small ${styles.groupDescription}`} id="event-group-description">
            {activeGroup.description}
          </p>
          <div
            className="options-grid"
            role="group"
            aria-labelledby="event-type-question"
            aria-describedby="event-group-description"
          >
            {activeGroup.options.map((profile) => {
              const selected = selectedEventType === profile.value;
              return <button
                key={profile.value}
                type="button"
                className={`option${selected ? ' selected' : ''}`}
                aria-pressed={selected}
                onClick={() => chooseEventType(profile.value)}
              >
                {profile.value}
              </button>;
            })}
            <button type="button" className="option" onClick={returnToGroups}>
              ← Escolher outro perfil
            </button>
          </div>
        </> : <div className="options-grid" role="group" aria-labelledby="event-type-question">
          {EVENT_PROFILE_GROUPS.map((group) => <button
            key={group.id}
            type="button"
            className="option"
            aria-pressed={false}
            onClick={() => chooseGroup(group.id)}
          >
            {group.label}
          </button>)}
        </div>}

        <p className={`muted small ${styles.selectionStatus}`} aria-live="polite">
          {selectedEventType
            ? `Perfil inicial escolhido: ${selectedEventType}. A EVA levará essa escolha para o Wizard.`
            : activeGroup
              ? 'Escolha o tipo mais próximo da sua realidade. Você poderá alterar depois.'
              : 'Escolha primeiro um perfil para ver somente os tipos relacionados.'}
        </p>
      </div>
    </section>

      <PublicEventsPreview />
      <footer className={styles.legalFooter}>
        <span>Evolvia — privacidade e acessibilidade desde a origem.</span>
        <nav aria-label="Documentos jurídicos">
          <Link href="/termos-de-uso">Termos de Uso</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </footer>
    </main>
  </>;
}
