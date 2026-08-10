export type ScientificDecisionValue = 'ACCEPTED' | 'REJECTED' | 'ACCEPTED_WITH_CHANGES';
export type ScientificDecisionSourceStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | ScientificDecisionValue;

export type ScientificDecisionDraft = {
  decision?: ScientificDecisionValue | null;
  publicMessage?: string | null;
  internalNote?: string | null;
  submissionId: string;
  versionId: string;
};

export type ScientificDecisionValidationCode =
  | 'DECISION_REQUIRED'
  | 'SOURCE_STATUS_NOT_ELIGIBLE'
  | 'VERSION_MISMATCH'
  | 'CHANGES_MESSAGE_REQUIRED';

export type ScientificDecisionValidation = {
  code: ScientificDecisionValidationCode;
  field: string;
  message: string;
};

const DECISION_TARGETS = new Set<ScientificDecisionValue>([
  'ACCEPTED',
  'REJECTED',
  'ACCEPTED_WITH_CHANGES',
]);

export function isScientificDecision(value: string): value is ScientificDecisionValue {
  return DECISION_TARGETS.has(value as ScientificDecisionValue);
}

export function canTransitionSubmissionToDecision(
  from: ScientificDecisionSourceStatus,
  to: ScientificDecisionValue,
): boolean {
  return from === 'UNDER_REVIEW' && isScientificDecision(to);
}

export function requiresNewVersion(decision: ScientificDecisionValue): boolean {
  return decision === 'ACCEPTED_WITH_CHANGES';
}

export function recommendationIsOnlyEvidence(
  recommendation: 'ACCEPT' | 'REJECT' | 'CHANGES',
  decision: ScientificDecisionValue,
): boolean {
  const aligned =
    (recommendation === 'ACCEPT' && decision === 'ACCEPTED') ||
    (recommendation === 'REJECT' && decision === 'REJECTED') ||
    (recommendation === 'CHANGES' && decision === 'ACCEPTED_WITH_CHANGES');

  return aligned;
}

export function validateScientificDecision(
  sourceStatus: ScientificDecisionSourceStatus,
  expectedSubmissionId: string,
  expectedVersionId: string,
  draft: ScientificDecisionDraft,
): ScientificDecisionValidation[] {
  const errors: ScientificDecisionValidation[] = [];

  if (!draft.decision) {
    errors.push({
      code: 'DECISION_REQUIRED',
      field: 'decision',
      message: 'Escolha a decisão oficial antes de confirmar.',
    });
  }

  if (sourceStatus !== 'UNDER_REVIEW') {
    errors.push({
      code: 'SOURCE_STATUS_NOT_ELIGIBLE',
      field: 'status',
      message: 'A decisão oficial só pode ser registrada para um trabalho em avaliação.',
    });
  }

  if (draft.submissionId !== expectedSubmissionId || draft.versionId !== expectedVersionId) {
    errors.push({
      code: 'VERSION_MISMATCH',
      field: 'versionId',
      message: 'A decisão deve permanecer vinculada ao trabalho e à versão imutável em análise.',
    });
  }

  if (
    draft.decision === 'ACCEPTED_WITH_CHANGES' &&
    (!draft.publicMessage || draft.publicMessage.trim().length === 0)
  ) {
    errors.push({
      code: 'CHANGES_MESSAGE_REQUIRED',
      field: 'publicMessage',
      message: 'Explique ao autor quais ajustes são necessários antes de solicitar uma nova versão.',
    });
  }

  return errors;
}

export function buildAuthorDecisionView(input: {
  decision: ScientificDecisionValue;
  publicMessage?: string | null;
  decidedAt: string;
  versionId: string;
  internalNote?: string | null;
  decidedByUserId?: string | null;
  reviewerPersonIds?: string[];
}) {
  return {
    decision: input.decision,
    publicMessage: input.publicMessage ?? null,
    decidedAt: input.decidedAt,
    versionId: input.versionId,
    requiresNewVersion: requiresNewVersion(input.decision),
  };
}
