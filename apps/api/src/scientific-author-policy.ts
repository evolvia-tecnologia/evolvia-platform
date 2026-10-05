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
  coauthors: AuthorCoauthorInput[];
  submitterPresenter: boolean;
  submitterCorresponding: boolean;
  submitterSortOrder: number;
};

export type AuthorCoauthorInput = {
  name: string;
  email: string;
  institution: string;
  presenter: boolean;
  corresponding: boolean;
  sortOrder: number | null;
};

export type AuthorRosterRules = {
  minAuthors: number;
  maxAuthors: number | null;
  maxPresenters: number;
  requirePresenter: boolean;
  requireCorrespondingAuthor: boolean;
  requireAuthorInstitution: boolean;
  collectAdditionalAuthors?: boolean;
  collectAuthorOrder?: boolean;
  collectAuthorInstitution?: boolean;
  requireSubmitterAsFirstAuthor?: boolean;
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
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
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
  const submitterPresenter = raw.submitterPresenter === undefined ? true : raw.submitterPresenter;
  const submitterCorresponding = raw.submitterCorresponding === undefined ? true : raw.submitterCorresponding;
  if (typeof submitterPresenter !== 'boolean' || typeof submitterCorresponding !== 'boolean') {
    throw new AuthorSubmissionPolicyError('Informe apresentador e autor correspondente como sim ou não.');
  }
  const submitterSortOrder = raw.submitterSortOrder == null || raw.submitterSortOrder === '' ? 1 : raw.submitterSortOrder;
  if (!isAuthorOrder(submitterSortOrder)) throw new AuthorSubmissionPolicyError('A ordem de autoria é inválida.');
  return {
    modalityId, title, abstractText, keywords, institution,
    taxonomyAreaId: area as string | null, taxonomySubareaId: subarea as string | null,
    presentationFormatCode, scientificName, institutionAddress, fundingAgency,
    conflictDeclared, conflictDetail, referencesText, proceedingsAuthorizationAccepted,
    coauthors: normalizeCoauthors(raw.coauthors),
    submitterPresenter, submitterCorresponding, submitterSortOrder,
  };
}

function isAuthorOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20;
}

function normalizeCoauthors(value: unknown): AuthorCoauthorInput[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 19) throw new AuthorSubmissionPolicyError('A lista de coautores é inválida.');
  const emails = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new AuthorSubmissionPolicyError('Coautor inválido.');
    const raw = item as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/gu, ' ') : '';
    const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
    const institution = typeof raw.institution === 'string' ? raw.institution.trim().replace(/\s+/gu, ' ') : '';
    const presenter = raw.presenter === true;
    const corresponding = raw.corresponding === true;
    if (name.length < 2 || name.length > 120) throw new AuthorSubmissionPolicyError(`Informe o nome do coautor ${index + 1}.`);
    assertPlainParticipantText(name, 'Nome do coautor');
    if (!EMAIL.test(email) || email.length > 160) throw new AuthorSubmissionPolicyError(`Informe o e-mail do coautor ${index + 1}.`);
    if (institution.length > 160) throw new AuthorSubmissionPolicyError('Instituição do coautor muito longa.');
    assertPlainParticipantText(institution, 'Instituição do coautor');
    if (emails.has(email)) throw new AuthorSubmissionPolicyError('Há coautores com o mesmo e-mail.');
    emails.add(email);
    const sortOrder = raw.sortOrder == null || raw.sortOrder === '' ? null : raw.sortOrder;
    if (sortOrder !== null && !isAuthorOrder(sortOrder)) throw new AuthorSubmissionPolicyError('A ordem de autoria é inválida.');
    return { name, email, institution, presenter, corresponding, sortOrder };
  });
}

export function assertAuthorRoster(
  submitterEmail: string,
  input: Pick<AuthorSubmissionInput, 'coauthors' | 'submitterPresenter' | 'submitterCorresponding' | 'institution' | 'submitterSortOrder'>,
  rules: AuthorRosterRules,
) {
  const email = submitterEmail.trim().toLowerCase();
  const collectAdditionalAuthors = rules.collectAdditionalAuthors !== false;
  const collectAuthorInstitution = rules.collectAuthorInstitution !== false;
  const collectAuthorOrder = rules.collectAuthorOrder === true;
  if (!collectAdditionalAuthors && input.coauthors.length > 0) {
    throw new AuthorSubmissionPolicyError('Este evento aceita apenas quem envia a inscrição.');
  }
  if (input.coauthors.some((author) => author.email === email)) {
    throw new AuthorSubmissionPolicyError('O coautor não pode repetir o e-mail de quem envia o trabalho.');
  }
  const roster = [
    { presenter: input.submitterPresenter, corresponding: input.submitterCorresponding, institution: input.institution, sortOrder: input.submitterSortOrder },
    ...input.coauthors,
  ];
  if (roster.length < rules.minAuthors) {
    throw new AuthorSubmissionPolicyError(rules.minAuthors === 1
      ? 'Inclua quem envia a inscrição.'
      : `Inclua pelo menos ${rules.minAuthors} autores.`);
  }
  if (rules.maxAuthors != null && roster.length > rules.maxAuthors) {
    throw new AuthorSubmissionPolicyError(`Este evento aceita no máximo ${rules.maxAuthors} autores.`);
  }
  if (!collectAuthorInstitution && roster.some((author) => author.institution.trim().length > 0)) {
    throw new AuthorSubmissionPolicyError('Este evento não pede instituição.');
  }
  if (collectAuthorInstitution && rules.requireAuthorInstitution && roster.some((author) => author.institution.trim().length < 2)) {
    throw new AuthorSubmissionPolicyError('Informe a instituição de cada autor.');
  }
  if (collectAuthorOrder) {
    const orders = roster.map((author) => author.sortOrder);
    if (orders.some((order) => order == null)) throw new AuthorSubmissionPolicyError('Informe a ordem de cada autor.');
    const sorted = [...orders].sort((left, right) => left! - right!);
    if (sorted.some((order, index) => order !== index + 1)) {
      throw new AuthorSubmissionPolicyError('A ordem de autoria precisa ir de 1 até o número de autores, sem repetir.');
    }
    if (rules.requireSubmitterAsFirstAuthor && input.submitterSortOrder !== 1) {
      throw new AuthorSubmissionPolicyError('Quem envia a inscrição precisa ser o primeiro autor.');
    }
  }
  const presenters = roster.filter((author) => author.presenter).length;
  if (rules.requirePresenter && presenters === 0) throw new AuthorSubmissionPolicyError('Indique quem apresentará o trabalho.');
  if (presenters > rules.maxPresenters) {
    throw new AuthorSubmissionPolicyError(rules.maxPresenters === 1
      ? 'Somente um apresentador pode ser indicado para o trabalho.'
      : `Este trabalho aceita no máximo ${rules.maxPresenters} apresentadores.`);
  }
  if (rules.requireCorrespondingAuthor && !roster.some((author) => author.corresponding)) {
    throw new AuthorSubmissionPolicyError('Indique o autor correspondente.');
  }
}
