import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationTermsDocumentState } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { readPostEventReport } from './post-event-report-reader';
import { PrismaService } from './prisma.service';
import { RegistrationTermsDocumentService } from './registration-terms-document.service';

type FieldType = 'TEXT' | 'TEXTAREA' | 'EMAIL' | 'PHONE' | 'DOCUMENT' | 'CNPJ' | 'DATE' | 'NUMBER' | 'SELECT' | 'RADIO' | 'CHECKBOX' | 'PHOTO' | 'CONSENT' | 'REGISTRATION_TYPE';
type FieldOption = { id: string; label: string };
type FieldCondition = { fieldId: string; operator: 'EQUALS' | 'NOT_EQUALS'; value: string };
export type RegistrationField = {
  id: string;
  code: string;
  label: string;
  category: string;
  type: FieldType;
  required: boolean;
  enabled?: boolean;
  locked?: boolean;
  sensitive?: boolean;
  help?: string;
  placeholder?: string;
  options?: FieldOption[];
  condition?: FieldCondition;
  appliesToCategoryIds?: string[];
};
export type SaveRegistrationFormInput = { expectedRevision: number; fields: RegistrationField[] };

const ESSENTIAL_FIELDS: RegistrationField[] = [
  { id: 'essential-full-name', code: 'full_name', label: 'Nome completo', category: 'Identificação', type: 'TEXT', required: true, enabled: true, locked: true },
  { id: 'essential-preferred-name', code: 'preferred_name', label: 'Como deseja ser chamado', category: 'Identificação', type: 'TEXT', required: true, enabled: true, locked: true },
  { id: 'essential-identity-document', code: 'identity_document', label: 'CPF ou documento estrangeiro', category: 'Identificação', type: 'DOCUMENT', required: true, enabled: true, locked: true, sensitive: true, help: 'Informe o CPF ou, para participante estrangeiro, o documento de identificação.' },
  { id: 'essential-email', code: 'email', label: 'E-mail', category: 'Contato', type: 'EMAIL', required: true, enabled: true, locked: true },
  { id: 'essential-phone', code: 'phone', label: 'Celular / WhatsApp', category: 'Contato', type: 'PHONE', required: true, enabled: true, locked: true },
  { id: 'essential-registration-type', code: 'registration_type', label: 'Tipo / categoria de inscrição', category: 'Dados da inscrição', type: 'REGISTRATION_TYPE', required: true, enabled: true, locked: true, help: 'As opções vêm das categorias configuradas para o evento.' },
  { id: 'essential-terms', code: 'terms_acceptance', label: 'Aceito os termos de inscrição e a Política de Privacidade', category: 'LGPD e autorizações', type: 'CONSENT', required: true, enabled: true, locked: true },
];

