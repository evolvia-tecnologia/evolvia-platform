export type ScientificNumericRuleField =
  | 'maxSubmissionsPerAuthor'
  | 'minAuthors'
  | 'maxAuthors'
  | 'titleMaxLength'
  | 'minKeywords'
  | 'maxKeywords';

export type ScientificNumericRules = {
  maxSubmissionsPerAuthor: number;
  minAuthors: number;
  maxAuthors: number | null;
  titleMaxLength: number;
  minKeywords: number;
  maxKeywords: number;
};

export type ScientificNumericRulePatch = Partial<ScientificNumericRules>;

export type ScientificNumericRuleError = {
  field: ScientificNumericRuleField;
  message: string;
};

export type ScientificNumericRulesResult =
  | { ok: true; rules: ScientificNumericRules }
  | { ok: false; errors: ScientificNumericRuleError[] };

export const SCIENTIFIC_NUMERIC_RULE_DEFAULTS: ScientificNumericRules = {
  maxSubmissionsPerAuthor: 1,
  minAuthors: 1,
  maxAuthors: null,
  titleMaxLength: 250,
  minKeywords: 3,
  maxKeywords: 5,
};

export const SCIENTIFIC_NUMERIC_RULE_BOUNDS = {
  maxSubmissionsPerAuthor: { min: 1, max: 100 },
  minAuthors: { min: 1, max: 100 },
  maxAuthors: { min: 1, max: 100 },
  titleMaxLength: { min: 50, max: 1000 },
  minKeywords: { min: 0, max: 20 },
  maxKeywords: { min: 0, max: 20 },
} as const;

const FIELD_LABEL: Record<ScientificNumericRuleField, string> = {
  maxSubmissionsPerAuthor: 'limite de trabalhos por inscrito/autor responsável',
  minAuthors: 'mínimo de autores por trabalho',
  maxAuthors: 'máximo de autores por trabalho',
  titleMaxLength: 'máximo de caracteres do título',
  minKeywords: 'mínimo de palavras-chave',
  maxKeywords: 'máximo de palavras-chave',
};

export function pickScientificNumericRules(
  source: Partial<ScientificNumericRules> | null | undefined,
): ScientificNumericRulePatch {
  if (!source) return {};
  const patch: ScientificNumericRulePatch = {};
  if (source.maxSubmissionsPerAuthor !== undefined) patch.maxSubmissionsPerAuthor = source.maxSubmissionsPerAuthor;
  if (source.minAuthors !== undefined) patch.minAuthors = source.minAuthors;
  if (source.maxAuthors !== undefined) patch.maxAuthors = source.maxAuthors;
  if (source.titleMaxLength !== undefined) patch.titleMaxLength = source.titleMaxLength;
  if (source.minKeywords !== undefined) patch.minKeywords = source.minKeywords;
  if (source.maxKeywords !== undefined) patch.maxKeywords = source.maxKeywords;
  return patch;
}

export function resolveScientificNumericRules(
  current: Partial<ScientificNumericRules> | null | undefined,
  patch: ScientificNumericRulePatch = {},
): ScientificNumericRulesResult {
  const rules: ScientificNumericRules = {
    ...SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
    ...pickScientificNumericRules(current),
    ...pickScientificNumericRules(patch),
  };
  const errors = validateScientificNumericRules(rules);
  return errors.length ? { ok: false, errors } : { ok: true, rules };
}

export function validateScientificNumericRules(rules: ScientificNumericRules): ScientificNumericRuleError[] {
  const errors: ScientificNumericRuleError[] = [];

  pushBoundError(errors, 'maxSubmissionsPerAuthor', rules.maxSubmissionsPerAuthor, 'Padrão Evolvia: 1.');
  pushBoundError(errors, 'minAuthors', rules.minAuthors, 'Padrão Evolvia: 1.');
  if (rules.maxAuthors !== null) {
    pushBoundError(errors, 'maxAuthors', rules.maxAuthors, 'Deixe vazio para não limitar.');
  }
  pushBoundError(errors, 'titleMaxLength', rules.titleMaxLength, 'Padrão Evolvia: 250.');
  pushBoundError(errors, 'minKeywords', rules.minKeywords, 'Padrão Evolvia: 3.');
  pushBoundError(errors, 'maxKeywords', rules.maxKeywords, 'Padrão Evolvia: 5.');

  if (
    rules.maxAuthors !== null
    && isSafeInteger(rules.minAuthors)
    && isSafeInteger(rules.maxAuthors)
    && rules.maxAuthors < rules.minAuthors
  ) {
    errors.push({
      field: 'maxAuthors',
      message: 'O máximo de autores não pode ser menor que o mínimo.',
    });
  }

  if (
    isSafeInteger(rules.minKeywords)
    && isSafeInteger(rules.maxKeywords)
    && rules.maxKeywords < rules.minKeywords
  ) {
    errors.push({
      field: 'maxKeywords',
      message: 'O máximo de palavras-chave não pode ser menor que o mínimo.',
    });
  }

  return errors;
}

function pushBoundError(
  errors: ScientificNumericRuleError[],
  field: Exclude<ScientificNumericRuleField, never>,
  value: number,
  hint: string,
) {
  const bounds = SCIENTIFIC_NUMERIC_RULE_BOUNDS[field];
  const label = FIELD_LABEL[field];
  if (!isSafeInteger(value)) {
    errors.push({
      field,
      message: `Informe um número inteiro válido para o ${label}.`,
    });
    return;
  }
  if (value < bounds.min || value > bounds.max) {
    errors.push({
      field,
      message: `O ${label} deve estar entre ${bounds.min} e ${bounds.max}. ${hint}`,
    });
  }
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value);
}
