import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { publicPhoneHref } from '../lib/public-event-contact.ts';
import {
  parsePublicRegistrationMode,
  publicParticipantCtaLabel,
  publicRegistrationCtaLabel,
} from '../lib/public-registration-cta.ts';

test('compra paga distingue inscrição de ingresso e convite permanece convite', () => {
  assert.equal(publicRegistrationCtaLabel('PAID', 'CORPORATE_TRAINING', 'Evento corporativo ou treinamento'), 'Comprar inscrição');
  assert.equal(publicRegistrationCtaLabel('PAID', 'ENTERTAINMENT', 'Show ou entretenimento'), 'Comprar ingresso');
  assert.equal(publicRegistrationCtaLabel('PAID', null, 'Festival'), 'Comprar ingresso');
  assert.equal(publicRegistrationCtaLabel('FREE', 'ENTERTAINMENT', 'Show ou entretenimento'), 'Quero me inscrever');
  assert.equal(publicRegistrationCtaLabel('INVITATION', 'CORPORATE_TRAINING', 'Convenção empresarial'), 'Tenho um convite');
});

test('área do participante usa o vocabulário do perfil sem mudar o destino', () => {
  assert.equal(
    publicParticipantCtaLabel('ENTERTAINMENT', 'Show ou entretenimento'),
    'Já tenho ingresso · acessar área do participante',
  );
  assert.equal(
    publicParticipantCtaLabel('CORPORATE_TRAINING', 'Treinamento'),
    'Já me inscrevi · acessar área do participante',
  );
});

test('tipos de ingresso acompanham a família Entretenimento do catálogo', async () => {
  const [catalog, cta] = await Promise.all([
    readFile(new URL('../lib/event-profile-catalog.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/public-registration-cta.ts', import.meta.url), 'utf8'),
  ]);
  const entertainment = catalog.slice(catalog.indexOf("id: 'entertainment'"), catalog.indexOf("id: 'community'"));
  const types = [...entertainment.matchAll(/value: '([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual(types, ['Show ou entretenimento', 'Festival']);
  for (const type of types) assert.match(cta, new RegExp(type.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('modo de inscrição só aceita os valores publicados pela API', () => {
  assert.equal(parsePublicRegistrationMode({ event: { registrationMode: 'PAID' } }), 'PAID');
  assert.equal(parsePublicRegistrationMode({ event: { registrationMode: 'INVITATION' } }), 'INVITATION');
  assert.equal(parsePublicRegistrationMode({ event: { registrationMode: 'FREE' } }), 'FREE');
  assert.equal(parsePublicRegistrationMode({ event: { registrationMode: 'SCRIPT' } }), 'FREE');
  assert.equal(parsePublicRegistrationMode(null), 'FREE');
});

test('telefone público só vira ligação quando o número é discável', () => {
  assert.equal(publicPhoneHref(' (11) 99999-9999 '), 'tel:11999999999');
  assert.equal(publicPhoneHref('+55 11 3333-4444'), 'tel:+551133334444');
  assert.equal(publicPhoneHref('javascript:alert(1)'), null);
  assert.equal(publicPhoneHref('tel:11999999999'), 'tel:11999999999');
  assert.equal(publicPhoneHref('a combinar'), null);
  assert.equal(publicPhoneHref('123'), null);
  assert.equal(publicPhoneHref('++5511999999999'), null);
});
