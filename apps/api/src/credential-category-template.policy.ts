import { DeskPolicyError, labelFieldAllowed } from './event-desk-policy';

/**
 * Models are stored in eventCapability.config.categoryLabelTemplates, not in
 * registration fields or a global printer setting. Every lookup is by category ID.
 */
export type CategoryLabelTemplate = { categoryId: string; fields: string[] };
export type CategoryBadgeItem = { code: string; kind: 'text' | 'qr'; value: string };
const DEFAULT_FIELDS = ['preferred_name', 'institution', 'city_state', 'qr'] as const;
const MAX_FIELDS = 12;
const SAFE_ID = /^[a-zA-Z0-9_-]{8,64}$/u;
const VIRTUAL_FIELDS = new Set(['city_state', 'institution', 'preferred_name', 'job_title']);

export function defaultCategoryLabelFields(): string[] { return [...DEFAULT_FIELDS]; }

function availableCode(code: string, available: ReadonlyArray<string>): boolean {
  return code === 'qr' || (labelFieldAllowed(code)
    && (available.includes(code) || VIRTUAL_FIELDS.has(code)));
}

export function normalizeCategoryLabelFields(raw: unknown, available: ReadonlyArray<string>): string[] {
  if (!Array.isArray(raw) || raw.length > MAX_FIELDS || raw.some((code) =>
    typeof code !== 'string' || !availableCode(code, available))) {
    throw new DeskPolicyError('Escolha somente campos permitidos da ficha de inscrição (até 12).');
  }
  if (new Set(raw).size !== raw.length) throw new DeskPolicyError('Não repita campos na mesma etiqueta.');
  return [...raw] as string[];
}

function configObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
}

export function categoryLabelTemplates(config: unknown): CategoryLabelTemplate[] {
  const raw = configObject(config).categoryLabelTemplates;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): CategoryLabelTemplate[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.categoryId !== 'string' || !SAFE_ID.test(record.categoryId)
      || !Array.isArray(record.fields) || record.fields.some((field) =>
        typeof field !== 'string' || (field !== 'qr' && !labelFieldAllowed(field)))) return [];
    return [{ categoryId: record.categoryId, fields: record.fields }];
  });
}

export function labelTemplateForCategory(config: unknown, categoryId: string): string[] {
  return categoryLabelTemplates(config).find((item) => item.categoryId === categoryId)?.fields
    ?? defaultCategoryLabelFields();
}

export function updateCategoryLabelTemplate(config: unknown, categoryId: string, fields: string[]): Record<string, unknown> {
  const current = configObject(config);
  const templates = categoryLabelTemplates(config).filter((item) => item.categoryId !== categoryId);
  if (templates.length >= 100) throw new DeskPolicyError('O evento excedeu o limite de categorias com etiquetas configuradas.');
  return { ...current, categoryLabelTemplates: [...templates, { categoryId, fields }] };
}

export function categoryBadgeItems(
  registrationData: unknown, fields: ReadonlyArray<string>,
): CategoryBadgeItem[] {
  const data = configObject(registrationData);
  const value = (code: string): string => {
    if (code === 'city_state') {
      const combined = data.city_state;
      if (typeof combined === 'string' && combined.trim()) return combined.trim().slice(0, 80);
      return [data.city, data.state].filter((item) => typeof item === 'string' && item.trim())
        .map((item) => String(item).trim()).join(' / ').slice(0, 80);
    }
    const raw = data[code];
    if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 80);
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw).slice(0, 80);
    if (code === 'preferred_name' && typeof data.full_name === 'string') {
      return data.full_name.trim().slice(0, 80);
    }
    if (code === 'institution' && typeof data.company === 'string') {
      return data.company.trim().slice(0, 80);
    }
    return '';
  };
  return fields.flatMap((code): CategoryBadgeItem[] => {
    if (code === 'qr') return [{ code, kind: 'qr', value: '' }];
    if (!labelFieldAllowed(code)) return [];
    const result = value(code);
    return result ? [{ code, kind: 'text', value: result }] : [];
  });
}
