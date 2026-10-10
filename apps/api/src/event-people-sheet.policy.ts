export const PEOPLE_SHEET_MAX = 5000;
export const PEOPLE_LIST_MAX = 40;

const FIXED_HEADERS = ['Protocolo', 'Categoria', 'Situação', 'Confirmado em'] as const;

export type PeopleSheetField = {
  code: string;
  label: string;
  type: string;
  enabled?: boolean;
  options?: Array<{ id: string; label: string }>;
};

export type PeopleSheetSource = {
  protocol: string;
  categoryName: string;
  confirmedAt: Date | null;
  registrationData: unknown;
};

export function enabledPeopleFields(fields: PeopleSheetField[]): PeopleSheetField[] {
  const seen = new Set<string>();
  const enabled: PeopleSheetField[] = [];
  for (const field of fields) {
    if (!field?.code || field.enabled === false || seen.has(field.code)) continue;
    seen.add(field.code);
    enabled.push(field);
  }
  return enabled;
}

export function peopleDisplayName(data: unknown): string {
  const record = asRecord(data);
  const preferred = typeof record.preferred_name === 'string' ? record.preferred_name : '';
  const full = typeof record.full_name === 'string' ? record.full_name : '';
  const name = (preferred.trim() || full.trim()).replace(/[ \t]+/g, ' ');
  if (name.length < 2 || name.length > 180 || /[<>\u0000-\u001f\u007f]/u.test(`${preferred}${full}`)) return 'Nome não exibível';
  return name;
}

export function peopleFieldText(field: PeopleSheetField, data: unknown): string {
  if (field.type === 'PHOTO') return 'Não incluído';
  const value = asRecord(data)[field.code];
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'CONSENT') return value === true ? 'Sim' : value === false ? 'Não' : '';
  if (field.type === 'CHECKBOX' || field.type === 'SELECT' || field.type === 'RADIO') {
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => optionLabel(field, item)).filter((item) => item.length > 0).join('; ');
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string') return clip(value);
  return '';
}

export function peopleSheetHeaders(fields: PeopleSheetField[]): string[] {
  const used = new Set<string>(FIXED_HEADERS);
  const headers: string[] = [...FIXED_HEADERS];
  for (const field of enabledPeopleFields(fields)) {
    let label = clip(field.label) || field.code;
    if (used.has(label)) label = `${label} (${field.code})`;
    used.add(label);
    headers.push(label);
  }
  return headers;
}

export function peopleSheetValues(fields: PeopleSheetField[], row: PeopleSheetSource, confirmedLabel: string): string[] {
  return [
    row.protocol,
    row.categoryName,
    'Confirmada',
    confirmedLabel,
    ...enabledPeopleFields(fields).map((field) => peopleFieldText(field, row.registrationData)),
  ];
}

export function peopleCsv(headers: string[], records: string[][]): string {
  const lines = [headers, ...records].map((line) => line.map((value) => peopleCsvCell(value)).join(','));
  return `\uFEFF${lines.join('\n')}\n`;
}

export function peopleCsvCell(value: string): string {
  let text = clip(value);
  if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

function optionLabel(field: PeopleSheetField, item: unknown): string {
  if (typeof item !== 'string' && typeof item !== 'number') return '';
  const key = String(item);
  const match = field.options?.find((option) => option.id === key);
  return match ? clip(match.label) : 'Opção não reconhecida';
}

function clip(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, 2000);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
