import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const DEFAULT_PUBLICATION_PRIMARY_COLOR = '#0B64E5';
export const DEFAULT_PUBLICATION_ACCENT_COLOR = '#22365E';

const THEME_ALLOWED_KEYS = new Set([
  'preset',
  'fontScale',
  'contentWidth',
  'primaryColor',
  'accentColor',
]);
const THEME_PRESETS = new Set(['DEFAULT', 'HIGH_CONTRAST']);
const THEME_FONT_SCALES = new Set(['DEFAULT', 'LARGE']);
const THEME_CONTENT_WIDTHS = new Set(['STANDARD', 'WIDE']);
const THEME_CONFIG_MAX_BYTES = 512;
const HEX_COLOR = /^#[0-9A-F]{6}$/;

export type EventPublicationTheme = {
  preset: 'DEFAULT' | 'HIGH_CONTRAST';
  fontScale: 'DEFAULT' | 'LARGE';
  contentWidth: 'STANDARD' | 'WIDE';
  primaryColor: string;
  accentColor: string;
};

export type PublicEventPublicationTheme = EventPublicationTheme & {
  onPrimaryColor: '#000000' | '#FFFFFF';
  onAccentColor: '#000000' | '#FFFFFF';
};

function normalizeHexColor(value: unknown, label: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${label} deve ser uma cor hexadecimal.`);
  }
  const normalized = value.trim().toUpperCase();
  if (!HEX_COLOR.test(normalized)) {
    throw new BadRequestException(`${label} deve usar o formato #RRGGBB.`);
  }
  return normalized;
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number {
  const normalized = color.toUpperCase();
  if (!HEX_COLOR.test(normalized)) return 0;
  const red = channelToLinear(Number.parseInt(normalized.slice(1, 3), 16));
  const green = channelToLinear(Number.parseInt(normalized.slice(3, 5), 16));
  const blue = channelToLinear(Number.parseInt(normalized.slice(5, 7), 16));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

export function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

export function readableTextColor(background: string): '#000000' | '#FFFFFF' {
  const whiteRatio = contrastRatio('#FFFFFF', background);
  return whiteRatio >= 4.5 ? '#FFFFFF' : '#000000';
}

export function normalizeEventPublicationTheme(
  value: Record<string, unknown> | null,
): Prisma.JsonValue | null {
  if (value === null) return null;

  for (const key of Object.keys(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || !THEME_ALLOWED_KEYS.has(key)) {
      throw new BadRequestException('A configuração visual contém uma opção não permitida.');
    }
  }

  const preset = value.preset ?? 'DEFAULT';
  const fontScale = value.fontScale ?? 'DEFAULT';
  const contentWidth = value.contentWidth ?? 'STANDARD';

  if (typeof preset !== 'string' || !THEME_PRESETS.has(preset)) {
    throw new BadRequestException('Preset visual inválido.');
  }
  if (typeof fontScale !== 'string' || !THEME_FONT_SCALES.has(fontScale)) {
    throw new BadRequestException('Escala de fonte inválida.');
  }
  if (typeof contentWidth !== 'string' || !THEME_CONTENT_WIDTHS.has(contentWidth)) {
    throw new BadRequestException('Largura de conteúdo inválida.');
  }

  const normalized: EventPublicationTheme = {
    preset: preset as EventPublicationTheme['preset'],
    fontScale: fontScale as EventPublicationTheme['fontScale'],
    contentWidth: contentWidth as EventPublicationTheme['contentWidth'],
    primaryColor: normalizeHexColor(
      value.primaryColor,
      'A cor principal',
      DEFAULT_PUBLICATION_PRIMARY_COLOR,
    ),
    accentColor: normalizeHexColor(
      value.accentColor,
      'A cor de destaque',
      DEFAULT_PUBLICATION_ACCENT_COLOR,
    ),
  };

  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > THEME_CONFIG_MAX_BYTES) {
    throw new BadRequestException('A configuração visual excede o limite permitido.');
  }
  return normalized as unknown as Prisma.JsonValue;
}

export function projectPublicEventPublicationTheme(
  value: Prisma.JsonValue | null,
): PublicEventPublicationTheme | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  try {
    const normalized = normalizeEventPublicationTheme(value as Record<string, unknown>);
    if (!normalized || Array.isArray(normalized) || typeof normalized !== 'object') return null;
    const theme = normalized as EventPublicationTheme;
    return {
      ...theme,
      onPrimaryColor: readableTextColor(theme.primaryColor),
      onAccentColor: readableTextColor(theme.accentColor),
    };
  } catch {
    return null;
  }
}
