'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  browserSpeechEngine,
  collectReadableText,
  SpeechEngine,
  startLocalReading,
  stopLocalReading,
} from '../lib/accessibility-reading';
import {
  ACCESSIBILITY_STORAGE_KEY,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  AccessibilityPreferences,
  applyAccessibilityPreferences,
  parseAccessibilityPreferences,
} from '../lib/accessibility-preferences';
import styles from './accessibility-panel.module.css';

function readStoredPreferences(): AccessibilityPreferences {
  try {
    return parseAccessibilityPreferences(localStorage.getItem(ACCESSIBILITY_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  }
}

function writeStoredPreferences(preferences: AccessibilityPreferences): void {
  localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(preferences));
}

export default function AccessibilityPanel({ inline = false }: { inline?: boolean }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SpeechEngine | null>(null);
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const [status, setStatus] = useState('');
  const [speechSupport, setSpeechSupport] = useState<'unknown' | 'ready' | 'missing'>('unknown');
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const stored = readStoredPreferences();
    setPreferences(stored);
    applyAccessibilityPreferences(document.documentElement, stored);
  }, []);

  useEffect(() => {
    const engine = browserSpeechEngine();
    engineRef.current = engine;
    setSpeechSupport(engine ? 'ready' : 'missing');
    return () => {
      if (engine) stopLocalReading(engine);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button, input, [href], select, textarea, [tabindex]')]
        .filter((item) => !item.hasAttribute('disabled') && item.tabIndex !== -1);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (document.activeElement === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      (previous ?? launcherRef.current)?.focus();
    };
  }, [open]);

  function commit(next: AccessibilityPreferences, message: string) {
    setPreferences(next);
    applyAccessibilityPreferences(document.documentElement, next);
    try {
      writeStoredPreferences(next);
    } catch {
      setStatus('Não foi possível guardar os ajustes neste navegador.');
      return;
    }
    setStatus(message);
  }

  function update(partial: Partial<AccessibilityPreferences>) {
    commit({ ...preferences, ...partial }, 'Ajustes atualizados.');
  }

  function stopSpeech() {
    const engine = engineRef.current;
    if (engine) stopLocalReading(engine);
    setSpeaking(false);
  }

  function toggleSpeech() {
    const engine = engineRef.current;
    if (!engine) return;
    if (speaking) {
      stopSpeech();
      setStatus('Leitura interrompida.');
      return;
    }
    const text = collectReadableText(document.getElementById('conteudo-principal'));
    const result = startLocalReading(engine, text, () => {
      setSpeaking(false);
      setStatus('Leitura concluída neste dispositivo.');
    });
    if (result === 'empty') {
      setSpeaking(false);
      setStatus('Não há texto legível nesta página.');
      return;
    }
    setSpeaking(true);
    setStatus('A leitura permanece neste dispositivo.');
  }

  function restore() {
    stopSpeech();
    commit({ ...DEFAULT_ACCESSIBILITY_PREFERENCES }, 'Ajustes restaurados.');
  }

  return <div className={inline ? styles.inline : styles.floating} data-a11y-chrome="" data-a11y-speak="off">
    <button
      ref={launcherRef}
      className={styles.launcher}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? dialogId : undefined}
      onClick={() => setOpen((current) => !current)}
    >
      Acessibilidade
    </button>
    {open && typeof document !== 'undefined' && createPortal(<>
      <button className={styles.backdrop} type="button" tabIndex={-1} aria-hidden="true" data-a11y-chrome="" onClick={() => setOpen(false)} />
      <div
        ref={dialogRef}
        className={`${styles.dialog} ${inline ? styles.inlineDialog : ''}`}
        data-a11y-chrome=""
        data-a11y-speak="off"
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className={styles.heading}>
          <h2 id={titleId}>Ajustes de leitura</h2>
          <button className={styles.close} type="button" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        <p className={styles.intro} id={descriptionId}>Estes ajustes valem em todo o Evolvia neste navegador. O leitor de tela continua sendo o do seu dispositivo. A leitura em voz alta também fica nele e não envia o texto para fora.</p>
        <fieldset className={styles.group}>
          <legend>Tamanho do texto</legend>
          <div className={styles.choices}>
            {([
              ['100', 'Padrão'],
              ['125', 'Maior'],
              ['150', 'Grande'],
            ] as const).map(([value, label]) => (
              <label className={styles.choice} key={value}>
                <input type="radio" name="a11y-text" checked={preferences.text === value} onChange={() => update({ text: value })} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.group}>
          <legend>Espaçamento do texto</legend>
          <div className={styles.choices}>
            <label className={styles.choice}>
              <input type="radio" name="a11y-spacing" checked={preferences.spacing === 'default'} onChange={() => update({ spacing: 'default' })} />
              Padrão
            </label>
            <label className={styles.choice}>
              <input type="radio" name="a11y-spacing" checked={preferences.spacing === 'wide'} onChange={() => update({ spacing: 'wide' })} />
              Amplo
            </label>
          </div>
        </fieldset>
        <div className={styles.checks}>
          <label className={styles.check}><input type="checkbox" checked={preferences.font === 'readable'} onChange={(event) => update({ font: event.target.checked ? 'readable' : 'default' })} /> Fonte mais legível</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.contrast === 'high'} onChange={(event) => update({ contrast: event.target.checked ? 'high' : 'system' })} /> Contraste alto</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.links === 'on'} onChange={(event) => update({ links: event.target.checked ? 'on' : 'off' })} /> Sublinhar links</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.motion === 'reduce'} onChange={(event) => update({ motion: event.target.checked ? 'reduce' : 'system' })} /> Reduzir animações</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.focus === 'strong'} onChange={(event) => update({ focus: event.target.checked ? 'strong' : 'default' })} /> Realçar o foco do teclado</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.targets === 'large'} onChange={(event) => update({ targets: event.target.checked ? 'large' : 'default' })} /> Áreas de toque maiores</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.reading === 'on'} onChange={(event) => update({ reading: event.target.checked ? 'on' : 'off' })} /> Modo de leitura</label>
        </div>
        <p className={styles.note}>Contraste alto deixa o texto preto sobre fundo branco e os botões em azul escuro. Com a opção desmarcada, o Evolvia acompanha o contraste pedido pelo sistema operacional.</p>
        <p className={styles.note}>O modo de leitura aumenta o espaço das linhas e a medida do texto. Imagens, QR codes, credenciais e a impressão continuam visíveis.</p>
        <fieldset className={styles.group}>
          <legend>Leitura em voz alta</legend>
          <p className={styles.note}>A voz é a deste dispositivo. Nenhum texto é enviado a um serviço de voz ou de inteligência artificial.</p>
          {speechSupport === 'missing' && <p className={styles.note}>A leitura em voz alta não está disponível neste navegador.</p>}
          {speechSupport === 'ready' && <button className={styles.speech} type="button" aria-pressed={speaking} onClick={toggleSpeech}>{speaking ? 'Parar leitura' : 'Ler esta página'}</button>}
        </fieldset>
        <button className={styles.reset} type="button" onClick={restore}>Restaurar padrão</button>
        <p className={styles.status} role="status" aria-live="polite">{status}</p>
      </div>
    </>, document.body)}
  </div>;
}
