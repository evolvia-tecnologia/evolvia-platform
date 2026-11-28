/**
 * Motor compartilhado de layout físico da etiqueta (prévia = posto = totem = impressão).
 *
 * Mede altura total com a geometria real do CSS (padding, gaps, line-height, pads
 * da categoria) + área dos códigos Evolvia (QR e Code128). Não usa largura média
 * por caractere: a tipografia passa por `label-text-metrics` (avanço por glifo).
 *
 * "Reduzir para caber" está SEMPRE ativo: a escala tipográfica desce até
 * MIN_LEGIBLE_SCALE. Abaixo disso, fitWarning bloqueia impressão — nunca
 * overflow:hidden para esconder conteúdo.
 */

import { code128Modules } from './code128';
import { measureTextBlockHeightMm, type LabelFontFamily, type MeasureOpts } from './label-text-metrics';

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

/** Espelha `credential-label.module.css` — padding do sheet/preview. */
export const LABEL_PAD_MM = 1.5;
/** Gap da grade entre cópia e faixa de códigos. */
export const LABEL_SHEET_GAP_MM = 1;
/** Gap entre blocos de texto (escala com --label-scale). */
export const LABEL_COPY_GAP_MM = 0.6;
/** Gap horizontal QR ↔ barras na faixa. */
export const LABEL_CODES_GAP_MM = 2;
/** Padding horizontal da faixa de códigos (zona de silêncio). */
export const LABEL_CODES_PAD_X_MM = 1.5;
/** Escala mínima ainda considerada legível em impressora térmica. */
export const MIN_LEGIBLE_SCALE = 0.65;
/** Piso absoluto da escala visual (prévia); impressão já foi bloqueada antes. */
export const MIN_PREVIEW_SCALE = 0.24;
/** QR abaixo deste tamanho (mm) não é legível o bastante para liberar impressão. */
export const MIN_QR_MM = 12;
/**
 * Largura mínima de módulo Code128 (mm) para leitura óptica térmica.
 * O SVG Evolvia usa `preserveAspectRatio="xMidYMid meet"` — esticar destrói a leitura.
 */
export const MIN_BARCODE_MODULE_MM = 0.25;

type TypoStyle = {
  fontMm: number;
  lineHeight: number;
  bold?: boolean;
  uppercase?: boolean;
  letterSpacingEm?: number;
  padYMm?: number;
  padXMm?: number;
};

/** Tipografia do CSS da etiqueta (valores em mm / unitless). */
const TYPO = {
  event: { fontMm: 2.2, lineHeight: 1.2, uppercase: true, letterSpacingEm: 0.04 } satisfies TypoStyle,
  name: { fontMm: 4.2, lineHeight: 1.05, bold: true, uppercase: true } satisfies TypoStyle,
  company: { fontMm: 3.2, lineHeight: 1.1, bold: true, uppercase: true } satisfies TypoStyle,
  line: { fontMm: 2.4, lineHeight: 1.1 } satisfies TypoStyle,
  category: {
    fontMm: 2.6, lineHeight: 1.1, bold: true, uppercase: true, letterSpacingEm: 0.04,
    padYMm: 0.4, padXMm: 1.4,
  } satisfies TypoStyle,
  orderedFirst: { fontMm: 4.2, lineHeight: 1.05, bold: true } satisfies TypoStyle,
} as const;

export type CredentialLabelLayout = ReturnType<typeof credentialLabelLayout>;

function barcodeModuleUnits(value: string): number | null {
  try {
    return [...code128Modules(value)].reduce((sum, digit) => sum + Number(digit), 0);
  } catch {
    return null;
  }
}

function measureBlock(
  text: string,
  maxWidthMm: number,
  typo: TypoStyle,
  scale: number,
  overrides?: { fontFamily?: LabelFontFamily; fontSizeMm?: number; bold?: boolean },
) {
  const fontSizeMm = overrides?.fontSizeMm ?? typo.fontMm;
  const opts: MeasureOpts = {
    fontFamily: overrides?.fontFamily ?? 'sans',
    bold: overrides?.bold ?? typo.bold,
    uppercase: typo.uppercase,
    letterSpacingEm: typo.letterSpacingEm,
  };
  const padX = (typo.padXMm ?? 0) * scale;
  return measureTextBlockHeightMm({
    text,
    maxWidthMm: Math.max(0, maxWidthMm - padX * 2),
    fontSizeMm,
    lineHeight: typo.lineHeight,
    scale,
    padYMm: typo.padYMm,
    opts,
  });
}

