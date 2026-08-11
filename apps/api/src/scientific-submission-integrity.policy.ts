import {
  countScientificText,
  type ScientificTextCountRule,
} from './scientific-submission-rules.policy.js';

export type ScientificSinglePersonPolicy = 'DISABLED' | 'OPTIONAL_ONE' | 'EXACTLY_ONE';
export type ScientificConflictPolicy = 'DISABLED' | 'OPTIONAL' | 'REQUIRED';

export type ScientificSubmissionFileRule = {
  enabled: boolean;
  required: boolean;
  maxFiles?: number | null;
  maxBytesPerFile?: number | null;
  allowedMimeTypes?: string[] | null;
  requireAnonymizationConfirmation?: boolean;
};

export type ScientificAdditionalFieldRule = {
  code: string;
  required: boolean;
};

export type ScientificSubmissionIntegrityRules = {
  titleCount: ScientificTextCountRule;
  requirePresentationForm: boolean;
  allowedPresentationForms?: string[] | null;
  presenterPolicy: ScientificSinglePersonPolicy;
  correspondingAuthorPolicy: ScientificSinglePersonPolicy;
  minInstitutions?: number | null;
  maxInstitutions?: number | null;
  requireInstitutionPerAuthor?: boolean;
  requireOrcidForAuthors?: boolean;
  conflictPolicy: ScientificConflictPolicy;
  requireConflictDescriptionWhenDeclared?: boolean;
  file?: ScientificSubmissionFileRule | null;
  additionalFields?: ScientificAdditionalFieldRule[] | null;
};

export type ScientificSubmissionFileDraft = {
  mimeType: string;
  sizeBytes: number;
};

export type ScientificSubmissionIntegrityDraft = {
  title: string;
  presentationForm?: string | null;
  presenterCount: number;
  correspondingAuthorCount: number;
  institutionCount: number;
  authorsWithoutInstitution?: number;
  authorsMissingOrcid?: number;
  conflictDeclared?: boolean | null;
  conflictDescription?: string | null;
  files?: ScientificSubmissionFileDraft[] | null;
  anonymizationConfirmed?: boolean;
  additionalResponses?: Record<string, unknown> | null;
};

export type ScientificSubmissionIntegrityConfigurationCode =
  | 'INVALID_TITLE_RANGE'
  | 'INVALID_INSTITUTION_RANGE'
  | 'INVALID_FILE_RULE'
  | 'DUPLICATED_ADDITIONAL_FIELD';

export type ScientificSubmissionIntegrityValidationCode =
  | 'TITLE_MIN_NOT_MET'
  | 'TITLE_MAX_EXCEEDED'
  | 'PRESENTATION_FORM_REQUIRED'
  | 'PRESENTATION_FORM_NOT_ALLOWED'
  | 'PRESENTER_NOT_ALLOWED'
  | 'PRESENTER_REQUIRED'
  | 'MULTIPLE_PRESENTERS_NOT_ALLOWED'
  | 'CORRESPONDING_AUTHOR_NOT_ALLOWED'
  | 'CORRESPONDING_AUTHOR_REQUIRED'
  | 'MULTIPLE_CORRESPONDING_AUTHORS_NOT_ALLOWED'
  | 'MIN_INSTITUTIONS_NOT_MET'
  | 'MAX_INSTITUTIONS_EXCEEDED'
  | 'AUTHOR_INSTITUTION_REQUIRED'
  | 'AUTHOR_ORCID_REQUIRED'
  | 'CONFLICT_DECLARATION_REQUIRED'
  | 'CONFLICT_DESCRIPTION_REQUIRED'
  | 'FILE_REQUIRED'
  | 'TOO_MANY_FILES'
  | 'FILE_TOO_LARGE'
  | 'FILE_TYPE_NOT_ALLOWED'
  | 'ANONYMIZATION_CONFIRMATION_REQUIRED'
  | 'ADDITIONAL_FIELD_REQUIRED';

export type ScientificSubmissionIntegrityValidation = {
  code: ScientificSubmissionIntegrityValidationCode;
  field: string;
  message: string;
};

