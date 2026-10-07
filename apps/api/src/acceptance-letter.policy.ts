export class DecisionLetterPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionLetterPolicyError';
  }
}

export const DECISION_LETTER_TAGS = ['NOME', 'EVENTO', 'TITULO', 'MODALIDADE', 'VERSAO', 'SITUACAO', 'CODIGO', 'DATA'] as const;
export const DECISION_LETTER_BODY_MAX = 4000;

export const DEFAULT_ACCEPTANCE_LETTER_BODY = `**Carta de aceite**

{EVENTO} registra o trabalho **{TITULO}**, de {NOME}.

- Situação: {SITUACAO}
- Modalidade: {MODALIDADE}
- Versão: {VERSAO}
- Código: {CODIGO}

Esta carta confirma a decisão registrada neste evento. Não é certificado e não substitui a credencial.
Pareceres, notas e nomes de avaliadores não entram nesta carta.

Documento gerado em {DATA}.`;

export const DEFAULT_REJECTION_LETTER_BODY = `**Carta de recusa**

{EVENTO} registra o trabalho **{TITULO}**, de {NOME}.

- Situação: {SITUACAO}
- Modalidade: {MODALIDADE}
- Versão: {VERSAO}
- Código: {CODIGO}

Esta carta confirma a decisão registrada neste evento. Não é certificado e não substitui a credencial.
Pareceres, notas e nomes de avaliadores não entram nesta carta.

Documento gerado em {DATA}.`;

const TAG = /\{([A-Za-z0-9_]+)\}/g;
const KNOWN_TAG = /\{(NOME|EVENTO|TITULO|MODALIDADE|VERSAO|SITUACAO|CODIGO|DATA)\}/gu;
const ALLOWED_TAGS = new Set<string>(DECISION_LETTER_TAGS);
const SITUATION = {
  ACCEPTED: 'Aceito',
  ACCEPTED_WITH_CHANGES: 'Aceito com alterações',
  REJECTED: 'Recusado',
} as const;

export type DecisionLetterStatus = keyof typeof SITUATION;

const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function normalizeDecisionLetterBody(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new DecisionLetterPolicyError(`Informe o texto da ${label}.`);
  }
  const text = value.replace(/\r\n/g, '\n');
  if (text.trim() === '') return null;
  if (text.length > DECISION_LETTER_BODY_MAX) {
    throw new DecisionLetterPolicyError(`O texto da ${label} passa de ${DECISION_LETTER_BODY_MAX} caracteres.`);
  }
  if (/[<>]/.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new DecisionLetterPolicyError('Use a formatação do editor. HTML não entra na carta.');
  }
  const unknown = [...text.matchAll(TAG)].map((match) => match[1]).find((tag) => !ALLOWED_TAGS.has(tag));
  if (unknown) {
    throw new DecisionLetterPolicyError(`A tag {${unknown}} não existe. Use {NOME}, {EVENTO}, {TITULO}, {MODALIDADE}, {VERSAO}, {SITUACAO}, {CODIGO} ou {DATA}.`);
  }
  return text;
}

function plain(value: string): string {
  const cleaned = value.replace(/[<>{}]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim();
  return cleaned || 'não informado';
}

export function renderDecisionLetterTemplate(template: string, values: {
  name: string;
  eventName: string;
  title: string;
  modality: string;
  version: string;
  situation: string;
  code: string;
  issuedAt: Date;
}): string {
  const issued = values.issuedAt;
  const date = Number.isNaN(issued.getTime()) ? 'não informada' : dateLabel.format(issued);
  const map: Record<(typeof DECISION_LETTER_TAGS)[number], string> = {
    NOME: plain(values.name),
    EVENTO: plain(values.eventName),
    TITULO: plain(values.title),
    MODALIDADE: plain(values.modality),
    VERSAO: plain(values.version),
    SITUACAO: plain(values.situation),
    CODIGO: plain(values.code),
    DATA: date,
  };
  return template.replace(KNOWN_TAG, (_full, tag: (typeof DECISION_LETTER_TAGS)[number]) => map[tag]);
}

export function decisionLetterDocument(input: {
  status: DecisionLetterStatus;
  eventName: string;
  title: string;
  modality: string;
  version: number;
  authors: string[];
  stationPublicCode: number | null;
  issuedAt: Date;
  acceptanceBody: string | null;
  rejectionBody: string | null;
}): { kind: 'acceptance' | 'rejection'; headline: string; text: string } {
  const rejection = input.status === 'REJECTED';
  const headline = input.status === 'ACCEPTED'
    ? 'Carta de aceite'
    : input.status === 'ACCEPTED_WITH_CHANGES'
      ? 'Carta de aceite com alterações'
      : 'Carta de recusa';
  const template = rejection
    ? input.rejectionBody?.trim() || DEFAULT_REJECTION_LETTER_BODY
    : input.acceptanceBody?.trim() || DEFAULT_ACCEPTANCE_LETTER_BODY;
  const authors = input.authors.map((name) => name.trim()).filter(Boolean).join(', ') || 'Autor da inscrição';
  const text = renderDecisionLetterTemplate(template, {
    name: authors,
    eventName: input.eventName,
    title: input.title,
    modality: input.modality,
    version: String(input.version),
    situation: SITUATION[input.status],
    code: input.stationPublicCode == null ? '' : String(input.stationPublicCode),
    issuedAt: input.issuedAt,
  });
  return { kind: rejection ? 'rejection' : 'acceptance', headline, text };
}
