'use client';

import styles from './system-feedback.module.css';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.feedback} role="alert">
      <div>
        <div className={styles.errorIcon} aria-hidden="true">!</div>
        <h1 className={styles.heading}>Algo deu errado</h1>
        <p className={styles.message}>
          Ocorreu um erro inesperado. Nenhum dado pessoal foi exposto.
          Tente novamente ou volte à página inicial.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.retry} onClick={reset}>
            Tentar novamente
          </button>
          <a href="/" className={styles.home}>
            Página inicial
          </a>
        </div>
      </div>
    </div>
  );
}
