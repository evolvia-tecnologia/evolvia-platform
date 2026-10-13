export const SCIENTIFIC_RANKING_CODE = 'scientific_ranking';
export const SCIENTIFIC_RANKING_LIMIT = 80;
export const RANKING_PHASES = ['ELIMINATORY', 'CLASSIFICATORY'] as const;

const ID = /^[a-z0-9]{20,32}$/u;

export class ScientificRankingPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScientificRankingPolicyError';
  }
}

export type RankingPhase = (typeof RANKING_PHASES)[number];

export type RankingRule = {
  cutoff: number;
  phases: Record<string, RankingPhase>;
};

export type RankingCriterion = {
  id: string;
  minScore: number;
  maxScore: number;
  weight: number;
  phase: RankingPhase;
};

export type RankingReview = {
  scores: { criterionId: string; value: number }[];
};

export type RankingWork = {
  submissionId: string;
  title: string;
  status: string;
  reviews: RankingReview[];
};

export type RankingOutcome = 'ELIMINATED' | 'CLASSIFIED' | 'INSUFFICIENT';

export type RankingRow = {
  submissionId: string;
  title: string;
  status: string;
  outcome: RankingOutcome;
  eliminatoryAverage: number | null;
  classificatoryAverage: number | null;
  reviewCount: number;
};

export function normalizeRankingRule(input: unknown, activeIds: readonly string[]): RankingRule {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ScientificRankingPolicyError('Informe o corte e a fase de cada critério.');
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'cutoff,phases') {
    throw new ScientificRankingPolicyError('Informe somente a nota de corte e a fase de cada critério.');
  }
  const phases = record.phases;
  if (!phases || typeof phases !== 'object' || Array.isArray(phases)) {
    throw new ScientificRankingPolicyError('Informe a fase de cada critério.');
  }
  const phaseRecord = phases as Record<string, unknown>;
  const ids = Object.keys(phaseRecord).sort();
  const expected = [...activeIds].sort();
  if (ids.join(',') !== expected.join(',')) {
    throw new ScientificRankingPolicyError('Inclua cada critério ativo uma vez.');
  }
  const normalized: Record<string, RankingPhase> = {};
  for (const id of ids) {
    if (!ID.test(id) || !RANKING_PHASES.includes(phaseRecord[id] as RankingPhase)) {
      throw new ScientificRankingPolicyError('A fase do critério não é válida.');
    }
    normalized[id] = phaseRecord[id] as RankingPhase;
  }
  return { cutoff: cutoffOf(record.cutoff), phases: normalized };
}

export function readRankingRule(config: unknown, activeIds: readonly string[]): RankingRule | null {
  try { return normalizeRankingRule(config, activeIds); }
  catch { return null; }
}

export function rankWorks(rule: RankingRule, criteria: RankingCriterion[], works: RankingWork[]): RankingRow[] {
  const eliminatory = criteria.filter((item) => item.phase === 'ELIMINATORY');
  const rows = works.map((work) => {
    const eliminatoryAverage = averageOf(eliminatory, work.reviews);
    const classificatoryAverage = averageOf(criteria.filter((item) => item.phase === 'CLASSIFICATORY'), work.reviews);
    let outcome: RankingOutcome;
    if (work.reviews.length === 0) outcome = 'INSUFFICIENT';
    else if (eliminatory.length === 0) outcome = classificatoryAverage === null ? 'INSUFFICIENT' : 'CLASSIFIED';
    else if (eliminatoryAverage === null) outcome = 'INSUFFICIENT';
    else if (eliminatoryAverage < rule.cutoff) outcome = 'ELIMINATED';
    else outcome = 'CLASSIFIED';
    return {
      submissionId: work.submissionId,
      title: work.title,
      status: work.status,
      outcome,
      eliminatoryAverage,
      classificatoryAverage,
      reviewCount: work.reviews.length,
    };
  });
  const order = { CLASSIFIED: 0, INSUFFICIENT: 1, ELIMINATED: 2 };
  return rows.sort((left, right) => {
    const outcome = order[left.outcome] - order[right.outcome];
    if (outcome !== 0) return outcome;
    const leftScore = left.classificatoryAverage ?? Number.NEGATIVE_INFINITY;
    const rightScore = right.classificatoryAverage ?? Number.NEGATIVE_INFINITY;
    if (leftScore !== rightScore) return rightScore - leftScore;
    return left.submissionId < right.submissionId ? -1 : left.submissionId > right.submissionId ? 1 : 0;
  });
}

function cutoffOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ScientificRankingPolicyError('A nota de corte precisa ser um número de 0 a 10.');
  }
  const scaled = Math.round(value * 100);
  if (Math.abs(value * 100 - scaled) > 1e-6 || scaled < 0 || scaled > 1000) {
    throw new ScientificRankingPolicyError('A nota de corte vai de 0 a 10, com no máximo duas casas.');
  }
  return scaled / 100;
}

function averageOf(criteria: RankingCriterion[], reviews: RankingReview[]): number | null {
  if (criteria.length === 0) return null;
  const values: number[] = [];
  for (const review of reviews) {
    let weighted = 0;
    let weight = 0;
    for (const criterion of criteria) {
      const score = review.scores.find((item) => item.criterionId === criterion.id);
      if (!score || !Number.isFinite(score.value) || criterion.weight <= 0) continue;
      weighted += normalizeScore(score.value, criterion) * criterion.weight;
      weight += criterion.weight;
    }
    if (weight > 0) values.push(weighted / weight);
  }
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, item) => sum + item, 0) / values.length) * 100) / 100;
}

function normalizeScore(value: number, criterion: RankingCriterion): number {
  if (criterion.maxScore === criterion.minScore) return value >= criterion.minScore ? 10 : 0;
  const ratio = (value - criterion.minScore) / (criterion.maxScore - criterion.minScore);
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(10, Math.max(0, ratio * 10));
}
