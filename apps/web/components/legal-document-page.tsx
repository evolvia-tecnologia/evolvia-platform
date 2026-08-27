import Link from 'next/link';
import type { LegalDocument } from '../lib/legal-documents';
import styles from './legal-document-page.module.css';

type LegalDocumentPageProps = {
  document: LegalDocument;
};

export default function LegalDocumentPage({ document }: LegalDocumentPageProps) {
  return <>
    <a className="skip-link" href="#legal-content">Pular para o conteúdo principal</a>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Evolvia — página inicial">EVOLVIA</Link>
      <nav className={styles.nav} aria-label="Documentos jurídicos">
        <Link href="/termos-de-uso">Termos de Uso</Link>
        <Link href="/privacidade">Privacidade</Link>
      </nav>
    </header>

    <main className={styles.main} id="legal-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>CENTRAL JURÍDICA E DE PRIVACIDADE</p>
        <h1>{document.title}</h1>
        <p className={styles.lead}>{document.description}</p>

        <div className={styles.reviewNotice} role="status">
          <strong>Minuta técnica para homologação — não vigente.</strong>
          <span>
            Este conteúdo organiza os pontos que ainda dependem de dados empresariais, inventário de tratamento e aprovação jurídica. Ele não registra aceite nem substitui a versão final aprovada.
          </span>
        </div>

        <dl className={styles.metadata}>
          <div><dt>Status</dt><dd>Revisão responsável necessária</dd></div>
          <div><dt>Versão</dt><dd>{document.version}</dd></div>
          <div><dt>Vigência</dt><dd>Não iniciada</dd></div>
          <div><dt>Idioma</dt><dd>Português do Brasil (pt-BR)</dd></div>
        </dl>

        <section aria-labelledby="review-items-title">
          <h2 id="review-items-title">Pontos para validação antes da vigência</h2>
          <div className={styles.sections}>
            {document.sections.map((section) => <section className={styles.sectionCard} key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.reviewQuestion}</p>
            </section>)}
          </div>
        </section>

        <section className={styles.references} aria-labelledby="references-title">
          <h2 id="references-title">Referências oficiais para a revisão</h2>
          <ul>
            {document.references.map((reference) => <li key={reference.url}>
              <a href={reference.url} rel="noreferrer">{reference.label}</a>
            </li>)}
          </ul>
        </section>

        <p className={styles.finalNote}>
          A primeira versão vigente deverá informar quem responde pela Evolvia, quando entra em vigor e como o histórico de versões pode ser consultado.
        </p>
      </article>
    </main>
  </>;
}
