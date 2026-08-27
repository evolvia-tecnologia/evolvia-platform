import {
  CapabilityStatus,
  EventFormat,
  EventProfileCode,
  RegistrationMode,
  WizardSessionStatus,
} from '@prisma/client';
import { normalizeEventTimeZone } from './time-zone-policy';

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
};

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
  return (eventType ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function inferEventProfileCode(eventType?: string): EventProfileCode {
  const profile = profileKey(eventType);

  // Marcadores explícitos têm precedência para evitar classificar, por exemplo,
  // uma "Conferência corporativa" como evento científico apenas pela palavra conferência.
  if (/(corporativ|empresarial|treinamento|convencao|work ?shop)/.test(profile)) {
    return EventProfileCode.CORPORATE_TRAINING;
  }
  if (/(feira|exposicao)/.test(profile)) return EventProfileCode.FAIR_EXHIBITION;
  if (/(show|festival|entretenimento)/.test(profile)) return EventProfileCode.ENTERTAINMENT;
  if (/(social|comunitario)/.test(profile)) return EventProfileCode.SOCIAL_COMMUNITY;

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
      break;
    default:
      break;
  }

  if (registrationMode === RegistrationMode.PAID) selected.add('payment');
  return CAPABILITY_CATALOG.map((item) => item.code).filter((code) => selected.has(code));
}

export function normalizeCapabilities(value: unknown): string[] {
  const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const normalized = new Set(selected.map((item) => item.trim()).filter((item) => capabilityCodes.has(item)));
  normalized.add('registration');
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
  const recommended = getRecommendedCapabilities(profileCode, registrationMode);
  const capabilities = customized ? normalizeCapabilities(source.capabilities) : normalizeCapabilities(recommended);
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
  };
}

export function getWizardCompletion(answers: WizardAnswers): number {
  const checks = [
    Boolean(answers.eventType && answers.profileCode),
    Boolean(answers.format),
    Boolean(answers.name && answers.timeZone && (answers.startDate || answers.datesPending)),
    Boolean(answers.venue || answers.venuePending),
    Boolean(answers.registrationMode),
    Boolean(answers.registrationMode && answers.capabilities?.length),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 92);
}

export function getWizardCompletionIssues(answers: WizardAnswers): string[] {
  const issues: string[] = [];
  if (!answers.eventType || !answers.profileCode) issues.push('Escolha o perfil do evento.');
  if (!answers.format) issues.push('Escolha o formato do evento.');
  if (!answers.name) issues.push('Informe o nome do evento.');
  if (!answers.startDate && !answers.datesPending) issues.push('Informe a data de início ou marque que será definida depois.');
  if (!answers.timeZone) issues.push('Escolha o fuso horário do evento.');
  if (answers.startDate && answers.endDate && new Date(answers.endDate) < new Date(answers.startDate)) issues.push('A data de término não pode ser anterior à data de início.');
  if (!answers.venue && !answers.venuePending) issues.push('Informe o local ou marque que será definido depois.');
  if (!answers.registrationMode) issues.push('Escolha o modelo de inscrição.');
  if (!answers.capabilities?.includes('registration')) issues.push('A capacidade de inscrições é obrigatória.');
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
