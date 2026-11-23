export type PublicRegistrationField = {
  code: string;
  label: string;
  type: string;
  required: boolean;
  help?: string;
  options?: Array<{ id: string; label: string }>;
  appliesToCategoryIds?: string[];
};

export class RegistrationCategoryValidationError extends Error {}

const ESSENTIAL_FIELDS: PublicRegistrationField[] = [
  { code: 'full_name', label: 'Nome completo', type: 'TEXT', required: true },
  { code: 'preferred_name', label: 'Como deseja ser chamado', type: 'TEXT', required: true },
  { code: 'identity_document', label: 'CPF ou documento estrangeiro', type: 'DOCUMENT', required: true },
  { code: 'email', label: 'E-mail', type: 'EMAIL', required: true },
  { code: 'phone', label: 'Celular / WhatsApp', type: 'PHONE', required: true },
  { code: 'terms_acceptance', label: 'Aceito os termos de inscrição e a Política de Privacidade', type: 'CONSENT', required: true },
  // Separate, freely given permission: accepting registration terms does NOT
  // authorize promotional/event e-mails. The checkbox defaults to unchecked
  // in the public registration UI and is preserved in registrationData.
  { code: 'communication_opt_in', label: 'Autorizo receber comunicações deste evento por e-mail (opcional)', type: 'CONSENT', required: false,
    help: 'O aceite é opcional, separado dos termos de inscrição e pode ser revogado.' },
];
const ESSENTIAL_BY_CODE = new Map(ESSENTIAL_FIELDS.map((field) => [field.code, field]));

export function publicRegistrationFields(value: unknown, categoryId?: string): PublicRegistrationField[] {
  const fields = new Map<string, PublicRegistrationField>(ESSENTIAL_FIELDS.map((field) => [field.code, { ...field }]));
  if (!Array.isArray(value)) return [...fields.values()];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const field = candidate as Record<string, unknown>;
    if (field.enabled === false || typeof field.code !== 'string' || typeof field.label !== 'string' || typeof field.type !== 'string') continue;
    const scopes = Array.isArray(field.appliesToCategoryIds)
      ? field.appliesToCategoryIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (categoryId && scopes.length && !scopes.includes(categoryId)) continue;
    const essential = ESSENTIAL_BY_CODE.get(field.code);
    if (essential) {
      fields.set(field.code, {
        ...essential,
        ...(typeof field.help === 'string' ? { help: field.help } : {}),
      });
      continue;
    }
    const existing = fields.get(field.code);
    fields.set(field.code, {
      code: field.code,
      label: field.label,
      type: field.type,
      required: existing ? true : field.required === true,
      ...(typeof field.help === 'string' ? { help: field.help } : {}),
      ...(Array.isArray(field.options) ? { options: field.options as Array<{ id: string; label: string }> } : {}),
      ...(scopes.length ? { appliesToCategoryIds: scopes } : {}),
    });
  }
  return [...fields.values()];
}

export function validateCategoryAnswers(
  answers: Record<string, unknown>,
  fields: PublicRegistrationField[],
  categoryId: string,
): void {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new RegistrationCategoryValidationError('As respostas fornecidas são inválidas.');
  }
  const allowed = new Map(fields.map((field) => [field.code, field]));
  for (const field of allowed.values()) {
    const value = answers[field.code];
    if (field.required && (value === undefined || value === null || value === false || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0))) {
      throw new RegistrationCategoryValidationError(`Preencha o campo obrigatório: ${field.label}.`);
    }
  }
  // Consent must be a real boolean. Strings such as "true", "yes" or "on"
  // are never evidence of freely given opt-in in the communication outbox.
  if (allowed.has('communication_opt_in') && answers.communication_opt_in !== undefined
      && typeof answers.communication_opt_in !== 'boolean') {
    throw new RegistrationCategoryValidationError('O consentimento de comunicação deve ser verdadeiro ou falso.');
  }
  if (answers.registration_type !== undefined && answers.registration_type !== categoryId) {
    throw new RegistrationCategoryValidationError('A categoria informada na ficha não corresponde à inscrição.');
  }
  if (Object.keys(answers).some((code) => code !== 'registration_type' && !allowed.has(code))) {
    throw new RegistrationCategoryValidationError('A ficha contém campos que não pertencem a esta categoria do evento.');
  }
}
