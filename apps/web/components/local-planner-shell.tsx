import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./local-planner-shell.module.css";

type LocalPlannerShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function LocalPlannerShell({
  eyebrow,
  title,
  description,
  children,
  backHref = "/ajuda",
  backLabel = "Voltar para a Central de Ajuda",
}: LocalPlannerShellProps) {
  return (
    <main className={styles.main}>
      <div className={styles.shell}>
        <Link className={styles.backLink} href={backHref}>
          <span aria-hidden="true">←</span>
          {backLabel}
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.description}>{description}</p>
          <p className={styles.privacyNotice} role="note">
            Suas respostas ficam somente neste dispositivo enquanto esta página
            estiver aberta. Nada é enviado, salvo ou compartilhado pelo Evolvia.
          </p>
        </header>

        <section className={styles.content} aria-label={`Planejamento: ${title}`}>
          {children}
        </section>
      </div>
    </main>
  );
}
