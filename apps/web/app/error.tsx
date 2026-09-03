'use client';

import styles from './system-feedback.module.css';

function isAppRouterNotFound(error: Error & { digest?: string }): boolean {
  const digest = error.digest ?? '';
  return digest === 'NEXT_HTTP_ERROR_FALLBACK;404' || digest === 'NEXT_NOT_FOUND';
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (isAppRouterNotFound(error)) {
    throw error;
  }

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
