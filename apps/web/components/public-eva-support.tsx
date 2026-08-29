'use client';

import { useEffect, useRef, useState } from 'react';
import { formatEventDate } from '../lib/event-time-zone';
import {
  formatEstimatedAudience,
  publicEventTypeLabel,
  type PublicEventProfileCode,
} from '../lib/public-event-profile';
import styles from '../app/evento/[slug]/page.module.css';

type EvaTopic = 'PROFILE' | 'WHEN' | 'FORMAT' | 'PLACE' | 'ACCESSIBILITY' | 'CONTACT';
type EventFormat = 'IN_PERSON' | 'ONLINE' | 'HYBRID';

type PublicEvaSupportProps = {
  eventName: string;
  eventType: string;
  profileCode: PublicEventProfileCode | null;
  estimatedAudience: number | null;
  format: EventFormat;
  startDate: string | null;
  endDate: string | null;
  timeZone: string | null;
  venue: string | null;
  accessibilitySummary: string | null;
  publicContactEmail: string | null;
  publicContactPhone: string | null;
};

type EvaAnswer = {
  title: string;
  text: string;
  targetId?: 'accessibility-title' | 'contact-title';
  targetLabel?: string;
};

const topics: Array<{ id: EvaTopic; label: string }> = [
  { id: 'PROFILE', label: 'Que tipo de evento é?' },
  { id: 'WHEN', label: 'Quando acontece?' },
  { id: 'FORMAT', label: 'Como será?' },
  { id: 'PLACE', label: 'Onde será?' },
  { id: 'ACCESSIBILITY', label: 'Há informações de acessibilidade?' },
  { id: 'CONTACT', label: 'Como falar com a organização?' },
];

function answerFor(topic: EvaTopic, event: PublicEvaSupportProps): EvaAnswer {
  if (topic === 'PROFILE') {
    const eventType = publicEventTypeLabel(event.eventType, event.profileCode);
    const estimatedAudience = formatEstimatedAudience(event.estimatedAudience);
    return {
      title: 'Tipo e público estimado',
      text: estimatedAudience
        ? `A organização publicou este evento como ${eventType} e informou uma estimativa de ${estimatedAudience} pessoas. A estimativa orienta o porte esperado, mas não representa inscrição confirmada.`
        : `A organização publicou este evento como ${eventType}. O público estimado ainda não foi informado; a EVA não deduz nem inventa esse dado.`,
    };
  }

  if (topic === 'WHEN') {
    const startsAt = formatEventDate(event.startDate, event.timeZone);
    const endsAt = formatEventDate(event.endDate, event.timeZone);
    if (startsAt && endsAt && startsAt !== endsAt) {
      return {
        title: 'Datas do evento',
        text: `${event.eventName} está previsto para acontecer de ${startsAt} até ${endsAt}.`,
      };
    }
    if (startsAt) {
      return {
        title: 'Data do evento',
        text: `${event.eventName} está previsto para ${startsAt}.`,
      };
    }
    return {
      title: 'Data ainda não publicada',
      text: 'A organização ainda não informou uma data nesta página. Consulte novamente mais tarde ou use o contato oficial, quando disponível.',
    };
  }

  if (topic === 'FORMAT') {
    if (event.format === 'ONLINE') {
      return {
        title: 'Evento online',
        text: 'A participação será online. Informações de acesso devem ser confirmadas somente pelos canais oficiais do evento.',
      };
    }
    if (event.format === 'HYBRID') {
      return {
        title: 'Evento híbrido',
        text: 'O evento combina participação presencial e online. Consulte as orientações publicadas pela organização antes de se deslocar ou acessar a transmissão.',
      };
    }
    return {
      title: 'Evento presencial',
      text: 'A participação será presencial. Confira o local e as orientações oficiais antes de se deslocar.',
    };
  }

  if (topic === 'PLACE') {
    if (event.format === 'ONLINE') {
      return {
        title: 'Participação online',
        text: 'Este evento é online. O link ou modo de acesso deve ser fornecido pelos canais oficiais da organização; a EVA não cria nem antecipa credenciais.',
      };
    }
    if (event.venue?.trim()) {
      return {
        title: event.format === 'HYBRID' ? 'Local da etapa presencial' : 'Local do evento',
        text: event.venue.trim(),
      };
    }
    return {
      title: 'Local ainda não publicado',
      text: 'A organização ainda não informou o local nesta página. Consulte novamente mais tarde ou use o contato oficial, quando disponível.',
    };
  }

  if (topic === 'ACCESSIBILITY') {
    if (event.accessibilitySummary?.trim()) {
      return {
        title: 'Acessibilidade informada pela organização',
        text: event.accessibilitySummary.trim(),
        targetId: 'accessibility-title',
        targetLabel: 'Ir para a seção de acessibilidade',
      };
    }
    return {
      title: 'Informação ainda não publicada',
      text: 'Esta página ainda não traz informações específicas de acessibilidade. A ausência desse resumo não comprova disponibilidade ou indisponibilidade de recursos; confirme com a organização.',
      ...(event.publicContactEmail || event.publicContactPhone
        ? { targetId: 'contact-title' as const, targetLabel: 'Ir para o contato oficial' }
        : {}),
    };
  }

  if (event.publicContactEmail || event.publicContactPhone) {
    return {
      title: 'Contato oficial do evento',
      text: 'Use somente os canais publicados pela organização nesta página. A EVA não solicita senha, token, pagamento ou dados pessoais para prestar esta orientação.',
      targetId: 'contact-title',
      targetLabel: 'Ir para o contato oficial',
    };
  }
  return {
    title: 'Contato ainda não publicado',
    text: 'A organização ainda não disponibilizou um canal de contato nesta página. A EVA não inventa contatos nem consulta dados privados para completar essa informação.',
  };
}

