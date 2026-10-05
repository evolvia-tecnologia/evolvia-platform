import { AuthorSubmissionPolicyError, assertPlainParticipantText } from './scientific-author-policy';

export type ReviewerOpinion = {
  conflictStatus: 'CLEAR' | 'CONFLICT';
  conflictReason: string;
  recommendation: 'ACCEPT' | 'REJECT' | 'CHANGES' | null;
  authorComment: string;
  confidentialComment: string;
  scores: Array<{ criterionId: string; value: number }>;
  overallScore: number | null;
};

export type ScientificDecision = 'ACCEPTED' | 'REJECTED' | 'ACCEPTED_WITH_CHANGES';

const ID = /^[a-z0-9]{10,40}$/u;

export function normalizeReviewerOpinion(value: unknown): ReviewerOpinion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AuthorSubmissionPolicyError('Preencha o parecer.');
  }
  const raw = value as Record<string, unknown>;
  if (raw.conflictStatus !== 'CLEAR' && raw.conflictStatus !== 'CONFLICT') {
    throw new AuthorSubmissionPolicyError('Declare se existe conflito de interesse.');
  }
  const conflictReason = typeof raw.conflictReason === 'string' ? raw.conflictReason.trim() : '';
  if (conflictReason.length > 500) throw new AuthorSubmissionPolicyError('O motivo do conflito é longo demais.');
  if (conflictReason) assertPlainParticipantText(conflictReason, 'Motivo do conflito');
  if (raw.conflictStatus === 'CONFLICT' && conflictReason.length < 3) {
    throw new AuthorSubmissionPolicyError('Descreva o conflito de interesse.');
  }
  const recommendation = raw.recommendation == null || raw.recommendation === '' ? null : raw.recommendation;
  if (recommendation !== null && recommendation !== 'ACCEPT' && recommendation !== 'REJECT' && recommendation !== 'CHANGES') {
    throw new AuthorSubmissionPolicyError('Recomendação inválida.');
  }
  const authorComment = plain(raw.authorComment, 'Comentário ao autor', 4000);
  const confidentialComment = plain(raw.confidentialComment, 'Comentário à comissão', 4000);
  if (!Array.isArray(raw.scores) || raw.scores.length > 30) throw new AuthorSubmissionPolicyError('Notas inválidas.');
  const scores = raw.scores.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new AuthorSubmissionPolicyError('Nota inválida.');
    const score = item as { criterionId?: unknown; value?: unknown };
    if (typeof score.criterionId !== 'string' || !ID.test(score.criterionId)) throw new AuthorSubmissionPolicyError('Critério inválido.');
    if (typeof score.value !== 'number' || !Number.isFinite(score.value)) throw new AuthorSubmissionPolicyError('Informe uma nota numérica.');
    return { criterionId: score.criterionId, value: score.value };
  });
  const overallScore = raw.overallScore == null || raw.overallScore === '' ? null : raw.overallScore;
  if (overallScore !== null && (typeof overallScore !== 'number' || !Number.isFinite(overallScore))) {
    throw new AuthorSubmissionPolicyError('Informe a nota entre 0 e 10.');
  }
  return {
    conflictStatus: raw.conflictStatus,
    conflictReason,
    recommendation,
    authorComment,
    confidentialComment,
    scores,
    overallScore,
  };
}

export function normalizeScientificDecision(value: unknown): ScientificDecision {
  const decision = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as { status?: unknown }).status
    : undefined;
  if (decision === 'ACCEPTED' || decision === 'REJECTED' || decision === 'ACCEPTED_WITH_CHANGES') return decision;
  throw new AuthorSubmissionPolicyError('Escolha aceite, recusa ou aceite com alteração.');
}

function plain(value: unknown, label: string, maxLength: number) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw new AuthorSubmissionPolicyError(`${label} inválido.`);
  const text = value.trim();
  if (text.length > maxLength) throw new AuthorSubmissionPolicyError(`${label} muito longo.`);
  assertPlainParticipantText(text, label);
  return text;
}
