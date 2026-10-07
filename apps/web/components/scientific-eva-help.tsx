'use client';

import { useEffect, useId, useRef, useState } from 'react';
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
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); triggerRef.current?.focus(); };
  }, [open]);

  const selected = activeQuestion === null ? null : questions[activeQuestion];

  return <>
    <button
      type="button"
      ref={triggerRef}
      className={styles.trigger}
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      aria-controls={panelId}
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

      <div className={styles.questions}>
        <span>Dúvidas comuns nesta etapa</span>
        {questions.map((item, index) => <button
          key={item.question}
          type="button"
          className={activeQuestion === index ? styles.questionActive : styles.question}
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
