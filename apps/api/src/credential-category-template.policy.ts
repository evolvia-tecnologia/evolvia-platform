import { DeskPolicyError, deskDisplayName, labelFieldAllowed } from './event-desk-policy';

/**
 * Models are stored in eventCapability.config.categoryLabelTemplates, not in
 * registration fields or a global printer setting. Every lookup is by category ID.
 */
export type LabelFieldStyle = { align: 'left' | 'center' | 'right'; bold: boolean; color: string; fontFamily?: 'sans' | 'serif' | 'mono'; fontSizeMm?: number };
export type CategoryLabelTemplate = { categoryId: string; fields: string[]; styles?: Record<string, LabelFieldStyle> };
export type CategoryBadgeItem = { code: string; kind: 'text' | 'qr' | 'barcode'; value: string; style?: LabelFieldStyle };
const DEFAULT_FIELDS = ['preferred_name', 'institution', 'city_state', 'qr'] as const;
const MAX_FIELDS = 12;
const SAFE_ID = /^[a-zA-Z0-9_-]{8,64}$/u;
const VIRTUAL_FIELDS = new Set(['city_state', 'institution', 'preferred_name', 'job_title']);

export function defaultCategoryLabelFields(): string[] { return [...DEFAULT_FIELDS]; }
// Etiquetas são impressas em papel branco: manter contraste >= 4,5:1 para texto.
const COLORS = new Set(['#111827', '#1d4ed8', '#065f46', '#9a3412', '#7c2d12', '#6b21a8', '#be123c']);
const FONT_SIZES_MM = new Set([2, 2.5, 3, 3.5, 4, 4.5, 5, 6]);
export function normalizeLabelFieldStyles(raw: unknown, fields: ReadonlyArray<string>): Record<string, LabelFieldStyle> {
  if (raw === undefined || raw === null) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DeskPolicyError('Formatação da etiqueta inválida.');
  const result: Record<string, LabelFieldStyle> = {};
  for (const [code, value] of Object.entries(raw)) {
    if (code === '__proto__' || !fields.includes(code) || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new DeskPolicyError('A formatação precisa corresponder a um campo da etiqueta.');
    }
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some((key) => !['align', 'bold', 'color', 'fontFamily', 'fontSizeMm'].includes(key))
      || typeof row.align !== 'string' || !['left', 'center', 'right'].includes(row.align)
      || typeof row.bold !== 'boolean' || typeof row.color !== 'string'
      || !COLORS.has(row.color.toLowerCase())
      || (row.fontFamily !== undefined && (typeof row.fontFamily !== 'string' || !['sans', 'serif', 'mono'].includes(row.fontFamily)))
      || (row.fontSizeMm !== undefined && (typeof row.fontSizeMm !== 'number' || !FONT_SIZES_MM.has(row.fontSizeMm)))) {
      throw new DeskPolicyError('Alinhamento, negrito ou cor não permitidos.');
    }
    result[code] = {
      align: row.align as LabelFieldStyle['align'], bold: row.bold, color: row.color.toLowerCase(),
      ...(row.fontFamily !== undefined ? { fontFamily: row.fontFamily as LabelFieldStyle['fontFamily'] } : {}),
      ...(row.fontSizeMm !== undefined ? { fontSizeMm: row.fontSizeMm as number } : {}),
    };
  }
  return result;
}


function availableCode(code: string, available: ReadonlyArray<string>): boolean {
  return code === 'qr' || code === 'barcode' || (labelFieldAllowed(code)
    && (available.includes(code) || VIRTUAL_FIELDS.has(code)));
}

export function normalizeCategoryLabelFields(raw: unknown, available: ReadonlyArray<string>): string[] {
  if (!Array.isArray(raw) || raw.length > MAX_FIELDS || raw.some((code) =>
    typeof code !== 'string' || code === '__proto__' || !availableCode(code, available))) {
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
  const valid = raw.flatMap((item): CategoryLabelTemplate[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.categoryId !== 'string' || !SAFE_ID.test(record.categoryId)
      || !Array.isArray(record.fields) || record.fields.length > MAX_FIELDS
      || new Set(record.fields).size !== record.fields.length
      || record.fields.some((field) =>
        typeof field !== 'string' || field === '__proto__' || (field !== 'qr' && field !== 'barcode' && !labelFieldAllowed(field)))) return [];
    let styles: Record<string, LabelFieldStyle> | undefined;
    if (record.styles && typeof record.styles === 'object' && !Array.isArray(record.styles)) {
      // Leitura tolerante de legado: descartar somente o estilo inválido,
      // sem perder formatações válidas de outros campos ou sua ordem.
      const validStyles: Record<string, LabelFieldStyle> = {};
      for (const [code, value] of Object.entries(record.styles)) {
        try {
          Object.assign(validStyles, normalizeLabelFieldStyles(Object.fromEntries([[code, value]]), record.fields));
        } catch { /* Nunca aceitar campo desconhecido, CSS arbitrário ou chave reservada. */ }
      }
      if (Object.keys(validStyles).length) styles = validStyles;
    }
    return [{ categoryId: record.categoryId, fields: record.fields, ...(styles ? { styles } : {}) }];
  });
  // Registros legados duplicados não podem tornar ambígua a etiqueta da categoria.
  // A última configuração válida prevalece; uma entrada corrompida não apaga a válida.
  const byCategory = new Map<string, CategoryLabelTemplate>();
  for (const template of valid) byCategory.set(template.categoryId, template);
  return [...byCategory.values()];
}

