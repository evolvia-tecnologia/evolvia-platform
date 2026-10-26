import { assertPublicationRichTextSafe } from './publication-text-style';

export function normalizeCommunicationDraft(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Informe o rascunho.');
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).some((key) => !['subject', 'body', 'expectedRevision'].includes(key))) throw new Error('O rascunho contém campos desconhecidos.');
  if (typeof row.subject !== 'string' || /[<>\u0000-\u001f\u007f]/u.test(row.subject)) throw new Error('Informe um assunto sem HTML nem quebras de linha.');
  const subject = row.subject.trim();
  if (!subject || subject.length > 180) throw new Error('O assunto precisa ter de 1 a 180 caracteres.');
  if (typeof row.body !== 'string' || row.body.length > 20000 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(row.body)) throw new Error('Use o editor para o conteúdo, com até 20000 caracteres e sem HTML.');
  const body = row.body.replace(/\r\n/g, '\n');
  assertPublicationRichTextSafe(body, 'conteúdo');
  for (const match of body.matchAll(/\]\(([^)\s]*)\)/gu)) {
    let url: URL;
    try { url = new URL(match[1]); } catch { throw new Error('Use links HTTPS completos na mensagem.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use links HTTPS sem credenciais na mensagem.');
  }
  if (typeof row.expectedRevision !== 'number' || !Number.isSafeInteger(row.expectedRevision) || row.expectedRevision < 0 || row.expectedRevision > 2147483646) throw new Error('Atualize a revisão do rascunho.');
  return { subject, body, expectedRevision: row.expectedRevision };
}

export function assertCommunicationDraftId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) throw new Error('Identificador de rascunho inválido.');
}
