import {
  CapabilityStatus,
  EventFormat,
  EventProfileCode,
  RegistrationMode,
  WizardSessionStatus,
} from '@prisma/client';
import { PUBLIC_SUBJECT_AREAS } from './event-publication/public-discovery.policy';
import { normalizeEventTimeZone } from './time-zone-policy';

export const PUBLIC_SUBJECT_AREA_IDS = PUBLIC_SUBJECT_AREAS.map((area) => area.id);

export const WIZARD_FLOW_VERSION = 'v2';

export const WIZARD_STEPS = [
  'profile',
  'format',
  'identity',
  'location',
  'registration',
  'capabilities',
  'review',
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export type WizardAnswers = {
  organizationId?: string;
  eventType?: string;
  profileCode?: EventProfileCode;
  format?: EventFormat;
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string;
  datesPending?: boolean;
  estimatedAudience?: number | null;
  audiencePending?: boolean;
  venue?: string | null;
  venuePending?: boolean;
  registrationMode?: RegistrationMode;
  capabilities?: string[];
  capabilitiesCustomized?: boolean;
  subjectAreas?: string[];
};

export const MAX_SUBJECT_AREAS = 3;

export function normalizeSubjectAreas(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { subjectAreas?: unknown }).subjectAreas)
      ? (value as { subjectAreas: unknown[] }).subjectAreas
      : [];
  const allowed = new Set<string>(PUBLIC_SUBJECT_AREA_IDS);
  return [...new Set(source.filter((item): item is string => typeof item === 'string' && allowed.has(item)))].slice(0, MAX_SUBJECT_AREAS);
}

/**
 * Ausência no corpo NÃO é pedido de apagamento.
 *
 * `normalizeWizardAnswers` devolve `[]` tanto para "o cliente mandou lista
 * vazia" quanto para "o cliente nem mandou o campo", e `persistEventData`
 * escrevia esse `[]` direto. Resultado: qualquer salvamento parcial zerava as
 * áreas de atuação do evento — inclusive as definidas pela rota dedicada
 * `PATCH /events/:eventId/subject-areas`.
 *
 * Zero áreas nunca foi estado válido no resto do sistema: `parseSubjectAreas`
 * recusa lista vazia e a conclusão do Wizard exige ao menos uma. Logo,
 * preservar o que está gravado é a leitura coerente de um corpo sem o campo.
 *
 * Devolve CÓPIA de propósito: quem chama não pode acabar segurando a mesma
 * referência que veio do banco.
 */
export function subjectAreasToPersist(
  requested: readonly string[] | undefined,
  current: readonly string[],
): string[] {
  return requested && requested.length > 0 ? [...requested] : [...current];
}

export type SubjectAreasParseResult = { subjectAreas: string[] } | { error: string };

/**
 * Leitura estrita para escrita direta da área: diferente do Wizard, que normaliza
 * respostas parciais, aqui um valor desconhecido ou excedente é recusado em vez de descartado.
 */
export function parseSubjectAreas(value: unknown): SubjectAreasParseResult {
  if (!Array.isArray(value)) return { error: 'Informe as áreas de atuação em uma lista.' };
  const allowed = new Set<string>(PUBLIC_SUBJECT_AREA_IDS);
  if (value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    return { error: 'Escolha somente áreas de atuação do catálogo.' };
  }
  const subjectAreas = [...new Set(value as string[])];
  if (subjectAreas.length === 0) return { error: 'Escolha ao menos uma área de atuação.' };
  if (subjectAreas.length > MAX_SUBJECT_AREAS) {
    return { error: `Escolha no máximo ${MAX_SUBJECT_AREAS} áreas de atuação.` };
  }
  return { subjectAreas };
}

export type CapabilityDefinition = {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  value: string;
  category: 'Essencial' | 'Experiência' | 'Operação' | 'Conteúdo';
  required?: boolean;
};

