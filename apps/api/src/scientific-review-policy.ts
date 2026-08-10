export type ScientificReviewMode = 'OPEN' | 'SINGLE_BLIND' | 'DOUBLE_BLIND';
export type ScientificReviewAssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';
export type ScientificReviewConflictStatus = 'PENDING' | 'CLEAR' | 'CONFLICT';
export type ScientificReviewRecommendation = 'ACCEPT' | 'REJECT' | 'CHANGES';

export type ScientificReviewCriterionRule = {
  id: string;
  required: boolean;
  minScore: number;
  maxScore: number;
  weight?: number | null;
};

export type ScientificReviewScoreDraft = {
  criterionId: string;
  value: number;
};

export type ScientificReviewValidationCode =
  | 'CONFLICT_PENDING'
  | 'CONFLICT_DECLARED'
  | 'RECOMMENDATION_REQUIRED'
  | 'REQUIRED_CRITERION_MISSING'
  | 'DUPLICATED_CRITERION'
  | 'UNKNOWN_CRITERION'
  | 'SCORE_OUT_OF_RANGE';

export type ScientificReviewValidation = {
  code: ScientificReviewValidationCode;
  field: string;
  message: string;
};

export function canReviewerSeeAuthorIdentity(reviewMode: ScientificReviewMode): boolean {
  return reviewMode !== 'DOUBLE_BLIND';
}

export function canAuthorSeeReviewerIdentity(reviewMode: ScientificReviewMode): boolean {
  return reviewMode === 'OPEN';
}

export function hasObjectiveAuthorshipConflict(
  reviewerPersonId: string,
  authorPersonIds: string[],
): boolean {
  return authorPersonIds.includes(reviewerPersonId);
}

export function canMutateReview(status: ScientificReviewAssignmentStatus): boolean {
  return status === 'ASSIGNED' || status === 'IN_PROGRESS';
}

const ASSIGNMENT_TRANSITIONS: Record<ScientificReviewAssignmentStatus, ScientificReviewAssignmentStatus[]> = {
  ASSIGNED: ['IN_PROGRESS', 'SUBMITTED', 'CANCELLED'],
  IN_PROGRESS: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: [],
  CANCELLED: [],
};

export function canTransitionReviewAssignment(
  from: ScientificReviewAssignmentStatus,
  to: ScientificReviewAssignmentStatus,
): boolean {
  return ASSIGNMENT_TRANSITIONS[from].includes(to);
}

export function validateReviewForSubmit(
  criteria: ScientificReviewCriterionRule[],
  scores: ScientificReviewScoreDraft[],
  conflictStatus: ScientificReviewConflictStatus,
  recommendation?: ScientificReviewRecommendation | null,
): ScientificReviewValidation[] {
  const errors: ScientificReviewValidation[] = [];

  if (conflictStatus === 'PENDING') {
    errors.push({
      code: 'CONFLICT_PENDING',
      field: 'conflictStatus',
      message: 'Declare se existe conflito de interesse antes de enviar o parecer.',
    });
  }

  if (conflictStatus === 'CONFLICT') {
    errors.push({
      code: 'CONFLICT_DECLARED',
      field: 'conflictStatus',
      message: 'Este parecer não pode ser enviado enquanto houver conflito de interesse declarado.',
    });
  }

  if (!recommendation) {
    errors.push({
      code: 'RECOMMENDATION_REQUIRED',
      field: 'recommendation',
      message: 'Informe a recomendação do parecer antes de enviar.',
    });
  }

  const criteriaById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const scoreIds = new Set<string>();

  for (const score of scores) {
    if (scoreIds.has(score.criterionId)) {
      errors.push({
        code: 'DUPLICATED_CRITERION',
        field: 'scores',
        message: 'Cada critério deve possuir apenas uma nota no parecer.',
      });
      continue;
    }
    scoreIds.add(score.criterionId);

    const criterion = criteriaById.get(score.criterionId);
    if (!criterion) {
      errors.push({
        code: 'UNKNOWN_CRITERION',
        field: 'scores',
        message: 'Existe uma nota vinculada a um critério que não pertence a esta avaliação.',
      });
      continue;
    }

    if (score.value < criterion.minScore || score.value > criterion.maxScore) {
      errors.push({
        code: 'SCORE_OUT_OF_RANGE',
        field: `scores.${score.criterionId}`,
        message: `A nota deste critério deve ficar entre ${criterion.minScore} e ${criterion.maxScore}.`,
      });
    }
  }

  for (const criterion of criteria) {
    if (criterion.required && !scoreIds.has(criterion.id)) {
      errors.push({
        code: 'REQUIRED_CRITERION_MISSING',
        field: `scores.${criterion.id}`,
        message: 'Preencha todos os critérios obrigatórios antes de enviar o parecer.',
      });
    }
  }

  return errors;
}

export function calculateWeightedReviewScore(
  criteria: ScientificReviewCriterionRule[],
  scores: ScientificReviewScoreDraft[],
): number | null {
  const criteriaById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  let weightedSum = 0;
  let totalWeight = 0;

  for (const score of scores) {
    const criterion = criteriaById.get(score.criterionId);
    if (!criterion) continue;
    const weight = criterion.weight == null ? 1 : criterion.weight;
    if (weight <= 0) continue;
    weightedSum += score.value * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}
