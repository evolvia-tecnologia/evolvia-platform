import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('../components/event-role-certificates.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/eventos/[id]/painel/certificados/page.tsx', import.meta.url), 'utf8');
const area = await readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8');

test('o organizador configura os papéis desligados, sem taxa e sem e-mail', () => {
  assert.match(page, /EventRoleCertificates/u);
  assert.match(panel, /Cada papel começa desligado/u);
  assert.match(panel, /O download não é cobrado/u);
  assert.match(panel, /não há envio de e-mail/u);
  assert.match(panel, /certificate-roles/u);
  assert.match(panel, /Emitir elegíveis/u);
  assert.match(panel, /activity/u);
  assert.match(panel, /approved_submission/u);
  assert.match(panel, /reviewer/u);
  assert.doesNotMatch(panel, /amountCents|checkout|pix|boleto|walletId|cpf|protocol/iu);
});

test('a área do participante lista só os certificados devolvidos para a própria sessão', () => {
  assert.match(area, /participant\/certificate-roles/u);
  assert.match(area, /Certificados por atividade e papel/u);
  assert.match(area, /O download não é cobrado/u);
  assert.doesNotMatch(area, /registrationData|full_name|preferred_name|emailHash|identityHash/u);
});
