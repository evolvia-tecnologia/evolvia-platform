'use client';

import { type CSSProperties, type ReactNode } from 'react';
import PrintSurface from './print-surface';
import CredentialBarcode from './credential-barcode';
import CredentialQr from './credential-qr';
import styles from './credential-label.module.css';

export type CredentialLabelData = {
  eventName: string;
  orderedContent?: Array<{ code: string; kind: 'text' | 'qr' | 'barcode'; value: string; style?: { align: 'left' | 'center' | 'right'; bold: boolean; color: string; fontFamily?: 'sans' | 'serif' | 'mono'; fontSizeMm?: number } }>;
  name: string | null;
  company: string | null;
  lines: string[];
  category: string | null;
  protocol: string;
  // Explicit mode from the desk API: required legacy codes must never print blank.
  codeMode?: 'QR' | 'BARCODE' | 'BOTH';
  qr: string | null;
  barcode: string | null;
  widthMm: number;
  heightMm: number;
};

const SAFE_FONTS = { sans: 'Arial, Helvetica, sans-serif', serif: 'Georgia, Times New Roman, serif', mono: 'Courier New, monospace' } as const;

/** Margem interna + gap mínimo entre texto e códigos (mm). */
const PAD_MM = 3;
/** Zona de silêncio lateral ao redor do conjunto de códigos (mm). */
const QUIET_MM = 1.5;

/**
 * Shared physical fit estimate for preview, printing and the desk print guard.
 * A label that cannot fit legibly must not be auto-printed or silently cropped.
 *
 * Ciclo 02: quando QR e barras estão juntos, ficam lado a lado na faixa inferior
 * (sem esticar o Code128). QR sozinho permanece na coluna lateral legada.
 */
