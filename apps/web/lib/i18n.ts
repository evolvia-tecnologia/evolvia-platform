export const DEFAULT_LOCALE = 'pt-BR' as const;

export const SUPPORTED_LOCALES = [
  'pt-BR',
  'en-US',
  'es-419',
  'pt-PT',
  'en-GB',
  'es-ES',
  'fr-FR',
  'it-IT',
  'de-DE',
  'ru-RU',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_METADATA: Readonly<Record<SupportedLocale, {
  label: string;
  direction: 'ltr' | 'rtl';
}>> = {
  'pt-BR': { label: 'Português (Brasil)', direction: 'ltr' },
  'en-US': { label: 'English (United States)', direction: 'ltr' },
  'es-419': { label: 'Español (Latinoamérica)', direction: 'ltr' },
  'pt-PT': { label: 'Português (Portugal)', direction: 'ltr' },
  'en-GB': { label: 'English (United Kingdom)', direction: 'ltr' },
  'es-ES': { label: 'Español (España)', direction: 'ltr' },
  'fr-FR': { label: 'Français', direction: 'ltr' },
  'it-IT': { label: 'Italiano', direction: 'ltr' },
  'de-DE': { label: 'Deutsch', direction: 'ltr' },
  'ru-RU': { label: 'Русский', direction: 'ltr' },
};

// Um locale só pode migrar de SUPPORTED_LOCALES para ENABLED_LOCALES depois
// que toda a superfície liberada possuir catálogo revisado e aprovado.
export const ENABLED_LOCALES = [DEFAULT_LOCALE] as const satisfies readonly SupportedLocale[];

export type EnabledLocale = (typeof ENABLED_LOCALES)[number];
export type MessageCatalog<Key extends string = string> = Readonly<
  Record<Key, Partial<Record<SupportedLocale, string>>>
>;

export type LocaleResolutionInput = {
  accountLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
};

function canonicalizeLocale(value: string): string | null {
  const candidate = value.trim().replaceAll('_', '-');
  if (!candidate || candidate.length > 35) return null;

  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

function findEnabledLocale(value?: string | null): EnabledLocale | null {
  if (!value) return null;
  const canonical = canonicalizeLocale(value);
  if (!canonical) return null;

  return ENABLED_LOCALES.find((locale) => locale === canonical) ?? null;
}

type WeightedLocale = { locale: string; quality: number; order: number };

function parseAcceptLanguage(value?: string | null): WeightedLocale[] {
  if (!value || value.length > 1024) return [];

  return value
    .split(',')
    .slice(0, 20)
    .map((item, order) => {
      const [rawLocale = '', ...parameters] = item.trim().split(';');
      const locale = rawLocale === '*' ? '*' : canonicalizeLocale(rawLocale);
      if (!locale) return null;

      let quality = 1;
      const qualityParameter = parameters.find((parameter) => /^\s*q=/iu.test(parameter));
      if (qualityParameter) {
        const rawQuality = qualityParameter.split('=')[1]?.trim() ?? '';
        if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u.test(rawQuality)) return null;
        quality = Number(rawQuality);
      }

      if (quality <= 0) return null;
      return { locale, quality, order };
    })
    .filter((item): item is WeightedLocale => item !== null)
    .sort((left, right) => right.quality - left.quality || left.order - right.order);
}

function resolveHeaderLocale(value?: string | null): EnabledLocale | null {
  for (const preference of parseAcceptLanguage(value)) {
    if (preference.locale === '*') return DEFAULT_LOCALE;

    const exact = findEnabledLocale(preference.locale);
    if (exact) return exact;

    const language = preference.locale.split('-')[0]?.toLowerCase();
    const compatible = ENABLED_LOCALES.find(
      (locale) => locale.split('-')[0]?.toLowerCase() === language,
    );
    if (compatible) return compatible;
  }

  return null;
}

export function negotiateLocale(input: LocaleResolutionInput = {}): EnabledLocale {
  return findEnabledLocale(input.accountLocale)
    ?? findEnabledLocale(input.cookieLocale)
    ?? resolveHeaderLocale(input.acceptLanguage)
    ?? DEFAULT_LOCALE;
}

export function resolveLocale(value?: string | null): EnabledLocale {
  return findEnabledLocale(value) ?? DEFAULT_LOCALE;
}

export function missingCatalogKeys<Key extends string>(
  catalog: MessageCatalog<Key>,
  locale: SupportedLocale,
): Key[] {
  return (Object.keys(catalog) as Key[]).filter((key) => {
    const value = catalog[key][locale];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

export function assertCatalogComplete<Key extends string>(
  catalog: MessageCatalog<Key>,
  locale: SupportedLocale,
): void {
  const missing = missingCatalogKeys(catalog, locale);
  if (missing.length > 0) {
    throw new Error(`Catálogo ${locale} incompleto: ${missing.join(', ')}`);
  }
}

function interpolate(template: string, parameters: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, (token, name: string) => {
    const value = parameters[name];
    return value === undefined ? token : String(value);
  });
}

export function message<Key extends string>(
  catalog: MessageCatalog<Key>,
  key: Key,
  requestedLocale?: string | null,
  parameters: Readonly<Record<string, string | number>> = {},
): string {
  const locale = resolveLocale(requestedLocale);
  const localized = catalog[key]?.[locale];
  const fallback = catalog[key]?.[DEFAULT_LOCALE];
  const template = localized || fallback;

  if (!template) return `[${key}]`;
  return interpolate(template, parameters);
}
