import { createHash } from 'node:crypto';

export type EventEvaluationQuestion = {
  id: string;
  label: string;
  kind: 'RATING' | 'TEXT';
  required: boolean;
};

export type EventEvaluationConfigInput = {
  active: boolean;
  title: string;
  questions: EventEvaluationQuestion[];
};

export class EventEvaluationPolicyError extends Error {}

const ID = /^[a-z][a-z0-9_]{1,39}$/u;

function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new EventEvaluationPolicyError(`${label} é obrigatório.`);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length < min || normalized.length > max) {
    throw new EventEvaluationPolicyError(`${label} deve ter entre ${min} e ${max} caracteres.`);
  }
  return normalized;
}

export function normalizeEvaluationConfig(raw: unknown): EventEvaluationConfigInput {
  const input = raw as Record<string, unknown> | null;
  if (!input || typeof input !== 'object' || typeof input.active !== 'boolean' || !Array.isArray(input.questions)) {
    throw new EventEvaluationPolicyError('Informe a configuração da avaliação.');
  }
  if (input.questions.length < 1 || input.questions.length > 20) {
    throw new EventEvaluationPolicyError('A avaliação deve ter de 1 a 20 perguntas.');
  }
  const ids = new Set<string>();
  const questions = input.questions.map((rawQuestion, index) => {
    const question = rawQuestion as Record<string, unknown> | null;
    if (!question || typeof question !== 'object') throw new EventEvaluationPolicyError(`Pergunta ${index + 1} inválida.`);
    const id = typeof question.id === 'string' ? question.id.trim().toLowerCase() : '';
    if (!ID.test(id) || ids.has(id)) throw new EventEvaluationPolicyError('Use códigos únicos com letras, números e sublinhado.');
    ids.add(id);
    const kind = question.kind;
    if (kind !== 'RATING' && kind !== 'TEXT') throw new EventEvaluationPolicyError('Tipo de pergunta inválido.');
    return {
      id,
      label: text(question.label, `Pergunta ${index + 1}`, 2, 160),
      kind,
      required: question.required === true,
    };
  });
  return { active: input.active, title: text(input.title, 'Título', 2, 120), questions };
}

export function normalizeEvaluationAnswers(raw: unknown, questions: EventEvaluationQuestion[]): Record<string, number | string> {
  const input = raw as Record<string, unknown> | null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new EventEvaluationPolicyError('Informe as respostas da avaliação.');
  }
  const known = new Set(questions.map((question) => question.id));
  if (Object.keys(input).some((key) => !known.has(key))) {
    throw new EventEvaluationPolicyError('A resposta contém uma pergunta que não pertence a esta avaliação.');
  }
  const answers: Record<string, number | string> = {};
  for (const question of questions) {
    const value = Object.prototype.hasOwnProperty.call(input, question.id) ? input[question.id] : undefined;
    if (value === undefined || value === null || value === '') {
      if (question.required) throw new EventEvaluationPolicyError(`Responda: ${question.label}`);
      continue;
    }
    if (question.kind === 'RATING') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
        throw new EventEvaluationPolicyError(`${question.label}: escolha uma nota de 1 a 5.`);
      }
      answers[question.id] = Number(value);
    } else {
      answers[question.id] = text(value, question.label, 1, 1000);
    }
  }
  return answers;
}

export function evaluationPayloadHash(value: Record<string, number | string>): string {
  return createHash('sha256').update(JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]))).digest('hex');
}