export function credentialLabelLayout(label: CredentialLabelData) {
  const lines = Array.isArray(label.lines) ? label.lines : [];
  const ordered = Array.isArray(label.orderedContent) ? label.orderedContent : null;
  // A categoria pode ficar sem conteúdo após remover campos ou receber dados vazios.
  // Nunca imprimir uma credencial totalmente em branco nesse caso.
  const emptyOrdered = Boolean(ordered && ordered.length === 0);
  const firstTextIndex = ordered?.findIndex((item) => item.kind === 'text') ?? -1;
  const wantsOrderedQr = Boolean(ordered?.some((item) => item.kind === 'qr'));
  const wantsOrderedBarcode = Boolean(ordered?.some((item) => item.kind === 'barcode'));
  const hasOrderedQr = wantsOrderedQr && Boolean(label.qr);
  const hasOrderedBarcode = wantsOrderedBarcode && Boolean(label.barcode);
  const missingOrderedBarcode = wantsOrderedBarcode && !label.barcode;
  const missingOrderedQr = wantsOrderedQr && !label.qr;
  // Category templates can intentionally omit codes. Legacy labels cannot omit a code
  // that the organizer explicitly enabled, even when an incomplete API response does.
  const missingLegacyQr = !ordered && (label.codeMode === 'QR' || label.codeMode === 'BOTH') && !label.qr;
  const missingLegacyBarcode = !ordered && (label.codeMode === 'BARCODE' || label.codeMode === 'BOTH') && !label.barcode;

  const legacyQr = !ordered && Boolean(label.qr);
  const legacyBarcode = !ordered && Boolean(label.barcode);
  const showQr = hasOrderedQr || legacyQr;
  const showBarcode = hasOrderedBarcode || legacyBarcode;
  const bothCodes = showQr && showBarcode;
  const codesMode = bothCodes ? 'both' : showQr ? 'qr' : showBarcode ? 'barcode' : 'none';
  // QR sozinho (legado ou ordenado): coluna lateral. Ambos / só barras: faixa inferior.
  const sideQr = showQr && !showBarcode;
  const bottomCodes = bothCodes || (showBarcode && !showQr);

  const barcodeHeight = Math.min(5.5, Math.max(3.2, label.heightMm * 0.12));
  const availableHeight = label.heightMm - PAD_MM - (bottomCodes
    ? (bothCodes
      ? Math.max(Math.min(14, label.widthMm * 0.28, label.heightMm * 0.42), barcodeHeight) + 1.5
      : barcodeHeight + 1)
    : 0);

  const qrSize = !showQr
    ? 0
    : bothCodes
      ? Math.max(0, Math.min(14, label.widthMm * 0.28, availableHeight))
      : Math.max(0, Math.min(24, label.widthMm * 0.36, availableHeight));
  const orderedQrSize = hasOrderedQr ? Math.max(0, Math.min(bothCodes ? 14 : 16, label.widthMm * (bothCodes ? 0.28 : 0.34), availableHeight)) : 0;

  const barcodeWidthMm = !showBarcode
    ? 0
    : Math.max(
      18,
      bothCodes
        ? label.widthMm - PAD_MM - QUIET_MM * 2 - (ordered ? orderedQrSize : qrSize) - 2
        : label.widthMm - PAD_MM - QUIET_MM * 2,
    );

  // Legacy QR occupies a separate grid column; subtract its real width before
  // estimating text wrapping, or long names can be clipped on narrow paper.
  const textWidthMm = Math.max(6, label.widthMm - PAD_MM - (sideQr ? (ordered ? orderedQrSize : qrSize) + 1 : 0));
  const approxLines = (value: string, emphasis = false) =>
    Math.max(1, Math.ceil(value.length / Math.max(5, Math.floor(textWidthMm / (emphasis ? 2.2 : 1.35)))));
  const orderedTextOnlyHeight = ordered?.reduce((height, item, index) => {
    if (item.kind === 'qr' || item.kind === 'barcode') return height;
    const fontMm = item.style?.fontSizeMm ?? (index === firstTextIndex ? 4.2 : 2.4);
    const charsPerLine = Math.max(4, Math.floor(textWidthMm / (fontMm * 0.55)));
    return height + Math.max(1, Math.ceil(item.value.length / charsPerLine)) * fontMm * 1.15 + 0.6;
  }, 0) ?? 0;

  const codesRowHeight = bottomCodes
    ? (bothCodes ? Math.max(ordered ? orderedQrSize : qrSize, barcodeHeight) : barcodeHeight) + 0.5
    : 0;
  const rows = ordered
    ? 1 + ordered.filter((item) => item.kind === 'text').length
    : 1 + (label.name ? 1 : 0) + (label.company ? 1 : 0) + lines.length + (label.category ? 1 : 0);
  const legacyTextOnlyHeight = 2.64 + (label.name ? approxLines(label.name, true) * 4.5 : 0)
    + (label.company ? approxLines(label.company) * 3.5 : 0)
    + lines.reduce((height, line) => height + approxLines(line) * 2.7, 0)
    + (label.category ? approxLines(label.category) * 3.5 : 0)
    + Math.max(0, rows - 1) * 0.6;
  const textOnlyHeight = ordered ? orderedTextOnlyHeight : legacyTextOnlyHeight;
  // Space left for text after reserving the bottom codes strip (if any).
  const textBudget = label.heightMm - PAD_MM - (bottomCodes ? codesRowHeight + 1 : 0);
  const estimatedFitRatio = textOnlyHeight > 0
    ? Math.max(0, textBudget) / textOnlyHeight
    : (bottomCodes ? codesRowHeight : (ordered ? orderedQrSize : qrSize)) <= label.heightMm - PAD_MM ? 1 : 0;
  const scale = Math.min(1, Math.max(0.24, estimatedFitRatio));

  // Conservative minimum for thermal legibility: never auto-print text shrunk to 45%.
  // Physical printer validation may tighten this threshold further.
  const fitQrSize = ordered ? orderedQrSize : qrSize;
  const fitWarning = emptyOrdered || missingOrderedQr || missingOrderedBarcode || missingLegacyQr || missingLegacyBarcode
    || estimatedFitRatio < 0.65
    || (showQr && fitQrSize < 12);

  return {
    ordered,
    emptyOrdered,
    firstTextIndex,
    hasBarcode: showBarcode,
    showQr,
    showBarcode,
    bothCodes,
    codesMode,
    sideQr,
    bottomCodes,
    missingOrderedQr,
    missingOrderedBarcode,
    missingLegacyQr,
    missingLegacyBarcode,
    scale,
    qrSize,
    orderedQrSize,
    barcodeHeight,
    barcodeWidthMm,
    codesRowHeight,
    fitWarning,
  };
}

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
    // Texto segue a ordem do modelo; códigos vão para a faixa/coluna compartilhada.
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

  const barcodeNode = label.barcode ? (
    <div className={styles.barcode}><CredentialBarcode value={label.barcode} /></div>
  ) : null;

  const bottomRow = bottomCodes ? (
    <div className={styles.codesRow} data-codes={codesMode}>
      {bothCodes ? [qrNode, barcodeNode] : barcodeNode}
    </div>
  ) : null;

  const sheet = <section
    className={preview ? styles.preview : styles.sheet}
    style={dimensions}
    data-codes={codesMode}
    data-qr={sideQr}
    data-barcode={bottomCodes}
    data-fit-warning={fitWarning}
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
      {/* Modelo ordenado só-QR: QR na própria coluna de conteúdo, alinhável. */}
      {ordered && sideQr ? qrNode : null}
    </div>
    {!ordered && sideQr ? <div className={styles.codes}><CredentialQr code={label.qr!} compact /></div> : null}
    {bottomRow}
  </section>;

  return preview ? <>
    {fitWarning && <p role="alert">{emptyOrdered
      ? 'A etiqueta está sem campos preenchidos. Adicione um campo ou QR antes de imprimir.'
      : missingOrderedQr
      ? 'O código QR da credencial não está disponível. Não imprima esta etiqueta; tente novamente após atualizar a inscrição.'
      : missingOrderedBarcode ? 'O código de barras da categoria não está disponível. Não imprima esta etiqueta; tente novamente após atualizar a inscrição.'
      : missingLegacyQr ? 'O código QR exigido na configuração não está disponível. Não imprima esta etiqueta; tente novamente após atualizar a inscrição.'
      : missingLegacyBarcode ? 'O código de barras exigido na configuração não está disponível. Não imprima esta etiqueta; tente novamente após atualizar a inscrição.'
      : 'Atenção: o conteúdo ou o QR pode não caber com legibilidade nesta dimensão. Aumente a etiqueta ou reduza campos e tamanho da fonte.'}</p>}
    {sheet}
  </> : fitWarning ? null : <PrintSurface widthMm={label.widthMm} heightMm={label.heightMm}>{sheet}</PrintSurface>;
}
