export const DEFAULT_LOCALE = 'pt-BR' as const;

// Somente idiomas com catálogo validado devem ser habilitados aqui.
// O contrato aceita expansão por BCP 47, mas não inventa traduções nem ativa
// idiomas parcialmente implementados.
export const ENABLED_LOCALES = [DEFAULT_LOCALE] as const;

export type EnabledLocale = (typeof ENABLED_LOCALES)[number];
export type MessageCatalog = Record<string, Partial<Record<string, string>>>;

function normalizeLocaleToken(value: string): string {
  return value.trim().replace('_', '-').toLowerCase();
}

export function resolveLocale(value?: string | null): EnabledLocale {
  if (!value) return DEFAULT_LOCALE;
  const requested = normalizeLocaleToken(value);
  const enabled = ENABLED_LOCALES.find((locale) => normalizeLocaleToken(locale) === requested);
  return enabled ?? DEFAULT_LOCALE;
}

export function message(
  catalog: MessageCatalog,
  key: string,
  requestedLocale?: string | null,
): string {
  const locale = resolveLocale(requestedLocale);
  const localized = catalog[key]?.[locale];
  const fallback = catalog[key]?.[DEFAULT_LOCALE];

  if (localized) return localized;
  if (fallback) return fallback;

  // Chave ausente fica visível em desenvolvimento/QA, em vez de retornar
  // uma tradução silenciosamente incorreta.
  return `[${key}]`;
}
