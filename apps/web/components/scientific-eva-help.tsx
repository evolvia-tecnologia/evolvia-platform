'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import styles from './scientific-eva-help.module.css';

export type EvaHelpQuestion = {
  question: string;
  answer: string;
};

type ScientificEvaHelpProps = {
  context: string;
  intro: string;
  questions: EvaHelpQuestion[];
};

export default function ScientificEvaHelp({ context, intro, questions }: ScientificEvaHelpProps) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus?.();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); triggerRef.current?.focus?.(); };
  }, [open]);

  function moveQuestion(event: ReactKeyboardEvent<HTMLDivElement>) {
    const last = questions.length - 1;
    if (last < 0) return;
    const current = activeQuestion ?? -1;
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? last
        : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (current < 0 ? 0 : (current + 1) % questions.length)
          : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? (current < 0 ? last : (current - 1 + questions.length) % questions.length)
            : -1;
    if (next < 0) return;
    event.preventDefault();
    setActiveQuestion(next);
    const button = event.currentTarget.querySelectorAll?.('button')?.[next];
    button?.focus?.();
  }

  const selected = activeQuestion === null ? null : questions[activeQuestion];

  return <>
    <button
      type="button"
      ref={triggerRef}
      className={styles.trigger}
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label="Precisa de ajuda? Pergunte sobre esta etapa"
    >
      <span className={styles.triggerMark}>EVA</span>
      <span><strong>Precisa de ajuda?</strong><small>Pergunte sobre esta etapa</small></span>
    </button>

    {open && <aside id={panelId} className={styles.panel} role="dialog" aria-label={`Ajuda da EVA — ${context}`}>
      <div className={styles.panelHead}>
        <div><span className={styles.mark}>EVA</span><div><strong>Ajuda contextual</strong><small>{context}</small></div></div>
        <button type="button" ref={closeRef} className={styles.close} onClick={() => setOpen(false)} aria-label="Fechar ajuda da EVA">×</button>
      </div>

      <p className={styles.intro}>{intro}</p>

      <div className={styles.questions} role="group" aria-label="Dúvidas comuns nesta etapa" onKeyDown={moveQuestion}>
        <span>Dúvidas comuns nesta etapa</span>
        {questions.map((item, index) => <button
          key={item.question}
          type="button"
          className={activeQuestion === index ? styles.questionActive : styles.question}
          tabIndex={activeQuestion === null ? (index === 0 ? 0 : -1) : (activeQuestion === index ? 0 : -1)}
          aria-pressed={activeQuestion === index}
          onClick={() => setActiveQuestion(index)}
        >{item.question}</button>)}
      </div>

      <div className={styles.answer} aria-live="polite">
        {selected ? <><strong>{selected.question}</strong><p>{selected.answer}</p></> : <p>Escolha uma dúvida acima.</p>}
      </div>

      <p className={styles.safety}>A EVA orienta dentro da plataforma. Ela não envia dados pessoais, documentos ou segredos para fora do Evolvia e não altera inscrições, pagamentos ou decisões sem uma ação sua.</p>
    </aside>}
  </>;
}
