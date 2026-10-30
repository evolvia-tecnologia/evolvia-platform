'use client';

import { type CSSProperties } from 'react';
import PrintSurface from './print-surface';
import CredentialBarcode from './credential-barcode';
import CredentialQr from './credential-qr';
import styles from './credential-label.module.css';

export type CredentialLabelData = {
  eventName: string;
  orderedContent?: Array<{ code: string; kind: 'text' | 'qr'; value: string; style?: { align: 'left' | 'center' | 'right'; bold: boolean; color: string; fontFamily?: 'sans' | 'serif' | 'mono'; fontSizeMm?: number } }>;
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

const SAFE_FONTS = { sans: 'Arial, Helvetica, sans-serif', serif: 'Georgia, Times New Roman, serif', mono: 'Courier New, monospace' } as const;

/**
 * Shared physical fit estimate for preview, printing and the desk print guard.
 * A label that cannot fit legibly must not be auto-printed or silently cropped.
 */
export function credentialLabelLayout(label: CredentialLabelData) {
  const lines = Array.isArray(label.lines) ? label.lines : [];
  const ordered = Array.isArray(label.orderedContent) ? label.orderedContent : null;
  const firstTextIndex = ordered?.findIndex((item) => item.kind === 'text') ?? -1;
  const hasBarcode = Boolean(label.barcode) && !ordered;
  const hasOrderedQr = Boolean(ordered?.some((item) => item.kind === 'qr')) && Boolean(label.qr);
  const barcodeHeight = Math.min(7, Math.max(4, label.heightMm * .18));
  const availableHeight = label.heightMm - 3 - (hasBarcode ? barcodeHeight + 1 : 0);
  const rows = ordered ? 1 + ordered.length : 1 + (label.name ? 1 : 0) + (label.company ? 1 : 0) + lines.length + (label.category ? 1 : 0) + (hasBarcode ? 1 : 0);
  const textWidthMm = Math.max(6, label.widthMm - 3);
  const approxLines = (value: string, emphasis = false) =>
    Math.max(1, Math.ceil(value.length / Math.max(5, Math.floor(textWidthMm / (emphasis ? 2.2 : 1.35)))));
  const orderedTextHeight = ordered?.reduce((height, item, index) => {
    const fontMm = item.style?.fontSizeMm ?? (index === firstTextIndex ? 4.2 : 2.4);
    const charsPerLine = Math.max(4, Math.floor(textWidthMm / (fontMm * .55)));
    return height + (item.kind === 'qr' ? 16 : Math.max(1, Math.ceil(item.value.length / charsPerLine)) * fontMm * 1.15) + .6;
  }, 0) ?? 0;
  const textHeight = ordered
    ? orderedTextHeight
    : 2.64 + (label.name ? approxLines(label.name, true) * 4.5 : 0)
      + (label.company ? approxLines(label.company) * 3.5 : 0)
      + lines.reduce((height, line) => height + approxLines(line) * 2.7, 0)
      + (label.category ? approxLines(label.category) * 3.5 : 0)
      + (hasBarcode ? 2.42 : 0) + Math.max(0, rows - 1) * .6;
  const estimatedFitRatio = availableHeight / Math.max(1, textHeight);
  const scale = Math.min(1, Math.max(.24, estimatedFitRatio));
  const qrSize = Math.max(0, Math.min(24, label.widthMm * .28, availableHeight));
  const orderedQrSize = Math.max(0, Math.min(16, label.widthMm * .26, availableHeight * .48));
  // Below 40% the smallest text becomes too small to print reliably.
  const fitWarning = estimatedFitRatio < .4 || (hasOrderedQr && orderedQrSize < 12)
    || (!ordered && Boolean(label.qr) && qrSize < 12);
  return { ordered, firstTextIndex, hasBarcode, scale, qrSize, orderedQrSize, barcodeHeight, fitWarning };
}

export default function CredentialLabel({ label, preview = false }: { label: CredentialLabelData; preview?: boolean }) {
  const lines = Array.isArray(label.lines) ? label.lines : [];
  const { ordered, firstTextIndex, hasBarcode, scale, qrSize, orderedQrSize, barcodeHeight, fitWarning } = credentialLabelLayout(label);
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
    data-fit-warning={fitWarning}
    aria-label={preview ? 'Prévia da etiqueta' : 'Etiqueta para impressão'}
  >
    <div className={styles.copy}>
      {!ordered && <p className={styles.event}>{label.eventName}</p>}
      {ordered
        ? ordered.map((item, index) => item.kind === 'qr'
          ? (label.qr ? <div className={styles.orderedQr} key={`${index}-qr`} style={item.style?.align ? { justifySelf: item.style.align === 'center' ? 'center' : item.style.align === 'right' ? 'end' : 'start' } : undefined}><CredentialQr code={label.qr} compact /></div> : null)
          : <p key={`${index}-${item.code}`} className={index === firstTextIndex ? styles.orderedFirst : styles.line}
              style={item.style ? { textAlign: item.style.align, fontWeight: item.style.bold ? 700 : 400, color: item.style.color,
                fontFamily: item.style.fontFamily ? SAFE_FONTS[item.style.fontFamily] : undefined,
                fontSize: item.style.fontSizeMm ? `${(item.style.fontSizeMm * scale).toFixed(2)}mm` : undefined } : undefined}>{item.value}</p>)
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
  return preview ? <>
    {fitWarning && <p role="alert">Atenção: o conteúdo ou o QR pode não caber com legibilidade nesta dimensão. Aumente a etiqueta ou reduza campos e tamanho da fonte.</p>}
    {sheet}
  </> : <PrintSurface widthMm={label.widthMm} heightMm={label.heightMm}>{sheet}</PrintSurface>;
}


