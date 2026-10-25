import { Prisma } from '@prisma/client';
import { SHIRT_SIZE_FIELD_CODE, SHIRT_SIZE_FIELD_ID } from './kit-stock.policy';

const STARTER_FIELDS = [
  { id: 'essential-full-name', code: 'full_name', label: 'Nome completo', category: 'Identificação', type: 'TEXT', required: true, enabled: true, locked: true },
  { id: 'essential-preferred-name', code: 'preferred_name', label: 'Como deseja ser chamado', category: 'Identificação', type: 'TEXT', required: true, enabled: true, locked: true },
  { id: 'essential-identity-document', code: 'identity_document', label: 'CPF ou documento estrangeiro', category: 'Identificação', type: 'DOCUMENT', required: true, enabled: true, locked: true, sensitive: true },
  { id: 'essential-email', code: 'email', label: 'E-mail', category: 'Contato', type: 'EMAIL', required: true, enabled: true, locked: true },
  { id: 'essential-phone', code: 'phone', label: 'Celular / WhatsApp', category: 'Contato', type: 'PHONE', required: true, enabled: true, locked: true },
  { id: 'essential-registration-type', code: 'registration_type', label: 'Tipo / categoria de inscrição', category: 'Dados da inscrição', type: 'REGISTRATION_TYPE', required: true, enabled: true, locked: true },
  { id: 'essential-terms', code: 'terms_acceptance', label: 'Aceito os termos de inscrição e a Política de Privacidade', category: 'LGPD e autorizações', type: 'CONSENT', required: true, enabled: true, locked: true },
];

type ShirtOption = { id: string; label: string };

function asFields(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    return [item];
  });
}

export function mergeShirtSizeField(
  value: Prisma.JsonValue | null | undefined,
  options: ShirtOption[],
  enabled: boolean,
): Prisma.JsonObject[] {
  const fields = asFields(value).map((field) => ({ ...field }));
  const index = fields.findIndex((field) => field.code === SHIRT_SIZE_FIELD_CODE);
  if (!enabled) {
    if (index >= 0) fields[index] = { ...fields[index], enabled: false };
    return fields;
  }
  const shirt = {
    id: SHIRT_SIZE_FIELD_ID,
    code: SHIRT_SIZE_FIELD_CODE,
    label: 'Tamanho da camisa',
    category: 'Kit',
    type: 'SELECT',
    required: false,
    enabled: true,
    help: 'Preferência de tamanho. Não reserva estoque.',
    options,
  };
  if (index >= 0) fields[index] = { ...fields[index], ...shirt };
  else fields.push(shirt);
  return fields;
}

export async function syncShirtSizeField(
  tx: Prisma.TransactionClient,
  scope: { eventId: string; organizationId: string },
  actorUserId: string,
  options: ShirtOption[],
  enabled: boolean,
) {
  const form = await tx.eventRegistrationForm.findUnique({ where: { eventId_organizationId: scope } });
  const fields = mergeShirtSizeField(form?.fields ?? STARTER_FIELDS, options, enabled);
  if (!form) {
    if (!enabled) return;
    await tx.eventRegistrationForm.create({
      data: { ...scope, fields: fields as Prisma.InputJsonArray, revision: 1 },
    });
    return;
  }
  let publishedVersion = form.publishedVersion;
  if (form.publishedVersion > 0) {
    const current = await tx.eventRegistrationFormVersion.findFirst({
      where: { formId: form.id, version: form.publishedVersion, eventId: scope.eventId, organizationId: scope.organizationId },
      select: { schema: true, termsDocumentId: true, termsDocumentVersion: true },
    });
    if (current) {
      const schema = mergeShirtSizeField(current.schema, options, enabled);
      publishedVersion += 1;
      await tx.eventRegistrationFormVersion.create({
        data: {
          ...scope,
          formId: form.id,
          version: publishedVersion,
          schema: schema as Prisma.InputJsonArray,
          termsDocumentId: current.termsDocumentId,
          termsDocumentVersion: current.termsDocumentVersion,
          createdById: actorUserId,
        },
      });
    }
  }
  await tx.eventRegistrationForm.update({
    where: { id: form.id },
    data: {
      fields: fields as Prisma.InputJsonArray,
      publishedVersion,
      revision: { increment: 1 },
    },
  });
}
