'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import PublicRichText from './public-rich-text';
import styles from './publication-rich-text-field.module.css';

const PublicationCkEditor = dynamic(() => import('./publication-ckeditor'), { ssr: false });

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
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const previewId = `${id}-preview`;
  const labelId = `${id}-label`;
  const [bootError, setBootError] = useState('');
  const describedBy = `${helpId}${error || bootError ? ` ${errorId}` : ''} ${previewId}`.trim();
  const shownError = error || bootError;

  return <div className={styles.field}>
    <span className={styles.label} id={labelId}>
      {label}
      {required && <strong aria-hidden="true"> *</strong>}
      {optional && <em className={styles.optional}> opcional</em>}
    </span>
    <small id={helpId} className={styles.help}>{help}</small>
    <div
      id={id}
      className={styles.editor}
      style={{ minHeight: `${Math.max(rows, 4) * 28}px` }}
    >
      {bootError ? (
        <textarea
          className={styles.input}
          value={value}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          rows={rows}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={Boolean(shownError)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onBlur?.(event.target.value)}
          onFocus={onFocus}
        />
      ) : (
        <PublicationCkEditor
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          onBootError={setBootError}
          maxLength={maxLength}
          disabled={disabled}
          labelledBy={labelId}
          describedBy={describedBy}
          invalid={Boolean(shownError)}
          required={required}
        />
      )}
    </div>
    <span className={styles.counter}>{value.length}/{maxLength}</span>
    {shownError && <small id={errorId} className={styles.error} role="alert">{shownError}</small>}
    <div className={styles.preview} id={previewId} aria-label="Prévia da formatação">
      <p className={styles.previewTitle}>Assim aparece na página</p>
      {value.trim()
        ? <PublicRichText text={value} className={styles.previewBody} />
        : <p className={styles.note}>A formatação aparece aqui conforme você escreve.</p>}
    </div>
  </div>;
}
