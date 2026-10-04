'use client';

import { useEffect } from 'react';
import CredentialBarcode from './credential-barcode';
import CredentialQr from './credential-qr';
import styles from './credential-label.module.css';

export type CredentialLabelData = {
  eventName: string;
  name: string | null;
  company: string | null;
  lines: string[];
  category: string | null;
  protocol: string;
  qr: string | null;
  barcode: string | null;
  widthMm: number;
  heightMm: number;
};

export default function CredentialLabel({ label, preview = false }: { label: CredentialLabelData; preview?: boolean }) {
  useEffect(() => {
    if (preview) return;
    const style = document.createElement('style');
    style.setAttribute('data-credential-label', 'true');
    style.textContent = `@page { size: ${label.widthMm}mm ${label.heightMm}mm; margin: 0; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [label.widthMm, label.heightMm, preview]);

  return <section
    className={preview ? styles.preview : styles.sheet}
    style={{ width: `${label.widthMm}mm`, height: `${label.heightMm}mm` }}
    aria-label={preview ? 'Prévia da etiqueta' : 'Etiqueta para impressão'}
  >
    <div className={styles.copy}>
      <p className={styles.event}>{label.eventName}</p>
      {label.name && <h2>{label.name}</h2>}
      {label.company && <p className={styles.company}>{label.company}</p>}
      {label.lines.map((line) => <p key={line} className={styles.line}>{line}</p>)}
      {label.category && <p className={styles.category}>{label.category}</p>}
      {label.barcode && <p className={styles.code}>Código {label.protocol}</p>}
    </div>
    {(label.qr || label.barcode) && <div className={styles.codes}>
      {label.qr && <CredentialQr code={label.qr} compact />}
      {label.barcode && <div className={styles.barcode}><CredentialBarcode value={label.barcode} /></div>}
    </div>}
  </section>;
}