export const REGISTRATION_FIELD_CATALOG = [
  ...ESSENTIAL_FIELDS,
  { code: 'social_name', label: 'Nome social', category: 'Identificação', type: 'TEXT' },
  { code: 'birth_date', label: 'Data de nascimento', category: 'Identificação', type: 'DATE', sensitive: true },
  { code: 'sex', label: 'Sexo', category: 'Identificação', type: 'SELECT', sensitive: true, options: [{ id: 'female', label: 'Feminino' }, { id: 'male', label: 'Masculino' }, { id: 'not_informed', label: 'Prefiro não informar' }, { id: 'self_described', label: 'Outro / autodescrição' }] },
  { code: 'participant_photo', label: 'Foto do participante', category: 'Identificação', type: 'PHOTO', sensitive: true, help: 'Captura ou envio de foto no ato da inscrição, quando necessário ao credenciamento.' },

  { code: 'institution', label: 'Empresa / instituição', category: 'Dados profissionais', type: 'TEXT' },
  { code: 'job_title', label: 'Cargo / função', category: 'Dados profissionais', type: 'TEXT' },
  { code: 'practice_area', label: 'Área de atuação', category: 'Dados profissionais', type: 'TEXT' },
  { code: 'profession', label: 'Profissão', category: 'Dados profissionais', type: 'TEXT' },
  { code: 'cnpj', label: 'CNPJ', category: 'Dados profissionais', type: 'CNPJ', sensitive: true, help: 'Aceita o CNPJ numérico atual e o novo CNPJ alfanumérico.', placeholder: 'Ex.: 12.345.678/0001-95 ou 12.ABC.345/01DE-35' },
  { code: 'professional_city', label: 'Cidade da empresa / instituição', category: 'Dados profissionais', type: 'TEXT' },
  { code: 'professional_state', label: 'Estado / UF da empresa', category: 'Dados profissionais', type: 'TEXT' },
  { code: 'professional_country', label: 'País da empresa', category: 'Dados profissionais', type: 'TEXT' },

  { code: 'postal_code', label: 'CEP / código postal', category: 'Endereço', type: 'TEXT', sensitive: true },
  { code: 'street', label: 'Logradouro', category: 'Endereço', type: 'TEXT', sensitive: true },
  { code: 'address_number', label: 'Número', category: 'Endereço', type: 'TEXT', sensitive: true },
  { code: 'address_complement', label: 'Complemento', category: 'Endereço', type: 'TEXT', sensitive: true },
  { code: 'district', label: 'Bairro', category: 'Endereço', type: 'TEXT', sensitive: true },
  { code: 'city', label: 'Cidade', category: 'Endereço', type: 'TEXT' },
  { code: 'state', label: 'Estado / UF', category: 'Endereço', type: 'TEXT' },
  { code: 'country', label: 'País', category: 'Endereço', type: 'TEXT' },

  { code: 'interest_area', label: 'Área de interesse', category: 'Informações do evento', type: 'TEXT' },
  { code: 'interest_topic', label: 'Tema de interesse', category: 'Informações do evento', type: 'TEXT' },
  { code: 'specialty', label: 'Especialidade', category: 'Informações do evento', type: 'TEXT' },
  { code: 'education_level', label: 'Formação acadêmica', category: 'Informações do evento', type: 'TEXT' },
  { code: 'educational_institution', label: 'Instituição de ensino', category: 'Informações do evento', type: 'TEXT' },
  { code: 'professional_registration', label: 'CRM / OAB / registro profissional', category: 'Informações do evento', type: 'TEXT', sensitive: true },
  { code: 'companion_count', label: 'Número de acompanhantes', category: 'Informações do evento', type: 'NUMBER' },
  { code: 'accommodation_needed', label: 'Necessidade de hospedagem', category: 'Informações do evento', type: 'RADIO', options: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Não' }] },
  { code: 'transport_needed', label: 'Necessidade de transporte', category: 'Informações do evento', type: 'RADIO', options: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Não' }] },
  { code: 'parallel_activities', label: 'Participação em atividades paralelas', category: 'Informações do evento', type: 'CHECKBOX', options: [{ id: 'configured_by_event', label: 'Atividades configuradas pelo evento' }] },
  { code: 'selected_workshops', label: 'Minicursos / workshops escolhidos', category: 'Informações do evento', type: 'CHECKBOX', options: [{ id: 'configured_by_event', label: 'Atividades configuradas pelo evento' }] },
  { code: 'accessibility', label: 'Necessidades de acessibilidade', category: 'Acessibilidade', type: 'TEXTAREA', sensitive: true },

  { code: 'event_communications_consent', label: 'Autorizo receber comunicações sobre este evento', category: 'LGPD e autorizações', type: 'CONSENT' },
  { code: 'future_communications_consent', label: 'Autorizo receber comunicações de futuros eventos', category: 'LGPD e autorizações', type: 'CONSENT' },
  { code: 'image_use_consent', label: 'Autorizo o uso de imagem', category: 'LGPD e autorizações', type: 'CONSENT' },
] as const;

export const REGISTRATION_SYSTEM_FIELDS = [
  'Lote', 'Código da inscrição', 'Número da inscrição', 'Data/hora da inscrição', 'Forma de pagamento',
  'Status do pagamento', 'Cupom de desconto', 'Código de convite', 'Origem da inscrição', 'QR Code',
  'Código de crachá', 'Categoria do crachá', 'Data/hora e local do credenciamento', 'Status operacional',
  'Data/hora de entrada', 'Data/hora de saída', 'Data/hora do aceite', 'Versão do termo aceito',
] as const;

const TYPES = new Set<FieldType>(['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE', 'DOCUMENT', 'CNPJ', 'DATE', 'NUMBER', 'SELECT', 'RADIO', 'CHECKBOX', 'PHOTO', 'CONSENT', 'REGISTRATION_TYPE']);

function formTextHasInjection(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value) || /[<>`]|\$\{|javascript\s*:/iu.test(value);
}
const OPERATORS = new Set(['EQUALS', 'NOT_EQUALS']);

@Injectable()
export class RegistrationFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
    private readonly termsDocuments: RegistrationTermsDocumentService,
  ) {}

  async postEventReport(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    return readPostEventReport(this.prisma, event);
  }

  async get(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const form = await this.prisma.eventRegistrationForm.findUnique({ where: { eventId_organizationId: scope } });
    const fields = form ? this.readFields(form.fields) : ESSENTIAL_FIELDS;
    const registrationCategories = await this.prisma.eventRegistrationCategory.findMany({
      where: { ...scope, active: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      event: { id: event.id, name: event.name, status: event.status },
      form: { revision: form?.revision ?? 0, publishedVersion: form?.publishedVersion ?? 0, fields },
      catalog: REGISTRATION_FIELD_CATALOG,
      registrationCategories,
      systemFields: REGISTRATION_SYSTEM_FIELDS,
      termsDocument: await this.termsDocuments.current(event.organizationId!, event.id),
      publicRegistrationEnabled: false,
      message: 'A ficha pode ser preparada e testada, mas a inscrição pública permanece bloqueada até o Go/No-Go da Fase 2.',
    };
  }

  async save(userId: string, eventId: string, dto: SaveRegistrationFormInput) {
    const event = await this.requireMutableEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    await this.prisma.$transaction(async (tx) => {
      const categories = await tx.eventRegistrationCategory.findMany({ where: { ...scope, active: true }, select: { id: true } });
      const fields = this.validateFields(dto.fields, new Set(categories.map((category) => category.id)));
      const existing = await tx.eventRegistrationForm.findUnique({ where: { eventId_organizationId: scope } });
      if ((existing?.revision ?? 0) !== dto.expectedRevision) {
        throw new ConflictException('A ficha foi alterada em outra sessão. Recarregue antes de salvar novamente.');
      }
      const form = existing
        ? await tx.eventRegistrationForm.update({
            where: { id: existing.id },
            data: { fields: fields as unknown as Prisma.InputJsonArray, revision: { increment: 1 } },
          })
        : await tx.eventRegistrationForm.create({
            data: { ...scope, fields: fields as unknown as Prisma.InputJsonArray, revision: 1 },
          });
      await this.audit(tx, event, userId, 'registration.form_draft_saved', form.id, { revision: form.revision, fieldCount: fields.length });
    });
    return this.get(userId, eventId);
  }

  async publish(userId: string, eventId: string, expectedRevision: number) {
    const event = await this.requireMutableEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    await this.prisma.$transaction(async (tx) => {
      const form = await tx.eventRegistrationForm.findUnique({ where: { eventId_organizationId: scope } });
      if (!form) throw new BadRequestException('Salve a ficha antes de publicar uma versão.');
      if (form.revision !== expectedRevision) throw new ConflictException('A ficha mudou. Recarregue antes de publicar.');
      const categories = await tx.eventRegistrationCategory.findMany({ where: { ...scope, active: true }, select: { id: true } });
      this.validateFields(this.readFields(form.fields), new Set(categories.map((category) => category.id)));
      const terms = await tx.eventRegistrationTermsDocument.findFirst({
        where: { ...scope, state: RegistrationTermsDocumentState.ACTIVE },
        select: { id: true, version: true },
      });
      if (!terms) throw new BadRequestException('Anexe o PDF dos termos de inscrição e da Política de Privacidade antes de preservar a versão.');
      const version = form.publishedVersion + 1;
      await tx.eventRegistrationFormVersion.create({
        data: {
          ...scope,
          formId: form.id,
          version,
          schema: form.fields as Prisma.InputJsonValue,
          termsDocumentId: terms.id,
          termsDocumentVersion: terms.version,
          createdById: userId,
        },
      });
      await tx.eventRegistrationForm.update({ where: { id: form.id }, data: { publishedVersion: version } });
      await this.audit(tx, event, userId, 'registration.form_version_published', form.id, { version, revision: form.revision });
    });
    return this.get(userId, eventId);
  }

  private validateFields(input: RegistrationField[], activeCategoryIds: Set<string>) {
    if (!Array.isArray(input) || input.length < 3 || input.length > 80) throw new BadRequestException('A ficha deve possuir entre 3 e 80 campos.');
    const ids = new Set<string>();
    const codes = new Set<string>();
    const fields = input.map((field, index) => {
      if (!field || typeof field !== 'object') throw new BadRequestException('Campo de inscrição inválido.');
      const id = this.safeId(field.id, 'identificador do campo');
      const code = this.safeCode(field.code);
      const label = this.text(field.label, 2, 100, 'nome do campo');
      if (ids.has(id) || codes.has(code)) throw new BadRequestException('Cada campo deve possuir identificador e código únicos.');
      const priorIds = new Set(ids);
      ids.add(id); codes.add(code);
      if (!TYPES.has(field.type)) throw new BadRequestException('Tipo de campo não permitido.');
      const options = field.options?.map((option) => ({ id: this.safeId(option.id, 'identificador da opção'), label: this.text(option.label, 1, 100, 'opção') }));
      if (field.appliesToCategoryIds !== undefined && !Array.isArray(field.appliesToCategoryIds)) {
        throw new BadRequestException('Seleção de categorias inválida para o campo.');
      }
      const appliesToCategoryIds = field.appliesToCategoryIds ?? [];
      if (appliesToCategoryIds.length > 50) {
        throw new BadRequestException('Um campo não pode ser aplicado a mais de 50 categorias.');
      }
      if (new Set(appliesToCategoryIds).size !== appliesToCategoryIds.length) {
        throw new BadRequestException('A seleção de categorias do campo contém IDs duplicados.');
      }
      if (appliesToCategoryIds.some((categoryId) => typeof categoryId !== 'string' || !activeCategoryIds.has(categoryId))) {
        throw new BadRequestException('O campo deve usar apenas categorias ativas deste evento.');
      }
      if (appliesToCategoryIds.length && ESSENTIAL_FIELDS.some((item) => item.code === code)) {
        throw new BadRequestException('Campos essenciais precisam aparecer em todas as categorias.');
      }
      if ((field.type === 'SELECT' || field.type === 'RADIO' || field.type === 'CHECKBOX') && (!options || options.length < 1 || options.length > 50)) {
        throw new BadRequestException('Campos de escolha precisam ter entre 1 e 50 opções.');
      }
      return {
        id, code, label,
        category: this.text(field.category || 'Perguntas do evento', 2, 60, 'categoria'),
        type: field.type,
        required: Boolean(field.required),
        enabled: field.enabled !== false,
        locked: ESSENTIAL_FIELDS.some((item) => item.code === code),
        sensitive: Boolean(field.sensitive),
        ...(field.help ? { help: this.text(field.help, 1, 240, 'ajuda') } : {}),
        ...(field.placeholder ? { placeholder: this.text(field.placeholder, 1, 120, 'placeholder') } : {}),
        ...(options ? { options } : {}),
        ...(appliesToCategoryIds.length ? { appliesToCategoryIds } : {}),
        ...(field.condition ? { condition: this.condition(field.condition, priorIds, index) } : {}),
      };
    });
    for (const essential of ESSENTIAL_FIELDS) {
      const field = fields.find((item) => item.code === essential.code);
      if (!field) throw new BadRequestException(`O campo essencial “${essential.label}” não pode ser removido.`);
      if (field.enabled === false) throw new BadRequestException(`O campo essencial “${essential.label}” deve permanecer habilitado.`);
      if (essential.required && !field.required) throw new BadRequestException(`O campo “${essential.label}” deve permanecer obrigatório.`);
    }
    return fields;
  }

  private condition(value: FieldCondition, priorIds: Set<string>, index: number) {
    if (!priorIds.has(value.fieldId) || index === 0) throw new BadRequestException('A condição deve depender de um campo anterior da ficha.');
    if (!OPERATORS.has(value.operator)) throw new BadRequestException('Operador condicional não permitido.');
    return { fieldId: value.fieldId, operator: value.operator, value: this.text(value.value, 1, 100, 'valor da condição') };
  }

  private readFields(value: Prisma.JsonValue) {
    if (!Array.isArray(value)) throw new BadRequestException('A ficha armazenada possui formato inválido.');
    return value as unknown as RegistrationField[];
  }

  private async requireEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (event.organizationId) await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    else if (event.ownerId !== userId) throw new NotFoundException('Evento não encontrado.');
    if (!event.organizationId) throw new BadRequestException('O evento precisa estar vinculado a uma organização.');
    return event;
  }

  private async requireMutableEvent(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }

  private safeId(value: string, label: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/u.test(value ?? '')) throw new BadRequestException(`O ${label} é inválido.`);
    return value;
  }
  private safeCode(value: string) {
    if (!/^[a-z][a-z0-9_]{1,59}$/u.test(value ?? '')) throw new BadRequestException('O código do campo é inválido.');
    return value;
  }
  private text(value: string, min: number, max: number, label: string) {
    const normalized = value?.trim().replace(/\s+/gu, ' ');
    if (!normalized || normalized.length < min || normalized.length > max || formTextHasInjection(normalized)) throw new BadRequestException(`O ${label} é inválido.`);
    return normalized;
  }
  private async audit(tx: Prisma.TransactionClient, event: { id: string; organizationId: string | null }, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonObject) {
    await tx.auditLog.create({ data: { organizationId: event.organizationId!, eventId: event.id, actorUserId, action, entityType: 'EventRegistrationForm', entityId, metadata } });
  }
}