export type ScientificSubmissionIntegrityConfigurationValidation = {
  code: ScientificSubmissionIntegrityConfigurationCode;
  field: string;
  message: string;
};

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function validateScientificSubmissionIntegrityRules(
  rules: ScientificSubmissionIntegrityRules,
): ScientificSubmissionIntegrityConfigurationValidation[] {
  const errors: ScientificSubmissionIntegrityConfigurationValidation[] = [];
  const titleMin = rules.titleCount.min ?? null;
  const titleMax = rules.titleCount.max ?? null;
  if ((titleMin != null && (!Number.isInteger(titleMin) || titleMin < 0))
    || (titleMax != null && (!Number.isInteger(titleMax) || titleMax < 0))
    || (titleMin != null && titleMax != null && titleMin > titleMax)) {
    errors.push({
      code: 'INVALID_TITLE_RANGE',
      field: 'titleCount',
      message: 'Os limites do título são inválidos.',
    });
  }

  if ((rules.minInstitutions != null && (!Number.isInteger(rules.minInstitutions) || rules.minInstitutions < 0))
    || (rules.maxInstitutions != null && (!Number.isInteger(rules.maxInstitutions) || rules.maxInstitutions < 0))
    || (rules.minInstitutions != null && rules.maxInstitutions != null && rules.minInstitutions > rules.maxInstitutions)) {
    errors.push({
      code: 'INVALID_INSTITUTION_RANGE',
      field: 'institutions',
      message: 'Os limites de instituições/afiliações são inválidos.',
    });
  }

  if (rules.file?.enabled) {
    if ((rules.file.maxFiles != null && (!Number.isInteger(rules.file.maxFiles) || rules.file.maxFiles < 1))
      || (rules.file.maxBytesPerFile != null && (!Number.isInteger(rules.file.maxBytesPerFile) || rules.file.maxBytesPerFile < 1))) {
      errors.push({
        code: 'INVALID_FILE_RULE',
        field: 'file',
        message: 'Quantidade e tamanho de arquivos devem ser inteiros positivos quando configurados.',
      });
    }
  }

  const seenFields = new Set<string>();
  for (const field of rules.additionalFields ?? []) {
    if (seenFields.has(field.code)) {
      errors.push({
        code: 'DUPLICATED_ADDITIONAL_FIELD',
        field: `additionalFields.${field.code}`,
        message: 'Cada campo adicional deve possuir um código único.',
      });
    }
    seenFields.add(field.code);
  }

  return errors;
}

function validateSinglePersonPolicy(
  count: number,
  policy: ScientificSinglePersonPolicy,
  field: string,
  codes: {
    notAllowed: ScientificSubmissionIntegrityValidationCode;
    required: ScientificSubmissionIntegrityValidationCode;
    multiple: ScientificSubmissionIntegrityValidationCode;
  },
  label: string,
): ScientificSubmissionIntegrityValidation[] {
  if (policy === 'DISABLED' && count > 0) {
    return [{ code: codes.notAllowed, field, message: `${label} não é utilizado nesta modalidade.` }];
  }
  if (policy === 'EXACTLY_ONE' && count === 0) {
    return [{ code: codes.required, field, message: `Selecione exatamente um ${label.toLowerCase()}.` }];
  }
  if (policy !== 'DISABLED' && count > 1) {
    return [{ code: codes.multiple, field, message: `Selecione no máximo um ${label.toLowerCase()}.` }];
  }
  return [];
}

