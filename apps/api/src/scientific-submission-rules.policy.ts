export type ScientificCountUnit = 'WORDS' | 'CHARACTERS';
export type ScientificContentMode = 'SINGLE_BLOCK' | 'STRUCTURED_BLOCKS';

export type ScientificTextCountRule = {
  unit: ScientificCountUnit;
  min?: number | null;
  max?: number | null;
};

export type ScientificSingleBlockRule = {
  required: boolean;
  instruction?: string | null;
  count: ScientificTextCountRule;
};

export type ScientificStructuredBlockRule = {
  code: string;
  label: string;
  sortOrder: number;
  required: boolean;
  instruction?: string | null;
  placeholder?: string | null;
  count: ScientificTextCountRule;
};

export type ScientificSubmissionWindowRule = {
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export type ScientificSubmissionRuleSet = {
  requireArea: boolean;
  requireSubarea: boolean;
  minAuthors: number;
  maxAuthors?: number | null;
  minKeywords?: number | null;
  maxKeywords?: number | null;
  maxSubmissionsAsResponsible?: number | null;
  maxAuthorships?: number | null;
  maxPresentations?: number | null;
  contentMode: ScientificContentMode;
  singleBlock?: ScientificSingleBlockRule | null;
  structuredBlocks?: ScientificStructuredBlockRule[] | null;
  globalContentCount?: ScientificTextCountRule | null;
  window?: ScientificSubmissionWindowRule | null;
};

export type ScientificSubmissionRuleOverride = Partial<
  Omit<ScientificSubmissionRuleSet, 'singleBlock' | 'globalContentCount' | 'window'>
> & {
  singleBlock?: Partial<ScientificSingleBlockRule> & {
    count?: Partial<ScientificTextCountRule> | null;
  } | null;
  globalContentCount?: Partial<ScientificTextCountRule> | null;
  window?: Partial<ScientificSubmissionWindowRule> | null;
};

export type ScientificSubmissionDraftForValidation = {
  areaId?: string | null;
  subareaId?: string | null;
  authorCount: number;
  keywords?: string[] | null;
  singleBlockText?: string | null;
  structuredContent?: Record<string, string | null | undefined> | null;
  participantUsage?: {
    responsibleSubmissions: number;
    authorships: number;
    presentations: number;
    currentSubmissionCountsAsAuthorship?: boolean;
    currentSubmissionCountsAsPresentation?: boolean;
  } | null;
};

export type ScientificSubmissionRuleValidationCode =
  | 'INVALID_MIN_AUTHORS'
  | 'INVALID_AUTHOR_RANGE'
  | 'INVALID_KEYWORD_RANGE'
  | 'INVALID_QUOTA'
  | 'INVALID_WINDOW'
  | 'INVALID_TEXT_RANGE'
  | 'SINGLE_BLOCK_RULE_REQUIRED'
  | 'STRUCTURED_BLOCKS_REQUIRED'
  | 'DUPLICATED_BLOCK_CODE';

export type ScientificSubmissionValidationCode =
  | 'SUBMISSION_NOT_OPEN'
  | 'SUBMISSION_CLOSED'
  | 'AREA_REQUIRED'
  | 'SUBAREA_REQUIRED'
  | 'MIN_AUTHORS_NOT_MET'
  | 'MAX_AUTHORS_EXCEEDED'
  | 'MIN_KEYWORDS_NOT_MET'
  | 'MAX_KEYWORDS_EXCEEDED'
  | 'RESPONSIBLE_SUBMISSION_LIMIT_EXCEEDED'
  | 'AUTHORSHIP_LIMIT_EXCEEDED'
  | 'PRESENTATION_LIMIT_EXCEEDED'
  | 'CONTENT_REQUIRED'
  | 'CONTENT_MIN_NOT_MET'
  | 'CONTENT_MAX_EXCEEDED'
  | 'CONTENT_BLOCK_REQUIRED'
  | 'CONTENT_BLOCK_MIN_NOT_MET'
  | 'CONTENT_BLOCK_MAX_EXCEEDED'
  | 'GLOBAL_CONTENT_MIN_NOT_MET'
  | 'GLOBAL_CONTENT_MAX_EXCEEDED';

export type ScientificSubmissionValidation = {
  code: ScientificSubmissionValidationCode;
  field: string;
  message: string;
};

export type ScientificSubmissionRuleConfigurationValidation = {
  code: ScientificSubmissionRuleValidationCode;
  field: string;
  message: string;
};

export function normalizeScientificTextForCounting(value: string | null | undefined): string {
  if (!value) return '';
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function countScientificText(
  value: string | null | undefined,
  unit: ScientificCountUnit,
): number {
  const normalized = normalizeScientificTextForCounting(value);
  if (!normalized) return 0;
  if (unit === 'WORDS') return normalized.split(' ').length;
  return Array.from(normalized).length;
}

function mergeTextRule(
  base: ScientificTextCountRule | null | undefined,
  override: Partial<ScientificTextCountRule> | null | undefined,
): ScientificTextCountRule | null | undefined {
  if (override === null) return null;
  if (!override) return base;
  if (!base) {
    if (!override.unit) return undefined;
    return { unit: override.unit, min: override.min, max: override.max };
  }
  return { ...base, ...override };
}

export function resolveScientificSubmissionRuleSet(
  eventRules: ScientificSubmissionRuleSet,
  modalityOverride?: ScientificSubmissionRuleOverride | null,
): ScientificSubmissionRuleSet {
  if (!modalityOverride) return eventRules;

  const resolved: ScientificSubmissionRuleSet = {
    ...eventRules,
    ...modalityOverride,
  };

  if ('singleBlock' in modalityOverride) {
    if (modalityOverride.singleBlock === null) {
      resolved.singleBlock = null;
    } else if (modalityOverride.singleBlock) {
      resolved.singleBlock = {
        ...(eventRules.singleBlock ?? { required: false, count: { unit: 'WORDS' as const } }),
        ...modalityOverride.singleBlock,
        count: mergeTextRule(
          eventRules.singleBlock?.count,
          modalityOverride.singleBlock.count,
        ) ?? { unit: 'WORDS' },
      };
    }
  }

  if ('globalContentCount' in modalityOverride) {
    resolved.globalContentCount = mergeTextRule(
      eventRules.globalContentCount,
      modalityOverride.globalContentCount,
    );
  }

  if ('window' in modalityOverride) {
    resolved.window = modalityOverride.window === null
      ? null
      : { ...(eventRules.window ?? {}), ...(modalityOverride.window ?? {}) };
  }

  return resolved;
}

function validateTextRuleConfiguration(
  rule: ScientificTextCountRule | null | undefined,
  field: string,
): ScientificSubmissionRuleConfigurationValidation[] {
  if (!rule) return [];
  const errors: ScientificSubmissionRuleConfigurationValidation[] = [];
  const min = rule.min ?? null;
  const max = rule.max ?? null;

  if ((min != null && (!Number.isInteger(min) || min < 0))
    || (max != null && (!Number.isInteger(max) || max < 0))
    || (min != null && max != null && min > max)) {
    errors.push({
      code: 'INVALID_TEXT_RANGE',
      field,
      message: 'Os limites de conteúdo devem ser inteiros não negativos e o mínimo não pode superar o máximo.',
    });
  }
  return errors;
}

function invalidOptionalQuota(value: number | null | undefined): boolean {
  return value != null && (!Number.isInteger(value) || value < 1);
}

export function validateScientificSubmissionRuleSet(
  rules: ScientificSubmissionRuleSet,
): ScientificSubmissionRuleConfigurationValidation[] {
  const errors: ScientificSubmissionRuleConfigurationValidation[] = [];

  if (!Number.isInteger(rules.minAuthors) || rules.minAuthors < 1) {
    errors.push({
      code: 'INVALID_MIN_AUTHORS',
      field: 'minAuthors',
      message: 'A quantidade mínima de autores deve ser um inteiro maior ou igual a 1.',
    });
  }
  if (rules.maxAuthors != null
    && (!Number.isInteger(rules.maxAuthors) || rules.maxAuthors < rules.minAuthors)) {
    errors.push({
      code: 'INVALID_AUTHOR_RANGE',
      field: 'maxAuthors',
      message: 'A quantidade máxima de autores não pode ser menor que a quantidade mínima.',
    });
  }
  if ((rules.minKeywords != null && (!Number.isInteger(rules.minKeywords) || rules.minKeywords < 0))
    || (rules.maxKeywords != null && (!Number.isInteger(rules.maxKeywords) || rules.maxKeywords < 0))
    || (rules.minKeywords != null && rules.maxKeywords != null && rules.minKeywords > rules.maxKeywords)) {
    errors.push({
      code: 'INVALID_KEYWORD_RANGE',
      field: 'keywords',
      message: 'Os limites de palavras-chave são inválidos.',
    });
  }
  if ([
    rules.maxSubmissionsAsResponsible,
    rules.maxAuthorships,
    rules.maxPresentations,
  ].some(invalidOptionalQuota)) {
    errors.push({
      code: 'INVALID_QUOTA',
      field: 'participantQuotas',
      message: 'Limites por participante, quando definidos, devem ser inteiros maiores ou iguais a 1.',
    });
  }

  if (rules.window?.startsAt && rules.window?.endsAt
    && rules.window.endsAt.getTime() <= rules.window.startsAt.getTime()) {
    errors.push({
      code: 'INVALID_WINDOW',
      field: 'window',
      message: 'O encerramento da etapa deve ocorrer depois da abertura.',
    });
  }

  if (rules.contentMode === 'SINGLE_BLOCK') {
    if (!rules.singleBlock) {
      errors.push({
        code: 'SINGLE_BLOCK_RULE_REQUIRED',
        field: 'singleBlock',
        message: 'Configure o bloco único antes de usar este modo de conteúdo.',
      });
    } else {
      errors.push(...validateTextRuleConfiguration(rules.singleBlock.count, 'singleBlock.count'));
    }
  }

  if (rules.contentMode === 'STRUCTURED_BLOCKS') {
    const blocks = rules.structuredBlocks ?? [];
    if (blocks.length === 0) {
      errors.push({
        code: 'STRUCTURED_BLOCKS_REQUIRED',
        field: 'structuredBlocks',
        message: 'Configure ao menos um bloco de conteúdo estruturado.',
      });
    }
    const seen = new Set<string>();
    for (const block of blocks) {
      if (seen.has(block.code)) {
        errors.push({
          code: 'DUPLICATED_BLOCK_CODE',
          field: `structuredBlocks.${block.code}`,
          message: 'Cada bloco estruturado deve possuir um código único.',
        });
      }
      seen.add(block.code);
      errors.push(...validateTextRuleConfiguration(block.count, `structuredBlocks.${block.code}.count`));
    }
  }

  errors.push(...validateTextRuleConfiguration(rules.globalContentCount, 'globalContentCount'));
  return errors;
}

export function evaluateScientificSubmissionWindow(
  window: ScientificSubmissionWindowRule | null | undefined,
  now = new Date(),
): 'BEFORE' | 'OPEN' | 'CLOSED' {
  if (window?.startsAt && now.getTime() < window.startsAt.getTime()) return 'BEFORE';
  if (window?.endsAt && now.getTime() >= window.endsAt.getTime()) return 'CLOSED';
  return 'OPEN';
}

function validateTextCount(
  value: string | null | undefined,
  rule: ScientificTextCountRule,
  field: string,
  requiredCode: ScientificSubmissionValidationCode,
  minCode: ScientificSubmissionValidationCode,
  maxCode: ScientificSubmissionValidationCode,
  required: boolean,
): ScientificSubmissionValidation[] {
  const errors: ScientificSubmissionValidation[] = [];
  const count = countScientificText(value, rule.unit);
  if (required && count === 0) {
    errors.push({ code: requiredCode, field, message: 'Preencha este conteúdo obrigatório antes de submeter.' });
    return errors;
  }
  if (count === 0) return errors;
  if (rule.min != null && count < rule.min) {
    errors.push({ code: minCode, field, message: `O conteúdo precisa ter pelo menos ${rule.min} ${rule.unit === 'WORDS' ? 'palavras' : 'caracteres'}.` });
  }
  if (rule.max != null && count > rule.max) {
    errors.push({ code: maxCode, field, message: `O conteúdo pode ter no máximo ${rule.max} ${rule.unit === 'WORDS' ? 'palavras' : 'caracteres'}.` });
  }
  return errors;
}

export function validateScientificSubmissionForSubmit(
  rules: ScientificSubmissionRuleSet,
  draft: ScientificSubmissionDraftForValidation,
  now = new Date(),
): ScientificSubmissionValidation[] {
  const errors: ScientificSubmissionValidation[] = [];
  const windowStatus = evaluateScientificSubmissionWindow(rules.window, now);

  if (windowStatus === 'BEFORE') {
    errors.push({ code: 'SUBMISSION_NOT_OPEN', field: 'window', message: 'O período de submissão ainda não começou.' });
  } else if (windowStatus === 'CLOSED') {
    errors.push({ code: 'SUBMISSION_CLOSED', field: 'window', message: 'O período de submissão foi encerrado.' });
  }

  if (rules.requireArea && !draft.areaId) {
    errors.push({ code: 'AREA_REQUIRED', field: 'areaId', message: 'Selecione a área científica.' });
  }
  if (rules.requireSubarea && !draft.subareaId) {
    errors.push({ code: 'SUBAREA_REQUIRED', field: 'subareaId', message: 'Selecione a subárea científica.' });
  }
  if (draft.authorCount < rules.minAuthors) {
    errors.push({ code: 'MIN_AUTHORS_NOT_MET', field: 'authors', message: `Informe pelo menos ${rules.minAuthors} autor(es).` });
  }
  if (rules.maxAuthors != null && draft.authorCount > rules.maxAuthors) {
    errors.push({ code: 'MAX_AUTHORS_EXCEEDED', field: 'authors', message: `Este trabalho permite no máximo ${rules.maxAuthors} autor(es).` });
  }

  const keywordCount = draft.keywords?.filter((item) => normalizeScientificTextForCounting(item).length > 0).length ?? 0;
  if (rules.minKeywords != null && keywordCount < rules.minKeywords) {
    errors.push({ code: 'MIN_KEYWORDS_NOT_MET', field: 'keywords', message: `Informe pelo menos ${rules.minKeywords} palavra(s)-chave.` });
  }
  if (rules.maxKeywords != null && keywordCount > rules.maxKeywords) {
    errors.push({ code: 'MAX_KEYWORDS_EXCEEDED', field: 'keywords', message: `Informe no máximo ${rules.maxKeywords} palavra(s)-chave.` });
  }

  if (draft.participantUsage) {
    if (rules.maxSubmissionsAsResponsible != null
      && draft.participantUsage.responsibleSubmissions >= rules.maxSubmissionsAsResponsible) {
      errors.push({ code: 'RESPONSIBLE_SUBMISSION_LIMIT_EXCEEDED', field: 'participantUsage.responsibleSubmissions', message: 'Você atingiu o limite de trabalhos que pode submeter como responsável.' });
    }
    if (rules.maxAuthorships != null
      && draft.participantUsage.currentSubmissionCountsAsAuthorship !== false
      && draft.participantUsage.authorships >= rules.maxAuthorships) {
      errors.push({ code: 'AUTHORSHIP_LIMIT_EXCEEDED', field: 'participantUsage.authorships', message: 'Você atingiu o limite de trabalhos em que pode constar como autor/coautor.' });
    }
    if (rules.maxPresentations != null
      && draft.participantUsage.currentSubmissionCountsAsPresentation === true
      && draft.participantUsage.presentations >= rules.maxPresentations) {
      errors.push({ code: 'PRESENTATION_LIMIT_EXCEEDED', field: 'participantUsage.presentations', message: 'Você atingiu o limite de trabalhos em que pode ser apresentador.' });
    }
  }

  if (rules.contentMode === 'SINGLE_BLOCK' && rules.singleBlock) {
    errors.push(...validateTextCount(
      draft.singleBlockText,
      rules.singleBlock.count,
      'singleBlockText',
      'CONTENT_REQUIRED',
      'CONTENT_MIN_NOT_MET',
      'CONTENT_MAX_EXCEEDED',
      rules.singleBlock.required,
    ));
  }

  if (rules.contentMode === 'STRUCTURED_BLOCKS') {
    const orderedBlocks = [...(rules.structuredBlocks ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const block of orderedBlocks) {
      errors.push(...validateTextCount(
        draft.structuredContent?.[block.code],
        block.count,
        `structuredContent.${block.code}`,
        'CONTENT_BLOCK_REQUIRED',
        'CONTENT_BLOCK_MIN_NOT_MET',
        'CONTENT_BLOCK_MAX_EXCEEDED',
        block.required,
      ));
    }
  }

  if (rules.globalContentCount) {
    const globalText = rules.contentMode === 'SINGLE_BLOCK'
      ? draft.singleBlockText
      : [...(rules.structuredBlocks ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((block) => draft.structuredContent?.[block.code] ?? '')
        .join(' ');
    const globalCount = countScientificText(globalText, rules.globalContentCount.unit);
    if (rules.globalContentCount.min != null && globalCount < rules.globalContentCount.min) {
      errors.push({ code: 'GLOBAL_CONTENT_MIN_NOT_MET', field: 'content', message: `O conteúdo completo precisa ter pelo menos ${rules.globalContentCount.min} ${rules.globalContentCount.unit === 'WORDS' ? 'palavras' : 'caracteres'}.` });
    }
    if (rules.globalContentCount.max != null && globalCount > rules.globalContentCount.max) {
      errors.push({ code: 'GLOBAL_CONTENT_MAX_EXCEEDED', field: 'content', message: `O conteúdo completo pode ter no máximo ${rules.globalContentCount.max} ${rules.globalContentCount.unit === 'WORDS' ? 'palavras' : 'caracteres'}.` });
    }
  }

  return errors;
}
