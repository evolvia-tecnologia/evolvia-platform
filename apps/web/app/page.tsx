'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PublicEventsPreview from '../components/public-events-preview';
import styles from './home-viewport.module.css';

const eventTypes = [
  'Congresso ou evento científico',
  'Evento corporativo ou treinamento',
  'Feira ou exposição',
  'Show ou entretenimento',
] as const;

const WIZARD_PRESTART_KEY = 'evolvia_wizard_prestart_v2';

function readPersistedEventType(): string {
  try {
    const raw = localStorage.getItem(WIZARD_PRESTART_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { eventType?: unknown };
    return typeof parsed.eventType === 'string' && eventTypes.includes(parsed.eventType as (typeof eventTypes)[number])
      ? parsed.eventType
      : '';
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
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Evolvia — início">EVOLVIA</Link>
      <nav className="nav-actions" aria-label="Navegação principal">
        <Link className="btn-link" href="/eventos">Explorar eventos</Link>
        <Link className="btn-link" href="/login">Entrar</Link>
        <Link className="btn btn-primary" href="/cadastro">Criar conta</Link>
      </nav>
    </header>

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
        <div className="eva-bubble" id="event-type-question">Olá! Eu sou a EVA. Para começarmos, que tipo de evento você quer criar?</div>
        <div className="options-grid" role="group" aria-labelledby="event-type-question">
          {eventTypes.map((eventType) => {
            const selected = selectedEventType === eventType;
            return <button
              key={eventType}
              type="button"
              className={`option${selected ? ' selected' : ''}`}
              aria-pressed={selected}
              onClick={() => chooseEventType(eventType)}
            >
              {eventType}
            </button>;
          })}
        </div>
        <p className={`muted small ${styles.selectionStatus}`} aria-live="polite">
          {selectedEventType
            ? `Perfil inicial escolhido: ${selectedEventType}. A EVA levará essa escolha para o Wizard.`
            : 'Escolha uma opção para a EVA preparar o perfil inicial. Você poderá alterar depois.'}
        </p>
      </div>
    </section>

      <PublicEventsPreview />
    </main>
  </>;
}
