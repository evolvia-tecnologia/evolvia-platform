import { readRegistrationEmail } from './registration-confirmation-mail.policy';

export function communicationAudienceInput(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Informe os filtros de destinatários.');
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).some(key => !['categoryIds', 'payment', 'page'].includes(key))) throw new Error('Filtro de destinatários desconhecido.');
  const categoryIds = row.categoryIds ?? [];
  if (!Array.isArray(categoryIds) || categoryIds.length > 50 || categoryIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/u.test(id))) throw new Error('Selecione até 50 categorias válidas.');
  const payment = row.payment ?? 'ALL';
  if (!['ALL', 'PAID', 'ZERO'].includes(String(payment)) || typeof payment !== 'string') throw new Error('Situação financeira inválida.');
  const page = row.page ?? 1;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || page > 100) throw new Error('Página inválida.');
  return { categoryIds: [...new Set(categoryIds)] as string[], payment: payment as 'ALL' | 'PAID' | 'ZERO', page };
}

export function uniqueCommunicationContacts(rows: { registrationData: unknown }[]) {
  const seen = new Set<string>();
  const contacts: { name: string; email: string }[] = [];
  let missingEmail = 0, duplicates = 0;
  for (const row of rows) {
    const email = readRegistrationEmail(row.registrationData);
    if (!email || /[<>\u0000-\u001f\u007f]/u.test(email)) { missingEmail++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    const data = row.registrationData as { full_name?: unknown };
    const name = typeof data.full_name === 'string' ? data.full_name.replace(/[<>\u0000-\u001f\u007f]/gu, '').trim().slice(0, 180) : '';
    contacts.push({ name: name || 'Nome não informado', email });
  }
  return { contacts, missingEmail, duplicates };
}
