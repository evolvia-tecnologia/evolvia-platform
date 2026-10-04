export type AuthorSubmissionInput = {
  modalityId: string;
  title: string;
  abstractText: string;
  keywords: string[];
  institution: string;
  taxonomyAreaId: string | null;
  taxonomySubareaId: string | null;
  presentationFormatCode: string | null;
  scientificName: string;
  institutionAddress: string;
  fundingAgency: string;
  conflictDeclared: boolean | null;
  conflictDetail: string;
  referencesText: string;
  proceedingsAuthorizationAccepted: boolean;
};

export type AbstractRule = {
  enabled: boolean;
  unit: 'CHARACTERS' | 'WORDS';
  min: number;
  max: number;
};

export class AuthorSubmissionPolicyError extends Error {}

const ID = /^[a-z0-9]{10,40}$/u;
const KEY = /^[A-Za-z0-9._:-]{16,128}$/u;
const FORMAT_CODE = /^[A-Z0-9_]{2,40}$/u;
const UNSAFE_TEXT = /\u0000|javascript\s*:|data\s*:\s*text\/html|<\s*(?:\/?\s*[a-z][^>]*>|!|\?)/iu;

export function assertPlainParticipantText(value: string, label: string) {
  if (UNSAFE_TEXT.test(value)) throw new AuthorSubmissionPolicyError(`${label} contém conteúdo não permitido.`);
}

export function countAbstractUnits(text: string, unit: AbstractRule['unit']) {
  if (unit === 'WORDS') return text.trim() ? text.trim().split(/\s+/u).length : 0;
  return text.length;
}

export function assertAbstractWithinEvent(text: string, rule: AbstractRule) {
  if (!rule.enabled) {
    if (text.length > 0) throw new AuthorSubmissionPolicyError('Este evento não coleta resumo digitado.');
    return;
  }
  const count = countAbstractUnits(text, rule.unit);
  const unitLabel = rule.unit === 'WORDS' ? 'palavras' : 'caracteres';
  if (count < rule.min || count > rule.max) {
    throw new AuthorSubmissionPolicyError(`O resumo deve ter entre ${rule.min} e ${rule.max} ${unitLabel}.`);
  }
}

function optionalPlainText(value: unknown, label: string, maxLength: number) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw new AuthorSubmissionPolicyError(`${label} inválido.`);
  const text = value.trim();
  if (text.length > maxLength) throw new AuthorSubmissionPolicyError(`${label} muito longo.`);
  assertPlainParticipantText(text, label);
  return text;
}

export function normalizeSubmissionKey(value: unknown): string {
  if (typeof value !== 'string' || !KEY.test(value)) throw new AuthorSubmissionPolicyError('Chave da submissão inválida.');
  return value;
}

export function normalizeAuthorSubmission(value: unknown): AuthorSubmissionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthorSubmissionPolicyError('Preencha o trabalho.');
  const raw = value as Record<string, unknown>;
  const modalityId = raw.modalityId;
  const title = typeof raw.title === 'string' ? raw.title.trim().replace(/\s+/gu, ' ') : '';
  const abstractText = typeof raw.abstractText === 'string' ? raw.abstractText.trim() : '';
  const institution = typeof raw.institution === 'string' ? raw.institution.trim().replace(/\s+/gu, ' ') : '';
  const area = raw.taxonomyAreaId || null;
  const subarea = raw.taxonomySubareaId || null;
  if (typeof modalityId !== 'string' || !ID.test(modalityId)) throw new AuthorSubmissionPolicyError('Selecione uma modalidade.');
  if (title.length < 5 || title.length > 1000) throw new AuthorSubmissionPolicyError('O título deve ter entre 5 e 1000 caracteres.');
  assertPlainParticipantText(title, 'Título');
  if (abstractText.length > 20000) throw new AuthorSubmissionPolicyError('O resumo excede o limite seguro de 20000 caracteres.');
  assertPlainParticipantText(abstractText, 'Resumo');
  if (institution.length > 160) throw new AuthorSubmissionPolicyError('Instituição muito longa.');
  assertPlainParticipantText(institution, 'Instituição');
  const presentationFormatCode = raw.presentationFormatCode == null || raw.presentationFormatCode === ''
    ? null
    : raw.presentationFormatCode;
  if (presentationFormatCode !== null && (typeof presentationFormatCode !== 'string' || !FORMAT_CODE.test(presentationFormatCode))) {
    throw new AuthorSubmissionPolicyError('Forma de apresentação inválida.');
  }
  const scientificName = optionalPlainText(raw.scientificName, 'Nome científico', 120);
  const institutionAddress = optionalPlainText(raw.institutionAddress, 'Endereço da instituição', 240);
  const fundingAgency = optionalPlainText(raw.fundingAgency, 'Agência de fomento', 160);
  const conflictDetail = optionalPlainText(raw.conflictDetail, 'Conflito de interesse', 500);
  const referencesText = optionalPlainText(raw.referencesText, 'Referências', 8000);
  const conflictDeclared = raw.conflictDeclared == null ? null : raw.conflictDeclared;
  if (conflictDeclared !== null && typeof conflictDeclared !== 'boolean') {
    throw new AuthorSubmissionPolicyError('Informe o conflito de interesse como sim ou não.');
  }
  const proceedingsAuthorizationAccepted = raw.proceedingsAuthorizationAccepted ?? false;
  if (typeof proceedingsAuthorizationAccepted !== 'boolean') {
    throw new AuthorSubmissionPolicyError('A autorização dos anais precisa ser confirmada ou recusada.');
  }
  if (!Array.isArray(raw.keywords) || raw.keywords.length > 20 || raw.keywords.some((item) => typeof item !== 'string')) {
    throw new AuthorSubmissionPolicyError('Informe as palavras-chave.');
  }
  const keywords = (raw.keywords as string[]).map((item) => item.trim().replace(/\s+/gu, ' '));
  if (keywords.some((item) => item.length < 2 || item.length > 80) || new Set(keywords.map((item) => item.toLocaleLowerCase('pt-BR'))).size !== keywords.length) {
    throw new AuthorSubmissionPolicyError('Palavras-chave inválidas ou repetidas.');
  }
  if (area !== null && (typeof area !== 'string' || !ID.test(area))) throw new AuthorSubmissionPolicyError('Área inválida.');
  if (subarea !== null && (typeof subarea !== 'string' || !ID.test(subarea))) throw new AuthorSubmissionPolicyError('Subárea inválida.');
  if (subarea && !area) throw new AuthorSubmissionPolicyError('Selecione a área da subárea.');
  return {
    modalityId, title, abstractText, keywords, institution,
    taxonomyAreaId: area as string | null, taxonomySubareaId: subarea as string | null,
    presentationFormatCode, scientificName, institutionAddress, fundingAgency,
    conflictDeclared, conflictDetail, referencesText, proceedingsAuthorizationAccepted,
  };
}
