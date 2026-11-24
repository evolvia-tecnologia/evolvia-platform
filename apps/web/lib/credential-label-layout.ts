/**
 * Motor compartilhado de layout físico da etiqueta (prévia = posto = totem = impressão).
 *
 * "Reduzir para caber" está SEMPRE ativo: a escala tipográfica desce até
 * MIN_LEGIBLE_SCALE. Abaixo disso, fitWarning bloqueia impressão — nunca
 * usamos overflow hidden para esconder conteúdo.
 */

export type CredentialLabelFieldStyle = {
  align: 'left' | 'center' | 'right';
  bold: boolean;
  color: string;
  fontFamily?: 'sans' | 'serif' | 'mono';
  fontSizeMm?: number;
};

export type CredentialLabelData = {
  eventName: string;
  orderedContent?: Array<{
    code: string;
    kind: 'text' | 'qr' | 'barcode';
    value: string;
    style?: CredentialLabelFieldStyle;
  }>;
  name: string | null;
  company: string | null;
  lines: string[];
  category: string | null;
  protocol: string;
  codeMode?: 'QR' | 'BARCODE' | 'BOTH';
  qr: string | null;
  barcode: string | null;
  widthMm: number;
  heightMm: number;
};

/** Presets oficiais — espelho de apps/api/src/event-desk-policy.ts LABEL_PRESETS. */
export const LABEL_SIZE_PRESETS = [
  { preset: '4x2', label: '4×2 cm', widthMm: 40, heightMm: 20 },
  { preset: '6x3', label: '6×3 cm', widthMm: 60, heightMm: 30 },
  { preset: '8x3', label: '8×3 cm', widthMm: 80, heightMm: 30 },
  { preset: '9x4', label: '9×4 cm', widthMm: 90, heightMm: 40 },
  { preset: '10x5', label: '10×5 cm', widthMm: 100, heightMm: 50 },
] as const;

/** Margem interna + gap mínimo entre texto e códigos (mm). */
export const LABEL_PAD_MM = 3;
/** Zona de silêncio lateral ao redor do conjunto de códigos (mm). */
export const LABEL_QUIET_MM = 1.5;
/** Escala mínima ainda considerada legível em impressora térmica. */
export const MIN_LEGIBLE_SCALE = 0.65;
/** Piso absoluto da escala visual (prévia); impressão já foi bloqueada antes. */
export const MIN_PREVIEW_SCALE = 0.24;
/** QR abaixo deste tamanho (mm) não é legível o bastante para liberar impressão. */
export const MIN_QR_MM = 12;

export type CredentialLabelLayout = ReturnType<typeof credentialLabelLayout>;

export function credentialLabelLayout(label: CredentialLabelData) {
  const lines = Array.isArray(label.lines) ? label.lines : [];
  const ordered = Array.isArray(label.orderedContent) ? label.orderedContent : null;
  const emptyOrdered = Boolean(ordered && ordered.length === 0);
  const firstTextIndex = ordered?.findIndex((item) => item.kind === 'text') ?? -1;
  const wantsOrderedQr = Boolean(ordered?.some((item) => item.kind === 'qr'));
  const wantsOrderedBarcode = Boolean(ordered?.some((item) => item.kind === 'barcode'));
  const hasOrderedQr = wantsOrderedQr && Boolean(label.qr);
  const hasOrderedBarcode = wantsOrderedBarcode && Boolean(label.barcode);
  const missingOrderedBarcode = wantsOrderedBarcode && !label.barcode;
  const missingOrderedQr = wantsOrderedQr && !label.qr;
  const missingLegacyQr = !ordered && (label.codeMode === 'QR' || label.codeMode === 'BOTH') && !label.qr;
  const missingLegacyBarcode = !ordered && (label.codeMode === 'BARCODE' || label.codeMode === 'BOTH') && !label.barcode;

  const legacyQr = !ordered && Boolean(label.qr);
  const legacyBarcode = !ordered && Boolean(label.barcode);
  const showQr = hasOrderedQr || legacyQr;
  const showBarcode = hasOrderedBarcode || legacyBarcode;
  const bothCodes = showQr && showBarcode;
  const codesMode = bothCodes ? 'both' : showQr ? 'qr' : showBarcode ? 'barcode' : 'none';
  const sideQr = showQr && !showBarcode;
  const bottomCodes = bothCodes || (showBarcode && !showQr);

  const barcodeHeight = Math.min(5.5, Math.max(3.2, label.heightMm * 0.12));
  const availableHeight = label.heightMm - LABEL_PAD_MM - (bottomCodes
    ? (bothCodes
      ? Math.max(Math.min(14, label.widthMm * 0.28, label.heightMm * 0.42), barcodeHeight) + 1.5
      : barcodeHeight + 1)
    : 0);

  const qrSize = !showQr
    ? 0
    : bothCodes
      ? Math.max(0, Math.min(14, label.widthMm * 0.28, availableHeight))
      : Math.max(0, Math.min(24, label.widthMm * 0.36, availableHeight));
  const orderedQrSize = hasOrderedQr
    ? Math.max(0, Math.min(bothCodes ? 14 : 16, label.widthMm * (bothCodes ? 0.28 : 0.34), availableHeight))
    : 0;

  const barcodeWidthMm = !showBarcode
    ? 0
    : Math.max(
      18,
      bothCodes
        ? label.widthMm - LABEL_PAD_MM - LABEL_QUIET_MM * 2 - (ordered ? orderedQrSize : qrSize) - 2
        : label.widthMm - LABEL_PAD_MM - LABEL_QUIET_MM * 2,
    );

  const textWidthMm = Math.max(6, label.widthMm - LABEL_PAD_MM - (sideQr ? (ordered ? orderedQrSize : qrSize) + 1 : 0));
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
  const textBudget = label.heightMm - LABEL_PAD_MM - (bottomCodes ? codesRowHeight + 1 : 0);
  const estimatedFitRatio = textOnlyHeight > 0
    ? Math.max(0, textBudget) / textOnlyHeight
    : (bottomCodes ? codesRowHeight : (ordered ? orderedQrSize : qrSize)) <= label.heightMm - LABEL_PAD_MM ? 1 : 0;

  // Reduzir para caber: sempre aplica escala; impressão só se >= MIN_LEGIBLE_SCALE.
  const reduceToFit = true;
  const scale = reduceToFit
    ? Math.min(1, Math.max(MIN_PREVIEW_SCALE, estimatedFitRatio))
    : 1;

  const fitQrSize = ordered ? orderedQrSize : qrSize;
  const fitWarning = emptyOrdered || missingOrderedQr || missingOrderedBarcode || missingLegacyQr || missingLegacyBarcode
    || estimatedFitRatio < MIN_LEGIBLE_SCALE
    || (showQr && fitQrSize < MIN_QR_MM);

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
    reduceToFit,
    scale,
    qrSize,
    orderedQrSize,
    barcodeHeight,
    barcodeWidthMm,
    codesRowHeight,
    estimatedFitRatio,
    fitWarning,
  };
}
