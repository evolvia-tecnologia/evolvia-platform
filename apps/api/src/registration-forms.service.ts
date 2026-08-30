import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';

type FieldType = 'TEXT' | 'TEXTAREA' | 'EMAIL' | 'PHONE' | 'DATE' | 'NUMBER' | 'SELECT' | 'RADIO' | 'CHECKBOX';
type FieldOption = { id: string; label: string };
type FieldCondition = { fieldId: string; operator: 'EQUALS' | 'NOT_EQUALS'; value: string };
export type RegistrationField = {
  id: string;
  code: string;
  label: string;
  category: string;
  type: FieldType;
  required: boolean;
  locked?: boolean;
  sensitive?: boolean;
  help?: string;
  placeholder?: string;
  options?: FieldOption[];
  condition?: FieldCondition;
};
export type SaveRegistrationFormInput = { expectedRevision: number; fields: RegistrationField[] };

const ESSENTIAL_FIELDS: RegistrationField[] = [
  { id: 'essential-full-name', code: 'full_name', label: 'Nome completo', category: 'Dados pessoais', type: 'TEXT', required: true, locked: true },
  { id: 'essential-preferred-name', code: 'preferred_name', label: 'Como deseja ser chamado', category: 'Dados pessoais', type: 'TEXT', required: false, locked: true },
  { id: 'essential-email', code: 'email', label: 'E-mail', category: 'Contato', type: 'EMAIL', required: true, locked: true },
];

export const REGISTRATION_FIELD_CATALOG = [
  ...ESSENTIAL_FIELDS,
  { code: 'phone', label: 'Telefone / WhatsApp', category: 'Contato', type: 'PHONE' },
  { code: 'cpf', label: 'CPF', category: 'Documentos', type: 'TEXT', sensitive: true },
  { code: 'passport', label: 'Passaporte', category: 'Documentos', type: 'TEXT', sensitive: true },
  { code: 'birth_date', label: 'Data de nascimento', category: 'Dados pessoais', type: 'DATE', sensitive: true },
  { code: 'institution', label: 'Instituição / empresa', category: 'Profissional', type: 'TEXT' },
  { code: 'job_title', label: 'Cargo', category: 'Profissional', type: 'TEXT' },
  { code: 'city', label: 'Cidade', category: 'Endereço', type: 'TEXT' },
  { code: 'state', label: 'Estado', category: 'Endereço', type: 'TEXT' },
  { code: 'country', label: 'País', category: 'Endereço', type: 'TEXT' },
  { code: 'accessibility', label: 'Necessidades de acessibilidade', category: 'Acessibilidade', type: 'TEXTAREA', sensitive: true },
] as const;

const TYPES = new Set<FieldType>(['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE', 'DATE', 'NUMBER', 'SELECT', 'RADIO', 'CHECKBOX']);
const OPERATORS = new Set(['EQUALS', 'NOT_EQUALS']);

@Injectable()
export class RegistrationFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const form = await this.prisma.eventRegistrationForm.findUnique({ where: { eventId_organizationId: scope } });
    const fields = form ? this.readFields(form.fields) : ESSENTIAL_FIELDS;
    return {
      event: { id: event.id, name: event.name, status: event.status },
      form: { revision: form?.revision ?? 0, publishedVersion: form?.publishedVersion ?? 0, fields },
      catalog: REGISTRATION_FIELD_CATALOG,
      publicRegistrationEnabled: false,
      message: 'A ficha pode ser preparada e testada, mas a inscrição pública permanece bloqueada até o Go/No-Go da Fase 2.',
    };
  }

  async save(userId: string, eventId: string, dto: SaveRegistrationFormInput) {
    const event = await this.requireMutableEvent(userId, eventId);
    const fields = this.validateFields(dto.fields);
    const scope = { eventId, organizationId: event.organizationId! };
    await this.prisma.$transaction(async (tx) => {
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
      const version = form.publishedVersion + 1;
      await tx.eventRegistrationFormVersion.create({
        data: { ...scope, formId: form.id, version, schema: form.fields as Prisma.InputJsonValue, createdById: userId },
      });
      await tx.eventRegistrationForm.update({ where: { id: form.id }, data: { publishedVersion: version } });
      await this.audit(tx, event, userId, 'registration.form_version_published', form.id, { version, revision: form.revision });
    });
    return this.get(userId, eventId);
  }

  private validateFields(input: RegistrationField[]) {
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
      if ((field.type === 'SELECT' || field.type === 'RADIO' || field.type === 'CHECKBOX') && (!options || options.length < 1 || options.length > 50)) {
        throw new BadRequestException('Campos de escolha precisam ter entre 1 e 50 opções.');
      }
      return {
        id, code, label,
        category: this.text(field.category || 'Perguntas do evento', 2, 60, 'categoria'),
        type: field.type,
        required: Boolean(field.required),
        locked: ESSENTIAL_FIELDS.some((item) => item.code === code),
        sensitive: Boolean(field.sensitive),
        ...(field.help ? { help: this.text(field.help, 1, 240, 'ajuda') } : {}),
        ...(field.placeholder ? { placeholder: this.text(field.placeholder, 1, 120, 'placeholder') } : {}),
        ...(options ? { options } : {}),
        ...(field.condition ? { condition: this.condition(field.condition, priorIds, index) } : {}),
      };
    });
    for (const essential of ESSENTIAL_FIELDS) {
      const field = fields.find((item) => item.code === essential.code);
      if (!field) throw new BadRequestException(`O campo essencial “${essential.label}” não pode ser removido.`);
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
    if (!normalized || normalized.length < min || normalized.length > max || /[<>]/u.test(normalized)) throw new BadRequestException(`O ${label} é inválido.`);
    return normalized;
  }
  private async audit(tx: Prisma.TransactionClient, event: { id: string; organizationId: string | null }, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonObject) {
    await tx.auditLog.create({ data: { organizationId: event.organizationId!, eventId: event.id, actorUserId, action, entityType: 'EventRegistrationForm', entityId, metadata } });
  }
}
