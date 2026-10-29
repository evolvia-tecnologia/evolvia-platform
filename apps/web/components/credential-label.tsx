'use client';

import { type CSSProperties } from 'react';
import PrintSurface from './print-surface';
import CredentialBarcode from './credential-barcode';
import CredentialQr from './credential-qr';
import styles from './credential-label.module.css';

export type CredentialLabelData = {
  eventName: string;
  orderedContent?: Array<{ code: string; kind: 'text' | 'qr'; value: string; style?: { align: 'left' | 'center' | 'right'; bold: boolean; color: string } }>;
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
  const ordered = Array.isArray(label.orderedContent) ? label.orderedContent : null;
  const firstTextIndex = ordered?.findIndex((item) => item.kind === 'text') ?? -1;
  const hasBarcode = Boolean(label.barcode) && !ordered;
  const hasOrderedQr = Boolean(ordered?.some((item) => item.kind === 'qr')) && Boolean(label.qr);
  const barcodeHeight = Math.min(7, Math.max(4, label.heightMm * .18));
  const availableHeight = label.heightMm - 3 - (hasBarcode ? barcodeHeight + 1 : 0);
  const rows = ordered ? 1 + ordered.length : 1 + (label.name ? 1 : 0) + (label.company ? 1 : 0) + lines.length + (label.category ? 1 : 0) + (hasBarcode ? 1 : 0);
  const textHeight = ordered ? 2.64 + ordered.length * 4.2 + (hasOrderedQr ? 12 : 0) : 2.64 + (label.name ? 8.82 : 0) + (label.company ? 3.52 : 0) + lines.length * 2.64 + (label.category ? 3.66 : 0) + (hasBarcode ? 2.42 : 0) + Math.max(0, rows - 1) * .6;
  const scale = Math.min(1, Math.max(.45, availableHeight / textHeight));
  const qrSize = Math.max(0, Math.min(24, label.widthMm * .28, availableHeight));
  const orderedQrSize = Math.max(0, Math.min(16, label.widthMm * .26, availableHeight * .48));
  const dimensions = {
    width: `${label.widthMm}mm`, height: `${label.heightMm}mm`,
    '--label-scale': scale,
    '--label-qr-size': `${qrSize}mm`,
    '--ordered-qr-size': `${orderedQrSize}mm`,
    '--label-barcode-height': `${barcodeHeight}mm`,
  } as CSSProperties;
  const sheet = <section
    className={preview ? styles.preview : styles.sheet}
    style={dimensions}
    data-qr={Boolean(label.qr) && !ordered}
    data-barcode={hasBarcode}
    aria-label={preview ? 'Prévia da etiqueta' : 'Etiqueta para impressão'}
  >
    <div className={styles.copy}>
      <p className={styles.event}>{label.eventName}</p>
      {ordered
        ? ordered.map((item, index) => item.kind === 'qr'
          ? (label.qr ? <div className={styles.orderedQr} key={`${index}-qr`} style={item.style?.align ? { justifySelf: item.style.align === 'center' ? 'center' : item.style.align === 'right' ? 'end' : 'start' } : undefined}><CredentialQr code={label.qr} compact /></div> : null)
          : <p key={`${index}-${item.code}`} className={index === firstTextIndex ? styles.orderedFirst : styles.line}
              style={item.style ? { textAlign: item.style.align, fontWeight: item.style.bold ? 700 : 400, color: item.style.color } : undefined}>{item.value}</p>)
        : [
          label.name && <h2 key="name">{label.name}</h2>,
          label.company && <p key="company" className={styles.company}>{label.company}</p>,
          ...lines.map((line, index) => <p key={`${index}-${line}`} className={styles.line}>{line}</p>),
          label.category && <p key="category" className={styles.category}>{label.category}</p>,
          label.barcode && <p key="barcode" className={styles.code}>Código {label.protocol}</p>,
        ]}
    </div>
    {label.qr && !ordered && <div className={styles.codes}><CredentialQr code={label.qr} compact /></div>}
    {label.barcode && !ordered && <div className={styles.barcode}><CredentialBarcode value={label.barcode} /></div>}
  </section>;
  return preview ? sheet : <PrintSurface widthMm={label.widthMm} heightMm={label.heightMm}>{sheet}</PrintSurface>;
}