export const CAPABILITY_CATALOG: readonly CapabilityDefinition[] = [
  { code: 'registration', label: 'Inscrições e participantes', shortLabel: 'Inscrições', description: 'Cadastros, categorias, confirmações e gestão da base de participantes.', value: 'Organiza a jornada desde o primeiro cadastro.', category: 'Essencial', required: true },
  { code: 'payment', label: 'Pagamentos', shortLabel: 'Pagamentos', description: 'Preparação para cobrança, conciliação e regras financeiras do evento.', value: 'Reduz controles manuais e falhas financeiras.', category: 'Essencial' },
  { code: 'communication', label: 'Comunicação com participantes', shortLabel: 'Comunicação', description: 'Mensagens transacionais, avisos e histórico de comunicação.', value: 'Mantém o público informado em cada etapa.', category: 'Experiência' },
  { code: 'credential', label: 'Credenciamento e crachás', shortLabel: 'Credenciamento', description: 'QR Code, credenciais, impressão e atendimento de chegada.', value: 'Agiliza a recepção e melhora a primeira impressão.', category: 'Operação' },
  { code: 'access_control', label: 'Controle de acesso', shortLabel: 'Acessos', description: 'Leitura de QR, pontos de acesso e registros de entrada.', value: 'Traz segurança e dados confiáveis de presença.', category: 'Operação' },
  { code: 'scientific_submission', label: 'Trabalhos científicos', shortLabel: 'Trabalhos', description: 'Submissão, avaliação, pareceres e acompanhamento de autores.', value: 'Centraliza o fluxo científico do evento.', category: 'Conteúdo' },
  { code: 'certificate', label: 'Certificados', shortLabel: 'Certificados', description: 'Emissão por participação, atividade, autoria e apresentação.', value: 'Entrega reconhecimento com rastreabilidade.', category: 'Experiência' },
  { code: 'exhibitor', label: 'Área do expositor', shortLabel: 'Expositores', description: 'Formulários, credenciais, serviços e acompanhamento de estandes.', value: 'Organiza a relação comercial e operacional da feira.', category: 'Operação' },
  { code: 'material_delivery', label: 'Entrega de materiais e kits', shortLabel: 'Materiais', description: 'Controle de retirada, protocolos e rastreabilidade de kits.', value: 'Evita duplicidades e melhora o controle de estoque.', category: 'Operação' },
] as const;

const capabilityCodes = new Set(CAPABILITY_CATALOG.map((item) => item.code));

function normalizeText(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeNullableText(value: unknown, maxLength = 240): string | null | undefined {
  if (value === null) return null;
  return normalizeText(value, maxLength);
}

function normalizeIsoDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 40) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeEstimatedAudience(value: unknown): number | null | undefined {
  if (value === null) return null;

  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d{1,7}$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN;

  if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric > 1_000_000) {
    return undefined;
  }

  return numeric;
}

