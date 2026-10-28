'use client';

import { type CSSProperties } from 'react';
import PrintSurface from './print-surface';
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
  const lines = Array.isArray(label.lines) ? label.lines : [];
  const hasBarcode = Boolean(label.barcode);
  const barcodeHeight = Math.min(7, Math.max(4, label.heightMm * .18));
  const availableHeight = label.heightMm - 3 - (hasBarcode ? barcodeHeight + 1 : 0);
  const rows = 1 + (label.name ? 1 : 0) + (label.company ? 1 : 0) + lines.length + (label.category ? 1 : 0) + (hasBarcode ? 1 : 0);
  const textHeight = 2.64 + (label.name ? 8.82 : 0) + (label.company ? 3.52 : 0) + lines.length * 2.64 + (label.category ? 3.66 : 0) + (hasBarcode ? 2.42 : 0) + Math.max(0, rows - 1) * .6;
  const scale = Math.min(1, Math.max(.45, availableHeight / textHeight));
  const qrSize = Math.max(0, Math.min(24, label.widthMm * .28, availableHeight));
  const dimensions = {
    width: `${label.widthMm}mm`, height: `${label.heightMm}mm`,
    '--label-scale': scale,
    '--label-qr-size': `${qrSize}mm`,
    '--label-barcode-height': `${barcodeHeight}mm`,
  } as CSSProperties;
  const sheet = <section
    className={preview ? styles.preview : styles.sheet}
    style={dimensions}
    data-qr={Boolean(label.qr)}
    data-barcode={hasBarcode}
    aria-label={preview ? 'Prévia da etiqueta' : 'Etiqueta para impressão'}
  >
    <div className={styles.copy}>
      <p className={styles.event}>{label.eventName}</p>
      {label.name && <h2>{label.name}</h2>}
      {label.company && <p className={styles.company}>{label.company}</p>}
      {lines.map((line, index) => <p key={`${index}-${line}`} className={styles.line}>{line}</p>)}
      {label.category && <p className={styles.category}>{label.category}</p>}
      {label.barcode && <p className={styles.code} data-a11y-speak="off">Código {label.protocol}</p>}
    </div>
    {label.qr && <div className={styles.codes} data-a11y-speak="off"><CredentialQr code={label.qr} compact /></div>}
    {label.barcode && <div className={styles.barcode} data-a11y-speak="off"><CredentialBarcode value={label.barcode} /></div>}
  </section>;
  return preview ? sheet : <PrintSurface widthMm={label.widthMm} heightMm={label.heightMm}>{sheet}</PrintSurface>;
}