function measureCopyHeightMm(input: {
  label: CredentialLabelData;
  ordered: NonNullable<CredentialLabelData['orderedContent']> | null;
  firstTextIndex: number;
  textWidthMm: number;
  scale: number;
}): number {
  const { label, ordered, firstTextIndex, textWidthMm, scale } = input;
  const gap = LABEL_COPY_GAP_MM * scale;
  const blocks: number[] = [];

  if (ordered) {
    ordered.forEach((item, index) => {
      if (item.kind !== 'text') return;
      const isFirst = index === firstTextIndex;
      const typo: TypoStyle = isFirst
        ? { ...TYPO.orderedFirst, fontMm: item.style?.fontSizeMm ?? TYPO.orderedFirst.fontMm }
        : {
          fontMm: item.style?.fontSizeMm ?? TYPO.line.fontMm,
          lineHeight: TYPO.line.lineHeight,
          bold: item.style?.bold,
        };
      blocks.push(measureBlock(item.value, textWidthMm, typo, scale, {
        fontFamily: item.style?.fontFamily,
        fontSizeMm: item.style?.fontSizeMm,
        bold: item.style?.bold,
      }).heightMm);
    });
  } else {
    if (label.eventName) blocks.push(measureBlock(label.eventName, textWidthMm, TYPO.event, scale).heightMm);
    if (label.name) blocks.push(measureBlock(label.name, textWidthMm, TYPO.name, scale).heightMm);
    if (label.company) blocks.push(measureBlock(label.company, textWidthMm, TYPO.company, scale).heightMm);
    for (const line of Array.isArray(label.lines) ? label.lines : []) {
      blocks.push(measureBlock(line, textWidthMm, TYPO.line, scale).heightMm);
    }
    if (label.category) blocks.push(measureBlock(label.category, textWidthMm, TYPO.category, scale).heightMm);
  }

  if (!blocks.length) return 0;
  return blocks.reduce((sum, height) => sum + height, 0) + Math.max(0, blocks.length - 1) * gap;
}

function resolveCodesGeometry(input: {
  label: CredentialLabelData;
  bothCodes: boolean;
  showQr: boolean;
  showBarcode: boolean;
  bottomCodes: boolean;
  sideQr: boolean;
  ordered: boolean;
}) {
  const { label, bothCodes, showQr, showBarcode, bottomCodes, sideQr, ordered } = input;
  const innerWidth = Math.max(0, label.widthMm - LABEL_PAD_MM * 2);
  const codesInnerWidth = Math.max(0, innerWidth - LABEL_CODES_PAD_X_MM * 2);

  const barcodeHeight = !showBarcode
    ? 0
    : Math.min(5.5, Math.max(3.2, label.heightMm * 0.12));

  // Altura útil para o QR quando compartilha a faixa inferior com barras.
  const codesBudget = Math.max(0, label.heightMm - LABEL_PAD_MM * 2 - LABEL_SHEET_GAP_MM);
  const qrCap = bothCodes
    ? Math.min(14, label.widthMm * 0.28, Math.max(barcodeHeight, codesBudget * 0.55))
    : Math.min(sideQr ? 24 : 16, label.widthMm * (sideQr ? 0.36 : 0.34), codesBudget);

  const qrSize = showQr ? Math.max(0, qrCap) : 0;
  const orderedQrSize = showQr && ordered
    ? Math.max(0, Math.min(bothCodes ? 14 : 16, label.widthMm * (bothCodes ? 0.28 : 0.34), codesBudget))
    : (showQr ? qrSize : 0);
  const fitQrSize = ordered ? orderedQrSize : qrSize;

  const modules = showBarcode && label.barcode ? barcodeModuleUnits(label.barcode) : null;
  const opticalBarcodeWidth = modules != null ? modules * MIN_BARCODE_MODULE_MM : 0;

  let barcodeWidthMm = 0;
  if (showBarcode) {
    const qrReserve = bothCodes ? fitQrSize + LABEL_CODES_GAP_MM : 0;
    const available = Math.max(0, codesInnerWidth - qrReserve);
    // Largura alocada = o que a faixa oferece; leitura exige ≥ opticalBarcodeWidth.
    barcodeWidthMm = Math.max(0, available);
  }

  const codesRowHeight = bottomCodes
    ? Math.max(bothCodes ? fitQrSize : 0, barcodeHeight) + (bothCodes || showBarcode ? 0.5 : 0)
    : 0;

  const barcodeFitsOptically = !showBarcode
    || (modules != null && barcodeWidthMm + 1e-6 >= opticalBarcodeWidth);

  return {
    qrSize,
    orderedQrSize,
    fitQrSize,
    barcodeHeight,
    barcodeWidthMm,
    codesRowHeight,
    opticalBarcodeWidth,
    barcodeFitsOptically,
    invalidBarcode: showBarcode && modules == null,
    codesInnerWidth,
  };
}