function profileKey(eventType?: string): string {
  return (eventType ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const CANONICAL_EVENT_TYPE_PROFILES = [
  { eventType: 'Congresso ou evento científico', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Simpósio científico', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Jornada científica', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Seminário acadêmico', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Conferência científica', profileCode: EventProfileCode.SCIENTIFIC_EVENT },
  { eventType: 'Evento corporativo ou treinamento', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Convenção empresarial', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Treinamento', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Workshop', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Curso ou palestra', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Networking ou meetup', profileCode: EventProfileCode.CORPORATE_TRAINING },
  { eventType: 'Feira ou exposição', profileCode: EventProfileCode.FAIR_EXHIBITION },
  { eventType: 'Exposição', profileCode: EventProfileCode.FAIR_EXHIBITION },
  { eventType: 'Show ou entretenimento', profileCode: EventProfileCode.ENTERTAINMENT },
  { eventType: 'Festival', profileCode: EventProfileCode.ENTERTAINMENT },
  { eventType: 'Evento social ou comunitário', profileCode: EventProfileCode.SOCIAL_COMMUNITY },
  { eventType: 'Evento religioso ou beneficente', profileCode: EventProfileCode.SOCIAL_COMMUNITY },
  { eventType: 'Evento esportivo ou torneio', profileCode: EventProfileCode.SOCIAL_COMMUNITY },
  { eventType: 'Corrida', profileCode: EventProfileCode.SOCIAL_COMMUNITY },
  { eventType: 'Outro tipo de evento', profileCode: EventProfileCode.OTHER },
] as const;

const canonicalEventTypeProfiles = new Map<string, EventProfileCode>(
  CANONICAL_EVENT_TYPE_PROFILES.map((item) => [item.eventType, item.profileCode]),
);

export function getRequiredCapabilities(profileCode?: EventProfileCode): string[] {
  const required = new Set<string>(['registration']);

  // Em entretenimento, ingresso e operação de entrada nascem juntos. A
  // customização de outras capabilities não pode remover o controle de acesso.
  if (profileCode === EventProfileCode.ENTERTAINMENT) required.add('access_control');

  return CAPABILITY_CATALOG.map((item) => item.code).filter((code) => required.has(code));
}

export function inferEventProfileCode(eventType?: string): EventProfileCode {
  if (typeof eventType === 'string') {
    const catalogProfile = canonicalEventTypeProfiles.get(eventType.trim());
    if (catalogProfile) return catalogProfile;
  }

  const profile = profileKey(eventType);

  // Fallback conservador para rótulos legados. Marcadores explícitos têm
  // precedência para evitar classificar, por exemplo, uma "Conferência
  // corporativa" como evento científico apenas pela palavra conferência.
  if (/(corporativ|empresarial|treinamento|convencao|work ?shop|curso|palestra|networking|meet ?up)/.test(profile)) {
    return EventProfileCode.CORPORATE_TRAINING;
  }
  if (/(feira|exposicao)/.test(profile)) return EventProfileCode.FAIR_EXHIBITION;
  if (/(show|festival|entretenimento)/.test(profile)) return EventProfileCode.ENTERTAINMENT;
  if (/(social|comunitario|religios|retiro|beneficente|esportiv|torneio|competicao|jogos)/.test(profile)) {
    return EventProfileCode.SOCIAL_COMMUNITY;
  }

  if (/(cientific|congresso|simposio|academi)/.test(profile)) {
    return EventProfileCode.SCIENTIFIC_EVENT;
  }

  const scientificContext = /(cientific|academi|tecnic|pesquis|saude|medic)/;
  const scientificFormat = /(jornada|seminario|conferencia|coloquio|encontro|forum|semana)/;
  if (scientificContext.test(profile) && scientificFormat.test(profile)) {
    return EventProfileCode.SCIENTIFIC_EVENT;
  }

  return EventProfileCode.OTHER;
}

export function getRecommendedCapabilities(
  profileCode?: EventProfileCode,
  registrationMode?: RegistrationMode,
  eventType?: string,
): string[] {
  const selected = new Set<string>(['registration', 'communication']);

  switch (profileCode) {
    case EventProfileCode.SCIENTIFIC_EVENT:
      selected.add('credential');
      selected.add('access_control');
      selected.add('scientific_submission');
      selected.add('certificate');
      break;
    case EventProfileCode.CORPORATE_TRAINING:
      selected.add('credential');
      selected.add('access_control');
      selected.add('certificate');
      selected.add('material_delivery');
      break;
    case EventProfileCode.FAIR_EXHIBITION:
      selected.add('credential');
      selected.add('access_control');
      selected.add('exhibitor');
      break;
    case EventProfileCode.ENTERTAINMENT:
      selected.add('credential');
      selected.add('access_control');
      break;
    case EventProfileCode.SOCIAL_COMMUNITY:
      selected.add('credential');
      // Sugestão só do tipo Corrida. Social, religioso e esportivo geral
      // continuam sem entrega de material. O recurso não é obrigatório.
      if (eventType?.trim() === 'Corrida') selected.add('material_delivery');
      break;
    default:
      break;
  }

  if (registrationMode === RegistrationMode.PAID) selected.add('payment');
  for (const code of getRequiredCapabilities(profileCode)) selected.add(code);
  return CAPABILITY_CATALOG.map((item) => item.code).filter((code) => selected.has(code));
}

export function normalizeCapabilities(
  value: unknown,
  profileCode?: EventProfileCode,
): string[] {
  const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const normalized = new Set(selected.map((item) => item.trim()).filter((item) => capabilityCodes.has(item)));
  for (const code of getRequiredCapabilities(profileCode)) normalized.add(code);
  return CAPABILITY_CATALOG.map((item) => item.code).filter((code) => normalized.has(code));
}

export function normalizeWizardAnswers(value: unknown): WizardAnswers {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const format = Object.values(EventFormat).includes(source.format as EventFormat) ? (source.format as EventFormat) : undefined;
  const registrationMode = Object.values(RegistrationMode).includes(source.registrationMode as RegistrationMode) ? (source.registrationMode as RegistrationMode) : undefined;
  const eventType = normalizeText(source.eventType, 120);
  const profileCode = Object.values(EventProfileCode).includes(source.profileCode as EventProfileCode)
    ? (source.profileCode as EventProfileCode)
    : inferEventProfileCode(eventType);
  const customized = source.capabilitiesCustomized === true;
  const recommended = getRecommendedCapabilities(profileCode, registrationMode, eventType);
  const capabilities = customized
    ? normalizeCapabilities(source.capabilities, profileCode)
    : normalizeCapabilities(recommended, profileCode);
  const estimatedAudience = normalizeEstimatedAudience(source.estimatedAudience);
  const audiencePending = (estimatedAudience === undefined || estimatedAudience === null)
    && source.audiencePending === true;

  return {
    organizationId: normalizeText(source.organizationId, 64),
    eventType,
    profileCode,
    format,
    name: normalizeText(source.name, 120),
    startDate: normalizeIsoDate(source.startDate),
    endDate: normalizeIsoDate(source.endDate),
    timeZone: normalizeEventTimeZone(source.timeZone),
    datesPending: source.datesPending === true,
    estimatedAudience,
    audiencePending,
    venue: normalizeNullableText(source.venue, 240),
    venuePending: source.venuePending === true,
    registrationMode,
    capabilities,
    capabilitiesCustomized: customized,
    subjectAreas: normalizeSubjectAreas(source.subjectAreas),
  };
}

export function getWizardCompletion(answers: WizardAnswers): number {
  const checks = [
    Boolean(answers.eventType && answers.profileCode && answers.subjectAreas?.length),
    Boolean(answers.format),
    Boolean(answers.name && answers.timeZone && (answers.startDate || answers.datesPending)),
    Boolean(answers.venue || answers.venuePending),
    Boolean(answers.registrationMode),
    Boolean(answers.registrationMode && answers.capabilities?.length),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 92);
}

/**
 * Invariantes que valem em TODO salvamento, não só na conclusão.
 *
 * A ordem das datas estava só em `getWizardCompletionIssues`, chamada apenas
 * por `complete()`. O `save()` ia direto gravar, então um PATCH com término
 * anterior ao início persistia o intervalo invertido e respondia 200.
 *
 * Comparar com `<` e não `<=` é deliberado: evento que começa e termina no
 * mesmo instante é legítimo. Há teste de fronteira para isso.
 *
 * Rascunho com uma data só continua podendo ser salvo: a regra exige as duas
 * para comparar.
 */
export function getWizardSaveIssues(answers: WizardAnswers): string[] {
  const issues: string[] = [];
  if (
    answers.startDate
    && answers.endDate
    && new Date(answers.endDate) < new Date(answers.startDate)
  ) {
    issues.push('A data de término não pode ser anterior à data de início.');
  }
  return issues;
}

export function getWizardCompletionIssues(answers: WizardAnswers): string[] {
  const issues: string[] = [];
  if (!answers.eventType || !answers.profileCode) issues.push('Escolha o perfil do evento.');
  if (!answers.subjectAreas?.length) issues.push('Escolha ao menos uma área de atuação.');
  if (!answers.format) issues.push('Escolha o formato do evento.');
  if (!answers.name || answers.name.trim().length < 3) issues.push('Informe um nome com pelo menos 3 caracteres.');
  if (!answers.startDate && !answers.datesPending) issues.push('Informe a data de início ou marque que será definida depois.');
  if (!answers.timeZone) issues.push('Escolha o fuso horário do evento.');
  // Mesma regra de `save()`, chamada e não repetida: duas cópias da comparação
  // seriam duas chances de divergirem.
  issues.push(...getWizardSaveIssues(answers));
  if (!answers.venue && !answers.venuePending) issues.push('Informe o local ou marque que será definido depois.');
  if (!answers.registrationMode) issues.push('Escolha o modelo de inscrição.');
  if (!answers.capabilities?.includes('registration')) issues.push('A capacidade de inscrições é obrigatória.');
  if (
    answers.profileCode === EventProfileCode.ENTERTAINMENT
    && !answers.capabilities?.includes('access_control')
  ) {
    issues.push('Controle de acesso é obrigatório para eventos de show ou entretenimento.');
  }
  return issues;
}

export function isWizardStep(value: string): value is WizardStep {
  return (WIZARD_STEPS as readonly string[]).includes(value);
}

export function publicWizardSession<T extends { completionPercent: number; status: WizardSessionStatus }>(session: T): T & { completionPercent: number } {
  return { ...session, completionPercent: session.status === WizardSessionStatus.COMPLETED ? 100 : session.completionPercent };
}

export function capabilityStatus(selected: boolean): CapabilityStatus {
  return selected ? CapabilityStatus.ACTIVE : CapabilityStatus.DISABLED;
}