export function validateScientificSubmissionIntegrityForSubmit(
  rules: ScientificSubmissionIntegrityRules,
  draft: ScientificSubmissionIntegrityDraft,
): ScientificSubmissionIntegrityValidation[] {
  const errors: ScientificSubmissionIntegrityValidation[] = [];
  const titleCount = countScientificText(draft.title, rules.titleCount.unit);

  if (rules.titleCount.min != null && titleCount < rules.titleCount.min) {
    errors.push({
      code: 'TITLE_MIN_NOT_MET',
      field: 'title',
      message: `O título precisa ter pelo menos ${rules.titleCount.min} ${rules.titleCount.unit === 'WORDS' ? 'palavras' : 'caracteres'}.`,
    });
  }
  if (rules.titleCount.max != null && titleCount > rules.titleCount.max) {
    errors.push({
      code: 'TITLE_MAX_EXCEEDED',
      field: 'title',
      message: `O título pode ter no máximo ${rules.titleCount.max} ${rules.titleCount.unit === 'WORDS' ? 'palavras' : 'caracteres'}.`,
    });
  }

  if (rules.requirePresentationForm && !draft.presentationForm) {
    errors.push({
      code: 'PRESENTATION_FORM_REQUIRED',
      field: 'presentationForm',
      message: 'Selecione a forma de apresentação.',
    });
  }
  if (draft.presentationForm && rules.allowedPresentationForms?.length
    && !rules.allowedPresentationForms.includes(draft.presentationForm)) {
    errors.push({
      code: 'PRESENTATION_FORM_NOT_ALLOWED',
      field: 'presentationForm',
      message: 'A forma de apresentação selecionada não é permitida para esta modalidade.',
    });
  }

  errors.push(...validateSinglePersonPolicy(
    draft.presenterCount,
    rules.presenterPolicy,
    'presenterCount',
    {
      notAllowed: 'PRESENTER_NOT_ALLOWED',
      required: 'PRESENTER_REQUIRED',
      multiple: 'MULTIPLE_PRESENTERS_NOT_ALLOWED',
    },
    'Apresentador',
  ));
  errors.push(...validateSinglePersonPolicy(
    draft.correspondingAuthorCount,
    rules.correspondingAuthorPolicy,
    'correspondingAuthorCount',
    {
      notAllowed: 'CORRESPONDING_AUTHOR_NOT_ALLOWED',
      required: 'CORRESPONDING_AUTHOR_REQUIRED',
      multiple: 'MULTIPLE_CORRESPONDING_AUTHORS_NOT_ALLOWED',
    },
    'Autor correspondente',
  ));

  if (rules.minInstitutions != null && draft.institutionCount < rules.minInstitutions) {
    errors.push({
      code: 'MIN_INSTITUTIONS_NOT_MET',
      field: 'institutions',
      message: `Informe pelo menos ${rules.minInstitutions} instituição(ões)/afiliação(ões).`,
    });
  }
  if (rules.maxInstitutions != null && draft.institutionCount > rules.maxInstitutions) {
    errors.push({
      code: 'MAX_INSTITUTIONS_EXCEEDED',
      field: 'institutions',
      message: `Este trabalho permite no máximo ${rules.maxInstitutions} instituição(ões)/afiliação(ões).`,
    });
  }
  if (rules.requireInstitutionPerAuthor && (draft.authorsWithoutInstitution ?? 0) > 0) {
    errors.push({
      code: 'AUTHOR_INSTITUTION_REQUIRED',
      field: 'authors',
      message: 'Todos os autores devem possuir ao menos uma instituição/afiliação.',
    });
  }
  if (rules.requireOrcidForAuthors && (draft.authorsMissingOrcid ?? 0) > 0) {
    errors.push({
      code: 'AUTHOR_ORCID_REQUIRED',
      field: 'authors',
      message: 'Todos os autores devem informar ORCID nesta modalidade.',
    });
  }

  if (rules.conflictPolicy === 'REQUIRED' && draft.conflictDeclared == null) {
    errors.push({
      code: 'CONFLICT_DECLARATION_REQUIRED',
      field: 'conflictDeclared',
      message: 'Declare se existe conflito de interesse antes de submeter.',
    });
  }
  if (draft.conflictDeclared === true
    && rules.requireConflictDescriptionWhenDeclared
    && isBlank(draft.conflictDescription)) {
    errors.push({
      code: 'CONFLICT_DESCRIPTION_REQUIRED',
      field: 'conflictDescription',
      message: 'Descreva o conflito de interesse declarado.',
    });
  }

  if (rules.file?.enabled) {
    const files = draft.files ?? [];
    if (rules.file.required && files.length === 0) {
      errors.push({ code: 'FILE_REQUIRED', field: 'files', message: 'Envie o arquivo exigido para esta submissão.' });
    }
    if (rules.file.maxFiles != null && files.length > rules.file.maxFiles) {
      errors.push({ code: 'TOO_MANY_FILES', field: 'files', message: `Envie no máximo ${rules.file.maxFiles} arquivo(s).` });
    }
    for (const [index, file] of files.entries()) {
      if (rules.file.maxBytesPerFile != null && file.sizeBytes > rules.file.maxBytesPerFile) {
        errors.push({ code: 'FILE_TOO_LARGE', field: `files.${index}.sizeBytes`, message: 'O arquivo ultrapassa o tamanho máximo permitido.' });
      }
      if (rules.file.allowedMimeTypes?.length && !rules.file.allowedMimeTypes.includes(file.mimeType)) {
        errors.push({ code: 'FILE_TYPE_NOT_ALLOWED', field: `files.${index}.mimeType`, message: 'O formato do arquivo não é permitido.' });
      }
    }
    if (rules.file.requireAnonymizationConfirmation && files.length > 0 && !draft.anonymizationConfirmed) {
      errors.push({
        code: 'ANONYMIZATION_CONFIRMATION_REQUIRED',
        field: 'anonymizationConfirmed',
        message: 'Confirme que o arquivo atende às regras de anonimização antes de submeter.',
      });
    }
  }

  for (const field of rules.additionalFields ?? []) {
    if (field.required && isBlank(draft.additionalResponses?.[field.code])) {
      errors.push({
        code: 'ADDITIONAL_FIELD_REQUIRED',
        field: `additionalResponses.${field.code}`,
        message: 'Preencha este campo adicional obrigatório.',
      });
    }
  }

  return errors;
}
