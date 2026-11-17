'use client';

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

  return <div className={styles.field}>
    <span className={styles.label} id={`${id}-label`}>
      {label}
      {required && <strong aria-hidden="true"> *</strong>}
      {optional && <em className={styles.optional}> opcional</em>}
    </span>
    <small id={helpId} className={styles.help}>{help}</small>
    <div
      id={id}
      className={styles.editor}
      style={{ minHeight: `${Math.max(rows, 4) * 28}px` }}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${helpId}${error ? ` ${errorId}` : ''} ${previewId}`}
      aria-invalid={Boolean(error)}
    >
      <PublicationCkEditor
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        maxLength={maxLength}
        disabled={disabled}
      />
    </div>
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
