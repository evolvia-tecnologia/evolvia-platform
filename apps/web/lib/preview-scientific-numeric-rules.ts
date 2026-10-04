export type PreviewNumericField =
  | 'maxSubmissionsPerAuthor'
  | 'minAuthors'
  | 'maxAuthors'
  | 'titleMaxLength'
  | 'minKeywords'
  | 'maxKeywords';

export type PreviewNumericRules = {
  maxSubmissionsPerAuthor: number;
  minAuthors: number;
  maxAuthors: number | null;
  titleMaxLength: number;
  minKeywords: number;
  maxKeywords: number;
};

export type PreviewNumericContract = {
  defaults: PreviewNumericRules;
  bounds: Record<PreviewNumericField, { min: number; max: number }>;
  labels: Record<PreviewNumericField, string>;
  hints: Record<PreviewNumericField, string>;
  helps: Record<PreviewNumericField, string>;
  messages: {
    notInteger: string;
    outOfBounds: string;
    maxAuthorsBelowMin: string;
    maxKeywordsBelowMin: string;
  };
};

export type PreviewNumericResult =
  | { ok: true }
  | { ok: false; errors: Array<{ field: PreviewNumericField; message: string }> };

function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/gu, (_match, key: string) => String(vars[key] ?? ''));
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value);
}

export function previewScientificNumericRules(
  draft: PreviewNumericRules,
  contract: PreviewNumericContract,
): PreviewNumericResult {
  const errors: Array<{ field: PreviewNumericField; message: string }> = [];
  const fields = Object.keys(contract.bounds) as PreviewNumericField[];

  for (const field of fields) {
    const value = draft[field];
    if (field === 'maxAuthors' && value === null) continue;
    const bounds = contract.bounds[field];
    const label = contract.labels[field];
    if (!isSafeInteger(value)) {
      errors.push({
        field,
        message: interpolate(contract.messages.notInteger, { label }),
      });
      continue;
    }
    if (value < bounds.min || value > bounds.max) {
      errors.push({
        field,
        message: interpolate(contract.messages.outOfBounds, {
          label,
          min: bounds.min,
          max: bounds.max,
          hint: contract.hints[field],
        }),
      });
    }
  }

  if (
    draft.maxAuthors !== null
    && isSafeInteger(draft.minAuthors)
    && isSafeInteger(draft.maxAuthors)
    && draft.maxAuthors < draft.minAuthors
  ) {
    errors.push({ field: 'maxAuthors', message: contract.messages.maxAuthorsBelowMin });
  }

  if (
    isSafeInteger(draft.minKeywords)
    && isSafeInteger(draft.maxKeywords)
    && draft.maxKeywords < draft.minKeywords
  ) {
    errors.push({ field: 'maxKeywords', message: contract.messages.maxKeywordsBelowMin });
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