export default function PublicEvaSupport(event: PublicEvaSupportProps) {
  const [selectedTopic, setSelectedTopic] = useState<EvaTopic | null>(null);
  const answerRef = useRef<HTMLElement>(null);
  const answer = selectedTopic ? answerFor(selectedTopic, event) : null;

  useEffect(() => {
    if (answer) answerRef.current?.focus();
  }, [selectedTopic, answer]);

  return <aside className={styles.evaSupport} aria-labelledby="eva-support-title">
    <div className={styles.evaIntro}>
      <p className={styles.evaEyebrow}>EVA · SUPORTE CONTEXTUAL</p>
      <h2 id="eva-support-title">Posso orientar sobre este evento</h2>
      <p>Escolha uma dúvida. As respostas usam somente as informações exibidas nesta página e não consultam dados de outros eventos ou usuários.</p>
      <p className={styles.evaScope}>Neste estágio, a EVA orienta de forma determinística: não realiza inscrição, pagamento, alteração ou acesso a dados pessoais.</p>
    </div>

    <div>
      <div className={styles.evaTopics} role="group" aria-label="Dúvidas que a EVA pode orientar">
        {topics.map((topic) => <button
          type="button"
          key={topic.id}
          aria-pressed={selectedTopic === topic.id}
          onClick={() => setSelectedTopic(topic.id)}
        >
          {topic.label}
        </button>)}
      </div>

      {answer ? <section
        className={styles.evaAnswer}
        ref={answerRef}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
      >
        <p className={styles.evaAnswerLabel}>Orientação da EVA</p>
        <h3>{answer.title}</h3>
        <p>{answer.text}</p>
        {answer.targetId && answer.targetLabel && <a href={`#${answer.targetId}`}>{answer.targetLabel}</a>}
      </section> : <p className={styles.evaPrompt} role="status">
        Selecione uma das dúvidas para receber uma orientação.
      </p>}
    </div>
  </aside>;
}
