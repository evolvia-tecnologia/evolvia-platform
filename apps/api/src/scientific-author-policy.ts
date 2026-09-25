export type AuthorSubmissionInput = {
  modalityId: string;
  title: string;
  abstractText: string;
  keywords: string[];
  institution: string;
  taxonomyAreaId: string | null;
  taxonomySubareaId: string | null;
};

export class AuthorSubmissionPolicyError extends Error {}

const ID = /^[a-z0-9]{10,40}$/u;
const KEY = /^[A-Za-z0-9._:-]{16,128}$/u;

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
  if (abstractText.length < 30 || abstractText.length > 10000) throw new AuthorSubmissionPolicyError('O resumo deve ter entre 30 e 10000 caracteres.');
  if (institution.length > 160) throw new AuthorSubmissionPolicyError('Instituição muito longa.');
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
  return { modalityId, title, abstractText, keywords, institution, taxonomyAreaId: area as string | null, taxonomySubareaId: subarea as string | null };
}
