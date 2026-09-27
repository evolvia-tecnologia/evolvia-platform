export type PublicRegistrationField = {
  code: string;
  label: string;
  type: string;
  required: boolean;
  help?: string;
  options?: Array<{ id: string; label: string }>;
  appliesToCategoryIds?: string[];
};

const ESSENTIAL_FIELDS: PublicRegistrationField[] = [
  { code: 'full_name', label: 'Nome completo', type: 'TEXT', required: true },
  { code: 'preferred_name', label: 'Como deseja ser chamado', type: 'TEXT', required: true },
  { code: 'identity_document', label: 'CPF ou documento estrangeiro', type: 'DOCUMENT', required: true },
  { code: 'email', label: 'E-mail', type: 'EMAIL', required: true },
  { code: 'phone', label: 'Celular / WhatsApp', type: 'PHONE', required: true },
  { code: 'terms_acceptance', label: 'Aceito os termos de inscrição e a Política de Privacidade', type: 'CONSENT', required: true },
];

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
  const allowed = new Map(fields.map((field) => [field.code, field]));
  for (const field of allowed.values()) {
    const value = answers[field.code];
    if (field.required && (value === undefined || value === null || value === '' || value === false || Array.isArray(value) && value.length === 0)) {
      throw new Error(`Preencha o campo obrigatório: ${field.label}.`);
    }
  }
  if (answers.registration_type !== undefined && answers.registration_type !== categoryId) {
    throw new Error('A categoria informada na ficha não corresponde à inscrição.');
  }
  if (Object.keys(answers).some((code) => code !== 'registration_type' && !allowed.has(code))) {
    throw new Error('A ficha contém campos que não pertencem a esta categoria do evento.');
  }
}
