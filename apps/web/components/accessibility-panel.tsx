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
  elementToProbe,
  isPageMediaEvent,
  pausePageMedia,
  readableClickTarget,
  readingMaskBands,
} from '../lib/accessibility-runtime';
import {
  ACCESSIBILITY_STORAGE_KEY,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  AccessibilityPreferences,
  AccessibilityProfile,
  applyAccessibilityPreferences,
  finalizeAccessibilityPreferences,
  parseAccessibilityPreferences,
  preferencesForProfile,
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
    if (preferences.sound !== 'off') return;
    const engine = engineRef.current;
    if (engine) stopLocalReading(engine);
    setSpeaking(false);
    pausePageMedia([...document.querySelectorAll('audio, video')]);
    const onPlay = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || !isPageMediaEvent(target)) return;
      event.preventDefault();
      if ('pause' in target && typeof target.pause === 'function') target.pause();
    };
    document.addEventListener('play', onPlay, true);
    return () => document.removeEventListener('play', onPlay, true);
  }, [preferences.sound]);

  useEffect(() => {
    if (preferences.clickSpeak !== 'on' || preferences.sound === 'off') return;
    const onClick = (event: MouseEvent) => {
      const engine = engineRef.current;
      const raw = event.target instanceof Element ? event.target : null;
      const probe = raw ? readableClickTarget(elementToProbe(raw)) : null;
      const source = probe?.source instanceof Element ? probe.source : null;
      if (!engine || !source) return;
      const text = collectReadableText(source);
      const result = startLocalReading(engine, text, () => {
        setSpeaking(false);
      }, () => {
        setSpeaking(false);
        setStatus('Este navegador bloqueou a voz. O texto continua nesta página.');
      });
      if (result === 'empty') {
        setSpeaking(false);
        setStatus('Não há texto legível neste trecho.');
        return;
      }
      setSpeaking(true);
      setStatus('A leitura deste trecho permanece neste dispositivo.');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [preferences.clickSpeak, preferences.sound]);

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

  function update(partial: Partial<AccessibilityPreferences>, message = 'Ajustes atualizados.') {
    commit(finalizeAccessibilityPreferences({ ...preferences, ...partial }), message);
  }

  function applyProfile(profile: AccessibilityProfile) {
    if (profile === 'calm') stopSpeech();
    commit(preferencesForProfile(profile), 'Perfil aplicado neste navegador.');
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
    }, () => {
      setSpeaking(false);
      setStatus('Este navegador bloqueou a voz. O texto continua nesta página.');
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

  const guide = preferences.guideBar === 'on' || preferences.guideMask === 'on';

  return <div className={inline ? styles.inline : styles.floating} data-a11y-chrome="" data-a11y-speak="off">
    {guide && <ReadingGuide bar={preferences.guideBar === 'on'} mask={preferences.guideMask === 'on'} />}
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
        <p className={styles.intro} id={descriptionId}>Estes ajustes valem em todo o Evolvia neste navegador. A voz fica no dispositivo. O Evolvia não envia texto, imagem nem áudio desta página para outro serviço.</p>
        <fieldset className={styles.group}>
          <legend>Perfis</legend>
          <div className={styles.choices}>
            {([
              ['low-vision', 'Baixa visão'],
              ['dyslexia', 'Dislexia'],
              ['reading', 'Leitura'],
              ['calm', 'Menos movimento'],
            ] as const).map(([value, label]) => (
              <button className={`${styles.choice} ${styles.profile}`} key={value} type="button" onClick={() => applyProfile(value)}>{label}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.group}>
          <legend>Tamanho do texto</legend>
          <div className={styles.choices}>
            {([
              ['85', 'Menor'],
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
          <div className={styles.checks}>
            <label className={styles.check}><input type="checkbox" checked={preferences.letters === 'wide'} onChange={(event) => update({ letters: event.target.checked ? 'wide' : 'default' })} /> Espaçamento das letras</label>
            <label className={styles.check}><input type="checkbox" checked={preferences.lines === 'wide'} onChange={(event) => update({ lines: event.target.checked ? 'wide' : 'default' })} /> Espaçamento das linhas</label>
          </div>
        </fieldset>
        <fieldset className={styles.group}>
          <legend>Cursor</legend>
          <div className={styles.choices}>
            {([
              ['default', 'Padrão'],
              ['large', 'Aumentar cursor'],
              ['bold', 'Aumentar e escurecer cursor'],
            ] as const).map(([value, label]) => (
              <label className={styles.choice} key={value}>
                <input type="radio" name="a11y-cursor" checked={preferences.cursor === value} onChange={() => update({ cursor: value })} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className={styles.checks}>
          <label className={styles.check}><input type="checkbox" checked={preferences.font === 'readable'} onChange={(event) => update({ font: event.target.checked ? 'readable' : 'default' })} /> Fonte mais legível</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.font === 'dyslexia'} onChange={(event) => update({ font: event.target.checked ? 'dyslexia' : 'default' })} /> Fonte para dislexia</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.contrast === 'high'} onChange={(event) => update({ contrast: event.target.checked ? 'high' : 'system' })} /> Contraste alto</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.colors === 'invert'} onChange={(event) => update({ colors: event.target.checked ? 'invert' : 'system' })} /> Inverter cores</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.links === 'on'} onChange={(event) => update({ links: event.target.checked ? 'on' : 'off' })} /> Destacar links</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.motion === 'reduce'} onChange={(event) => update({ motion: event.target.checked ? 'reduce' : 'system' })} /> Pausar animações</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.focus === 'strong'} onChange={(event) => update({ focus: event.target.checked ? 'strong' : 'default' })} /> Destacar foco</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.targets === 'large'} onChange={(event) => update({ targets: event.target.checked ? 'large' : 'default' })} /> Áreas de toque maiores</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.reading === 'on'} onChange={(event) => update({ reading: event.target.checked ? 'on' : 'off' })} /> Modo de leitura</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.guideBar === 'on'} onChange={(event) => update({ guideBar: event.target.checked ? 'on' : 'off' })} /> Barra de leitura</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.guideMask === 'on'} onChange={(event) => update({ guideMask: event.target.checked ? 'on' : 'off' })} /> Máscara de leitura</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.images === 'hide'} onChange={(event) => update({ images: event.target.checked ? 'hide' : 'show' })} /> Esconder imagens</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.sound === 'off'} onChange={(event) => update({ sound: event.target.checked ? 'off' : 'system' }, event.target.checked ? 'Som da página desativado.' : 'Som da página liberado.')} /> Desativar som</label>
          <label className={styles.check}><input type="checkbox" checked={preferences.clickSpeak === 'on'} onChange={(event) => update({ clickSpeak: event.target.checked ? 'on' : 'off' }, event.target.checked ? 'Clique num parágrafo ou título para ouvir neste dispositivo.' : 'Clique para ouvir desativado.')} /> Clique para ouvir</label>
        </div>
        <p className={styles.note}>Contraste alto deixa o texto preto sobre fundo branco e os botões em azul escuro. Inverter cores não altera QR, código de barras nem este painel. Esconder imagens também os preserva, e a impressão desfaz esses dois ajustes.</p>
        <p className={styles.note}>O modo de leitura aumenta a medida do texto. A fonte para dislexia aumenta o espaço entre as letras com uma fonte simples deste aparelho. Desativar som pausa áudio e vídeo da página e interrompe a voz. Conteúdo de outro site embutido pode continuar tocando.</p>
        <fieldset className={styles.group}>
          <legend>Leitura em voz alta</legend>
          <p className={styles.note}>A voz é a deste dispositivo. Nenhum texto é enviado a um serviço de voz ou de inteligência artificial.</p>
          {speechSupport === 'missing' && <p className={styles.note}>A leitura em voz alta não está disponível neste navegador.</p>}
          {speechSupport === 'ready' && <button className={styles.speech} type="button" aria-pressed={speaking} onClick={toggleSpeech}>{speaking ? 'Parar leitura' : 'Ler esta página'}</button>}
        </fieldset>
        <p className={styles.status} role="status" aria-live="polite">{status}</p>
        <button className={styles.reset} type="button" onClick={restore}>Restaurar padrão</button>
      </div>
    </>, document.body)}
  </div>;
}

function ReadingGuide({ bar, mask }: { bar: boolean; mask: boolean }) {
  const [point, setPoint] = useState<number | null>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => setPoint(event.clientY);
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);
  if (point == null || typeof document === 'undefined') return null;
  const bands = readingMaskBands(point, window.innerHeight);
  return createPortal(<div data-a11y-chrome="" data-a11y-speak="off" aria-hidden="true">
    {mask && bands.topHeight > 0 && <div className={styles.mask} style={{ height: bands.topHeight }} />}
    {mask && <div className={styles.mask} style={{ top: bands.lowerTop, bottom: 0 }} />}
    {bar && <div className={styles.bar} style={{ top: point }} />}
  </div>, document.body);
}
