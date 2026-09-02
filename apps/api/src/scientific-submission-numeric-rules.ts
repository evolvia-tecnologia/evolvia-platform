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

export const SCIENTIFIC_NUMERIC_RULE_FIELDS = [
  'maxSubmissionsPerAuthor',
  'minAuthors',
  'maxAuthors',
  'titleMaxLength',
  'minKeywords',
  'maxKeywords',
] as const;

const FIELD_LABEL: Record<ScientificNumericRuleField, string> = {
  maxSubmissionsPerAuthor: 'limite de trabalhos por inscrito/autor responsável',
  minAuthors: 'mínimo de autores por trabalho',
  maxAuthors: 'máximo de autores por trabalho',
  titleMaxLength: 'máximo de caracteres do título',
  minKeywords: 'mínimo de palavras-chave',
  maxKeywords: 'máximo de palavras-chave',
};

const FIELD_HINT: Record<ScientificNumericRuleField, string> = {
  maxSubmissionsPerAuthor: `Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.maxSubmissionsPerAuthor}.`,
  minAuthors: `Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.minAuthors}.`,
  maxAuthors: 'Deixe vazio para não limitar.',
  titleMaxLength: `Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.titleMaxLength}.`,
  minKeywords: `Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.minKeywords}.`,
  maxKeywords: `Padrão Evolvia: ${SCIENTIFIC_NUMERIC_RULE_DEFAULTS.maxKeywords}.`,
};

export type ScientificNumericContract = {
  defaults: ScientificNumericRules;
  bounds: Record<ScientificNumericRuleField, { min: number; max: number }>;
  labels: Record<ScientificNumericRuleField, string>;
  hints: Record<ScientificNumericRuleField, string>;
  helps: Record<ScientificNumericRuleField, string>;
  messages: {
    notInteger: string;
    outOfBounds: string;
    maxAuthorsBelowMin: string;
    maxKeywordsBelowMin: string;
  };
};

export function describeScientificNumericContract(): ScientificNumericContract {
  const bounds = {
    maxSubmissionsPerAuthor: { ...SCIENTIFIC_NUMERIC_RULE_BOUNDS.maxSubmissionsPerAuthor },
    minAuthors: { ...SCIENTIFIC_NUMERIC_RULE_BOUNDS.minAuthors },
    maxAuthors: { ...SCIENTIFIC_NUMERIC_RULE_BOUNDS.maxAuthors },
    titleMaxLength: { ...SCIENTIFIC_NUMERIC_RULE_BOUNDS.titleMaxLength },
    minKeywords: { ...SCIENTIFIC_NUMERIC_RULE_BOUNDS.minKeywords },
    maxKeywords: { ...SCIENTIFIC_NUMERIC_RULE_BOUNDS.maxKeywords },
  };
  return {
    defaults: { ...SCIENTIFIC_NUMERIC_RULE_DEFAULTS },
    bounds,
    labels: { ...FIELD_LABEL },
    hints: { ...FIELD_HINT },
    helps: {
      maxSubmissionsPerAuthor: `${FIELD_HINT.maxSubmissionsPerAuthor} Limite seguro: ${bounds.maxSubmissionsPerAuthor.min} a ${bounds.maxSubmissionsPerAuthor.max} por inscrito/autor responsável.`,
      minAuthors: `${FIELD_HINT.minAuthors} Deve ser menor ou igual ao máximo.`,
      maxAuthors: `Opcional. ${FIELD_HINT.maxAuthors} Não pode ser menor que o mínimo.`,
      titleMaxLength: `${FIELD_HINT.titleMaxLength} Limite seguro: ${bounds.titleMaxLength.min} a ${bounds.titleMaxLength.max}.`,
      minKeywords: `${FIELD_HINT.minKeywords} Limite seguro: ${bounds.minKeywords.min} a ${bounds.minKeywords.max}.`,
      maxKeywords: `${FIELD_HINT.maxKeywords} Deve ser maior ou igual ao mínimo, até ${bounds.maxKeywords.max}.`,
    },
    messages: {
      notInteger: 'Informe um número inteiro válido para o {label}.',
      outOfBounds: 'O {label} deve estar entre {min} e {max}. {hint}',
      maxAuthorsBelowMin: 'O máximo de autores não pode ser menor que o mínimo.',
      maxKeywordsBelowMin: 'O máximo de palavras-chave não pode ser menor que o mínimo.',
    },
  };
}

export function interpolateScientificNumericMessage(
  template: string,
  vars: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/gu, (_match, key: string) => String(vars[key] ?? ''));
}

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
  const contract = describeScientificNumericContract();
  const errors: ScientificNumericRuleError[] = [];

  pushBoundError(errors, contract, 'maxSubmissionsPerAuthor', rules.maxSubmissionsPerAuthor);
  pushBoundError(errors, contract, 'minAuthors', rules.minAuthors);
  if (rules.maxAuthors !== null) {
    pushBoundError(errors, contract, 'maxAuthors', rules.maxAuthors);
  }
  pushBoundError(errors, contract, 'titleMaxLength', rules.titleMaxLength);
  pushBoundError(errors, contract, 'minKeywords', rules.minKeywords);
  pushBoundError(errors, contract, 'maxKeywords', rules.maxKeywords);

  if (
    rules.maxAuthors !== null
    && isSafeInteger(rules.minAuthors)
    && isSafeInteger(rules.maxAuthors)
    && rules.maxAuthors < rules.minAuthors
  ) {
    errors.push({
      field: 'maxAuthors',
      message: contract.messages.maxAuthorsBelowMin,
    });
  }

  if (
    isSafeInteger(rules.minKeywords)
    && isSafeInteger(rules.maxKeywords)
    && rules.maxKeywords < rules.minKeywords
  ) {
    errors.push({
      field: 'maxKeywords',
      message: contract.messages.maxKeywordsBelowMin,
    });
  }

  return errors;
}

function pushBoundError(
  errors: ScientificNumericRuleError[],
  contract: ScientificNumericContract,
  field: ScientificNumericRuleField,
  value: number,
) {
  const bounds = contract.bounds[field];
  const label = contract.labels[field];
  if (!isSafeInteger(value)) {
    errors.push({
      field,
      message: interpolateScientificNumericMessage(contract.messages.notInteger, { label }),
    });
    return;
  }
  if (value < bounds.min || value > bounds.max) {
    errors.push({
      field,
      message: interpolateScientificNumericMessage(contract.messages.outOfBounds, {
        label,
        min: bounds.min,
        max: bounds.max,
        hint: contract.hints[field],
      }),
    });
  }
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value);
}
