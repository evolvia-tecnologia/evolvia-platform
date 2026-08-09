export type ScientificSubmissionReviewMode = 'OPEN' | 'SINGLE_BLIND' | 'DOUBLE_BLIND';

export type ScientificSubmissionStatus =
  | 'DRAFT'
  | 'INCOMPLETE'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'ACCEPTED_WITH_CHANGES';

export type SubmissionRequirement = {
  areaEnabled: boolean;
  areaRequired: boolean;
  subareaEnabled: boolean;
  subareaRequired: boolean;
  fileEnabled: boolean;
  fileRequired: boolean;
  minAuthors?: number | null;
  maxAuthors?: number | null;
  presenterRequired: boolean;
};

export type SubmissionDraft = {
  title?: string | null;
  modalityId?: string | null;
  scientificAreaId?: string | null;
  scientificSubareaId?: string | null;
  fileId?: string | null;
  authors: Array<{ id: string; order: number; presenter?: boolean }>;
};

export type SubmissionValidationCode =
  | 'TITLE_REQUIRED'
  | 'MODALITY_REQUIRED'
  | 'AREA_REQUIRED'
  | 'SUBAREA_REQUIRED'
  | 'SUBAREA_WITHOUT_AREA'
  | 'FILE_REQUIRED'
  | 'MIN_AUTHORS'
  | 'MAX_AUTHORS'
  | 'AUTHOR_ORDER_DUPLICATED'
  | 'PRESENTER_REQUIRED'
  | 'MULTIPLE_PRESENTERS';

export type SubmissionValidation = {
  code: SubmissionValidationCode;
  field: string;
  message: string;
};

export function validateSubmissionForSubmit(
  draft: SubmissionDraft,
  requirements: SubmissionRequirement,
): SubmissionValidation[] {
  const errors: SubmissionValidation[] = [];

  if (!draft.title?.trim()) {
    errors.push({ code: 'TITLE_REQUIRED', field: 'title', message: 'Informe o título do trabalho.' });
  }

  if (!draft.modalityId) {
    errors.push({ code: 'MODALITY_REQUIRED', field: 'modalityId', message: 'Selecione uma modalidade habilitada para o evento.' });
  }

  if (requirements.areaEnabled && requirements.areaRequired && !draft.scientificAreaId) {
    errors.push({ code: 'AREA_REQUIRED', field: 'scientificAreaId', message: 'Selecione a área científica exigida para esta modalidade.' });
  }

  if (requirements.subareaEnabled && requirements.subareaRequired && !draft.scientificSubareaId) {
    errors.push({ code: 'SUBAREA_REQUIRED', field: 'scientificSubareaId', message: 'Selecione a subárea científica exigida para esta modalidade.' });
  }

  if (draft.scientificSubareaId && !draft.scientificAreaId) {
    errors.push({ code: 'SUBAREA_WITHOUT_AREA', field: 'scientificSubareaId', message: 'A subárea precisa estar vinculada a uma área do mesmo evento.' });
  }

  if (requirements.fileEnabled && requirements.fileRequired && !draft.fileId) {
    errors.push({ code: 'FILE_REQUIRED', field: 'fileId', message: 'Envie o arquivo completo exigido para esta modalidade.' });
  }

  if (requirements.minAuthors != null && draft.authors.length < requirements.minAuthors) {
    errors.push({ code: 'MIN_AUTHORS', field: 'authors', message: `Inclua pelo menos ${requirements.minAuthors} autor(es).` });
  }

  if (requirements.maxAuthors != null && draft.authors.length > requirements.maxAuthors) {
    errors.push({ code: 'MAX_AUTHORS', field: 'authors', message: `Esta modalidade permite no máximo ${requirements.maxAuthors} autor(es).` });
  }

  const orders = new Set<number>();
  for (const author of draft.authors) {
    if (orders.has(author.order)) {
      errors.push({ code: 'AUTHOR_ORDER_DUPLICATED', field: 'authors', message: 'A ordem de autoria deve ser única e estável.' });
      break;
    }
    orders.add(author.order);
  }

  const presenters = draft.authors.filter((author) => author.presenter);
  if (requirements.presenterRequired && presenters.length === 0) {
    errors.push({ code: 'PRESENTER_REQUIRED', field: 'authors', message: 'Indique quem apresentará o trabalho.' });
  }
  if (presenters.length > 1) {
    errors.push({ code: 'MULTIPLE_PRESENTERS', field: 'authors', message: 'Somente um apresentador pode ser indicado para o trabalho.' });
  }

  return errors;
}

const ALLOWED_TRANSITIONS: Record<ScientificSubmissionStatus, ScientificSubmissionStatus[]> = {
  DRAFT: ['INCOMPLETE', 'SUBMITTED'],
  INCOMPLETE: ['DRAFT', 'SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED', 'ACCEPTED_WITH_CHANGES'],
  ACCEPTED: [],
  REJECTED: [],
  ACCEPTED_WITH_CHANGES: [],
};

export function canTransitionSubmission(
  from: ScientificSubmissionStatus,
  to: ScientificSubmissionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function requiresImmutableSubmittedVersion(status: ScientificSubmissionStatus): boolean {
  return ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'ACCEPTED_WITH_CHANGES'].includes(status);
}

export function shouldHideAuthorIdentity(reviewMode: ScientificSubmissionReviewMode): boolean {
  return reviewMode === 'SINGLE_BLIND' || reviewMode === 'DOUBLE_BLIND';
}
