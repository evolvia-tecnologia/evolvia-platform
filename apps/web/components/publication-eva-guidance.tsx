'use client';

import { useRef, useState } from 'react';
import styles from './publication-editor.module.css';

type EvaTopic = 'PENDING' | 'PERMISSIONS' | 'NEXT';

export type PublicationEvaGuidanceData = {
  scope: 'EVENT_PUBLICATION';
  summary: string;
  pendingItems: Array<{
    code: string;
    label: string;
    priority: 'BLOCKING' | 'RECOMMENDED';
  }>;
  editExplanation: string;
  publicationExplanation: string;
  nextStep: {
    code: string;
    label: string;
    description: string;
    targetId: 'publication-form' | 'publication-release-title';
  };
};

const topics: Array<{ id: EvaTopic; label: string }> = [
  { id: 'PENDING', label: 'O que falta para publicar?' },
  { id: 'PERMISSIONS', label: 'Por que não posso editar ou publicar?' },
  { id: 'NEXT', label: 'Qual é o próximo passo?' },
];

export default function PublicationEvaGuidance({
  guidance,
  hasUnsavedChanges,
}: {
  guidance: PublicationEvaGuidanceData;
  hasUnsavedChanges: boolean;
}) {
  const [topic, setTopic] = useState<EvaTopic>('NEXT');
  const answerRef = useRef<HTMLDivElement>(null);

  const selectTopic = (nextTopic: EvaTopic) => {
    setTopic(nextTopic);
    window.requestAnimationFrame(() => answerRef.current?.focus());
  };

  const nextStep = hasUnsavedChanges
    ? {
        label: 'Salvar alterações pendentes',
        description: 'O Gate e a orientação usam a última versão salva. Salve ou descarte o rascunho antes de continuar.',
        targetId: 'publication-form' as const,
      }
    : guidance.nextStep;

  return <section className={styles.evaCard} aria-labelledby="eva-publication-editor-title">
    <div className={styles.evaMark} aria-hidden="true">EVA</div>
    <div className={styles.evaContent}>
      <p className={styles.eyebrow}>ORIENTAÇÃO DA DIVULGAÇÃO</p>
      <h2 id="eva-publication-editor-title">O que fazer agora neste evento</h2>
      <p>A EVA usa somente o estado, o checklist e as permissões desta página. Ela orienta, mas não altera nem publica nada.</p>

      <div className={styles.evaTopics} role="group" aria-label="Perguntas para a EVA">
        {topics.map((item) => <button
          key={item.id}
          type="button"
          className={styles.evaTopic}
          aria-pressed={topic === item.id}
          onClick={() => selectTopic(item.id)}
        >{item.label}</button>)}
      </div>

      <div ref={answerRef} className={styles.evaAnswer} tabIndex={-1} role="status" aria-live="polite">
        {topic === 'PENDING' && <>
          <h3>Pendências verificadas</h3>
          <p>{guidance.summary}</p>
          {guidance.pendingItems.length > 0 ? <ul>
            {guidance.pendingItems.map((item) => <li key={item.code}>
              <strong>{item.priority === 'BLOCKING' ? 'Obrigatório' : 'Recomendado'}:</strong> {item.label}
            </li>)}
          </ul> : <p>Nenhuma pendência foi encontrada no checklist atual.</p>}
        </>}

        {topic === 'PERMISSIONS' && <>
          <h3>O que está permitido agora</h3>
          <p>{guidance.editExplanation}</p>
          <p>{guidance.publicationExplanation}</p>
        </>}

        {topic === 'NEXT' && <>
          <h3>{nextStep.label}</h3>
          <p>{nextStep.description}</p>
          <a className={styles.evaNextLink} href={`#${nextStep.targetId}`}>Ir para esta etapa</a>
        </>}
      </div>
    </div>
  </section>;
}
