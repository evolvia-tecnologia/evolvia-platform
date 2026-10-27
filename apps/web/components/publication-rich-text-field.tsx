'use client';

import { useRef } from 'react';
import PublicRichText from './public-rich-text';
import styles from './publication-rich-text-field.module.css';

import { applyFormat, type FormatMode } from '../lib/publication-rich-text-format';

export default function PublicationRichTextField({
  id,
  label,
  help,
  value,
  onChange,
  onBlur,
  maxLength,
  rows = 8,
  disabled = false,
  required = false,
  error,
  optional = false,
  onFocus,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  maxLength: number;
  rows?: number;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  optional?: boolean;
  onFocus?: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const previewId = `${id}-preview`;

  function format(mode: FormatMode) {
    const field = inputRef.current;
    if (!field || disabled) return;
    const result = applyFormat(value, field.selectionStart, field.selectionEnd, mode);
    if (!result || result.next.length > maxLength) return;
    onChange(result.next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(result.from, result.to);
    });
  }

  return <div className={styles.field}>
    <span className={styles.label} id={`${id}-label`}>
      {label}
      {required && <strong aria-hidden="true"> *</strong>}
      {optional && <em className={styles.optional}> opcional</em>}
    </span>
    <small id={helpId} className={styles.help}>{help}</small>
    <div className={styles.toolbar} role="toolbar" aria-label={`Formatação de ${label}`} aria-controls={id}>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('heading')}>Título</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('bold')}>Negrito</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('italic')}>Itálico</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('list')}>Lista</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('link')}>Link</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('alignLeft')}>Esquerda</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('alignCenter')}>Centro</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('alignRight')}>Direita</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('font:sans')}>Sans</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('font:serif')}>Serif</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('size:14')}>P</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('size:16')}>M</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('size:20')}>G</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('color:navy')}>Azul marinho</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('color:blue')}>Azul</button>
      <button type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => format('color:muted')}>Cinza</button>
    </div>
    <textarea
      ref={inputRef}
      id={id}
      className={styles.input}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => onFocus?.()}
      onBlur={(event) => onBlur?.(event.currentTarget.value)}
      maxLength={maxLength}
      rows={rows}
      disabled={disabled}
      required={required}
      aria-labelledby={`${id}-label`}
      aria-invalid={Boolean(error)}
      aria-describedby={`${helpId}${error ? ` ${errorId}` : ''} ${previewId}`}
    />
    <span className={styles.counter}>{value.length}/{maxLength}</span>
    {error && <small id={errorId} className={styles.error}>{error}</small>}
    <div className={styles.preview} id={previewId} aria-label="Prévia da formatação">
      <p className={styles.previewTitle}>Assim aparece na página</p>
      {value.trim()
        ? <PublicRichText text={value} className={styles.previewBody} />
        : <p className={styles.note}>A formatação aparece aqui conforme você escreve.</p>}
    </div>
  </div>;
}