export function labelTemplateForCategory(config: unknown, categoryId: string): string[] {
  return categoryLabelTemplates(config).find((item) => item.categoryId === categoryId)?.fields
    ?? defaultCategoryLabelFields();
}

export function updateCategoryLabelTemplate(config: unknown, categoryId: string, fields: string[], styles: Record<string, LabelFieldStyle> = {}): Record<string, unknown> {
  const current = configObject(config);
  const raw = current.categoryLabelTemplates;
  // Never normalize the whole persisted array on write: tolerant reads omit
  // malformed and duplicate legacy entries, but silently deleting those rows
  // would destroy data belonging to other categories.
  if (raw !== undefined && !Array.isArray(raw)) {
    throw new DeskPolicyError('Configuração histórica de etiquetas inválida. Solicite revisão antes de salvar.');
  }
  const stored = Array.isArray(raw) ? [...raw] : [];
  const templates = categoryLabelTemplates(config);
  const existing = templates.some((item) => item.categoryId === categoryId);
  if (!existing && templates.length >= 100) throw new DeskPolicyError('O evento excedeu o limite de categorias com etiquetas configuradas.');
  const updated = { categoryId, fields, ...(Object.keys(styles).length ? { styles } : {}) };
  // Replace only the last valid model for this category, preserving every
  // unrelated raw record (including malformed, duplicate or future schemas).
  // Earlier duplicates remain untouched; the tolerant reader still uses the
  // last valid record, which now contains the organizer's requested model.
  let index = -1;
  for (let i = stored.length - 1; i >= 0; i -= 1) {
    if (categoryLabelTemplates({ categoryLabelTemplates: [stored[i]] })
      .some((item) => item.categoryId === categoryId)) {
      index = i;
      break;
    }
  }
  if (index === -1) stored.push(updated);
  else stored[index] = updated;
  return { ...current, categoryLabelTemplates: stored };
}

export function categoryBadgeItems(
  registrationData: unknown, fields: ReadonlyArray<string>, styles: Record<string, LabelFieldStyle> = {},
): CategoryBadgeItem[] {
  const data = configObject(registrationData);
  // Não truncar silenciosamente valores escolhidos para impressão: o renderizador
  // estima o encaixe físico e avisa quando a etiqueta é pequena demais.
  const value = (code: string): string => {
    if (code === 'city_state') {
      const combined = data.city_state;
      if (typeof combined === 'string' && combined.trim()) return combined.trim();
      return [data.city, data.state].filter((item) => typeof item === 'string' && item.trim())
        .map((item) => String(item).trim()).join(' / ');
    }
    const raw = data[code];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    if (code === 'preferred_name') {
      // Use the same safe display-name fallback already used in the desk/search.
      return deskDisplayName(data).trim();
    }
    if (code === 'institution') {
      // Campos legados podem existir vazios: escolher o primeiro valor preenchido.
      const organization = [data.company, data.company_name, data.organization]
        .find((candidate) => typeof candidate === 'string' && candidate.trim());
      return typeof organization === 'string' ? organization.trim() : '';
    }
    return '';
  };
  return fields.flatMap((code): CategoryBadgeItem[] => {
    // Nunca herdar propriedades do protótipo como "constructor" de um mapa de estilos vazio.
    const style = Object.prototype.hasOwnProperty.call(styles, code) ? styles[code] : undefined;
    if (code === 'qr') return [{ code, kind: 'qr', value: '', ...(style ? { style } : {}) }];
    if (code === 'barcode') return [{ code, kind: 'barcode', value: '', ...(style ? { style } : {}) }];
    if (code === '__proto__' || !labelFieldAllowed(code)) return [];
    const result = value(code);
    return result ? [{ code, kind: 'text', value: result, ...(style ? { style } : {}) }] : [];
  });
}