function totalHeightAtScale(input: {
  label: CredentialLabelData;
  ordered: NonNullable<CredentialLabelData['orderedContent']> | null;
  firstTextIndex: number;
  sideQr: boolean;
  bottomCodes: boolean;
  fitQrSize: number;
  codesRowHeight: number;
  scale: number;
}): number {
  const { label, sideQr, bottomCodes, fitQrSize, codesRowHeight, scale } = input;
  const textWidthMm = Math.max(
    6,
    label.widthMm - LABEL_PAD_MM * 2 - (sideQr ? fitQrSize + LABEL_SHEET_GAP_MM : 0),
  );
  const copyHeight = measureCopyHeightMm({
    label,
    ordered: input.ordered,
    firstTextIndex: input.firstTextIndex,
    textWidthMm,
    scale,
  });

  if (sideQr && !bottomCodes) {
    // Grade de duas colunas: a altura é o máximo entre cópia e QR + pads.
    return LABEL_PAD_MM * 2 + Math.max(copyHeight, fitQrSize);
  }

  if (bottomCodes) {
    return LABEL_PAD_MM * 2 + LABEL_SHEET_GAP_MM + copyHeight + codesRowHeight;
  }

  return LABEL_PAD_MM * 2 + copyHeight;
}

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

  const codes = resolveCodesGeometry({
    label,
    bothCodes,
    showQr,
    showBarcode,
    bottomCodes,
    sideQr,
    ordered: Boolean(ordered),
  });

  const reduceToFit = true;
  const heightAt = (scale: number) => totalHeightAtScale({
    label: { ...label, lines },
    ordered,
    firstTextIndex,
    sideQr,
    bottomCodes,
    fitQrSize: codes.fitQrSize,
    codesRowHeight: codes.codesRowHeight,
    scale,
  });

  // Busca a maior escala em que a altura total (textos + gaps + códigos) cabe.
  let scale = 1;
  if (heightAt(1) > label.heightMm + 1e-6) {
    let low = MIN_PREVIEW_SCALE;
    let high = 1;
    for (let i = 0; i < 18; i += 1) {
      const mid = (low + high) / 2;
      if (heightAt(mid) <= label.heightMm + 1e-6) low = mid;
      else high = mid;
    }
    scale = low;
  }
  scale = Math.min(1, Math.max(MIN_PREVIEW_SCALE, scale));

  const measuredHeight = heightAt(scale);
  const fitRatio = measuredHeight > 0 ? Math.min(1, label.heightMm / measuredHeight) : 1;
  const fitWarning = emptyOrdered || missingOrderedQr || missingOrderedBarcode || missingLegacyQr || missingLegacyBarcode
    || scale < MIN_LEGIBLE_SCALE
    || measuredHeight > label.heightMm + 0.05
    || (showQr && codes.fitQrSize < MIN_QR_MM)
    || !codes.barcodeFitsOptically;

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
    qrSize: codes.qrSize,
    orderedQrSize: codes.orderedQrSize,
    barcodeHeight: codes.barcodeHeight,
    barcodeWidthMm: codes.barcodeWidthMm,
    codesRowHeight: codes.codesRowHeight,
    invalidBarcode: codes.invalidBarcode,
    measuredHeightMm: measuredHeight,
    estimatedFitRatio: fitRatio,
    fitWarning,
  };
}
