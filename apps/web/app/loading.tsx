import styles from './system-feedback.module.css';

export default function Loading() {
  return (
    <div className={styles.feedback} role="status" aria-live="polite">
      <div>
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.status}>Carregando…</p>
      </div>
    </div>
  );
}
