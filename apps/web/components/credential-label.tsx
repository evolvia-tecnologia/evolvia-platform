'use client';

import { type CSSProperties, type ReactNode } from 'react';
import PrintSurface from './print-surface';
import CredentialBarcode from './credential-barcode';
import CredentialQr from './credential-qr';
import {
  credentialLabelLayout,
  type CredentialLabelData,
} from '../lib/credential-label-layout';
import styles from './credential-label.module.css';

export type { CredentialLabelData } from '../lib/credential-label-layout';
export { credentialLabelLayout } from '../lib/credential-label-layout';

const SAFE_FONTS = { sans: 'Arial, Helvetica, sans-serif', serif: 'Georgia, Times New Roman, serif', mono: 'Courier New, monospace' } as const;

export default function CredentialLabel({ label, preview = false }: { label: CredentialLabelData; preview?: boolean }) {
  const lines = Array.isArray(label.lines) ? label.lines : [];
  const layout = credentialLabelLayout(label);
  const {
    ordered, emptyOrdered, firstTextIndex, codesMode, sideQr, bottomCodes, bothCodes,
    missingOrderedQr, missingOrderedBarcode, missingLegacyQr, missingLegacyBarcode,
    scale, qrSize, orderedQrSize, barcodeHeight, barcodeWidthMm, fitWarning,
  } = layout;

  const dimensions = {
    width: `${label.widthMm}mm`,
    height: `${label.heightMm}mm`,
    '--label-scale': scale,
    '--label-qr-size': `${qrSize}mm`,
    '--ordered-qr-size': `${orderedQrSize || qrSize}mm`,
    '--label-barcode-height': `${barcodeHeight}mm`,
    '--label-barcode-width': `${barcodeWidthMm}mm`,
  } as CSSProperties;

  let orderedText: ReactNode[] = [];
  let orderedQrAlign: 'left' | 'center' | 'right' | undefined;
  if (ordered) {
    ordered.forEach((item, index) => {
      if (item.kind === 'qr') {
        if (item.style?.align) orderedQrAlign = item.style.align;
        return;
      }
      if (item.kind === 'barcode') return;
      orderedText.push(<p
        key={`${index}-${item.code}`}
        className={index === firstTextIndex ? styles.orderedFirst : styles.line}
        style={item.style ? {
          textAlign: item.style.align,
          fontWeight: item.style.bold ? 700 : 400,
          color: item.style.color,
          fontFamily: item.style.fontFamily ? SAFE_FONTS[item.style.fontFamily] : undefined,
          fontSize: item.style.fontSizeMm ? `${(item.style.fontSizeMm * scale).toFixed(2)}mm` : undefined,
        } : undefined}
      >{item.value}</p>);
    });
  }

  const qrJustify = orderedQrAlign === 'left' ? 'start' : orderedQrAlign === 'right' ? 'end' : 'center';
  const qrAlignStyle = orderedQrAlign
    ? { justifySelf: qrJustify as 'start' | 'end' | 'center' }
    : undefined;

  const qrNode = label.qr ? (
    <div className={sideQr && ordered ? styles.orderedQr : styles.codes} style={qrAlignStyle}>
      <CredentialQr code={label.qr} compact />
    </div>
  ) : null;

  const barcodeNode = label.barcode && !layout.invalidBarcode ? (
    <div className={styles.barcode}><CredentialBarcode value={label.barcode} /></div>
  ) : null;

  const bottomRow = bottomCodes ? (
    <div className={styles.codesRow} data-codes={codesMode}>
      {bothCodes ? <>{qrNode}{barcodeNode}</> : barcodeNode}
    </div>
  ) : null;

  const sheet = <section
    className={preview ? styles.preview : styles.sheet}
    style={dimensions}
    data-codes={codesMode}
    data-qr={sideQr}
    data-barcode={bottomCodes}
    data-fit-warning={fitWarning}
    data-reduce-to-fit={layout.reduceToFit}
    aria-label={preview ? 'Prévia da etiqueta' : 'Etiqueta para impressão'}
  >
    <div className={styles.copy}>
      {!ordered && <p className={styles.event}>{label.eventName}</p>}
      {ordered
        ? orderedText
        : [
          label.name && <h2 key="name">{label.name}</h2>,
          label.company && <p key="company" className={styles.company}>{label.company}</p>,
          ...lines.map((line, index) => <p key={`${index}-${line}`} className={styles.line}>{line}</p>),
          label.category && <p key="category" className={styles.category}>{label.category}</p>,
        ]}
      {ordered && sideQr ? qrNode : null}
    </div>
    {!ordered && sideQr ? qrNode : null}
    {bottomRow}
  </section>;

  return preview ? <>
    {fitWarning && <p role="alert">{emptyOrdered
      ? 'A etiqueta está sem campos preenchidos. Adicione um campo ou QR antes de imprimir.'
      : layout.invalidBarcode ? 'Código de barras inválido. Atualize a credencial antes de imprimir.'
      : missingOrderedQr
      ? 'O código QR da credencial não está disponível. Não imprima esta etiqueta; tente novamente após atualizar a inscrição.'
      : missingOrderedBarcode ? 'O código de barras da categoria não está disponível. Não imprima esta etiqueta; tente novamente após atualizar a inscrição.'
      : missingLegacyQr ? 'O código QR exigido na configuração não está disponível. Não imprima esta etiqueta; tente novamente após atualizar a inscrição.'
      : missingLegacyBarcode ? 'O código de barras exigido na configuração não está disponível. Não imprima esta etiqueta; tente novamente após atualizar a inscrição.'
      : 'Atenção: mesmo com “Reduzir para caber”, o conteúdo não fica legível nesta dimensão. Aumente a etiqueta ou reduza campos e tamanho da fonte.'}</p>}
    {sheet}
  </> : fitWarning ? null : <PrintSurface widthMm={label.widthMm} heightMm={label.heightMm}>{sheet}</PrintSurface>;
}
