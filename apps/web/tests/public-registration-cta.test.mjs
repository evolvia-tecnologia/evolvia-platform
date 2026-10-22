import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { publicPhoneHref } from '../lib/public-event-contact.ts';
import {
  parsePublicRegistrationMode,
  parsePublicRegistrationOffer,
  publicDeskNewLabel,
  publicDeskSearchSubmitLabel,
  publicPageTitle,
  publicOfferSectionTitle,
  publicParticipantAccessLead,
  publicParticipantCtaLabel,
  publicParticipantHeading,
  publicRegistrationCtaLabel,
  publicRegistrationSuccessTitle,
  publicRegistrationSubmitLabel,
  publicWaitlistBackLabel,
} from '../lib/public-registration-cta.ts';

test('compra paga distingue inscrição de ingresso e convite permanece convite', () => {
  assert.equal(publicRegistrationCtaLabel('PAID', 'CORPORATE_TRAINING', 'Evento corporativo ou treinamento'), 'Comprar inscrição');
  assert.equal(publicRegistrationCtaLabel('PAID', 'ENTERTAINMENT', 'Show ou entretenimento'), 'Comprar ingresso');
  assert.equal(publicRegistrationCtaLabel('PAID', null, 'Festival'), 'Comprar ingresso');
  assert.equal(publicRegistrationCtaLabel('PAID', 'SCIENTIFIC_EVENT', 'Festival'), 'Comprar inscrição');
  assert.equal(publicRegistrationCtaLabel('PAID', 'FAIR_EXHIBITION', 'Show ou entretenimento'), 'Comprar inscrição');
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

test('oferta pública lista categoria e preço sem aceitar identificador ou modo inválido', () => {
  const offer = parsePublicRegistrationOffer({
    event: { registrationMode: 'PAID' },
    categories: [
      {
        id: 'cat1234567890',
        name: 'Associados',
        description: 'Três dias de congresso',
        lots: [{ priceCents: 160000 }, { priceCents: 180000 }],
      },
      { id: '<script>', name: 'Inválida', lots: [{ priceCents: 1 }] },
    ],
  });
  assert.equal(offer.mode, 'PAID');
  assert.equal(offer.categories.length, 1);
  assert.equal(offer.categories[0].name, 'Associados');
  assert.equal(offer.categories[0].priceLabel, 'A partir de R$ 1.600,00');
  assert.equal(parsePublicRegistrationOffer({ event: { registrationMode: 'SCRIPT' } }), null);
  assert.equal(parsePublicRegistrationOffer({
    event: { registrationMode: 'FREE' },
    categories: [{ id: 'cat1234567890', name: 'Visitante', lots: [{ priceCents: 0 }] }],
  }).categories[0].priceLabel, 'Gratuita');
});

test('show usa ingresso na ficha, na área do participante e no posto', () => {
  assert.equal(publicOfferSectionTitle('ENTERTAINMENT', 'Show ou entretenimento'), 'Ingressos');
  assert.equal(publicRegistrationSubmitLabel('ENTERTAINMENT', 'Show ou entretenimento', false), 'Reservar ingresso');
  assert.equal(publicRegistrationSubmitLabel('ENTERTAINMENT', 'Show ou entretenimento', true), 'Confirmar ingresso');
  assert.equal(publicRegistrationSuccessTitle('CONFIRMED', 0, 'ENTERTAINMENT', 'Show ou entretenimento'), 'Ingresso confirmado');
  assert.equal(publicRegistrationSuccessTitle('PENDING_PAYMENT', 12000, 'ENTERTAINMENT', 'Show ou entretenimento'), 'Ingresso reservado');
  assert.equal(publicParticipantHeading('ENTERTAINMENT', 'Show ou entretenimento'), 'Acompanhe seu ingresso');
  assert.equal(publicDeskSearchSubmitLabel('ENTERTAINMENT'), 'Buscar ingresso');
  assert.equal(publicDeskNewLabel('ENTERTAINMENT'), 'Novo ingresso');
  assert.equal(publicDeskSearchSubmitLabel('OTHER', 'Festival'), 'Buscar ingresso');
  assert.equal(publicDeskSearchSubmitLabel('SCIENTIFIC_EVENT', 'Festival'), 'Buscar inscrição');
  assert.equal(publicDeskNewLabel('SOCIAL_COMMUNITY', 'Festival'), 'Nova inscrição');
  assert.equal(publicDeskNewLabel('SCIENTIFIC_EVENT', 'Congresso'), 'Nova inscrição');
  assert.equal(publicPageTitle('registration', 'ENTERTAINMENT', 'Show ou entretenimento'), 'Ingresso no evento');
  assert.equal(publicPageTitle('registration', 'SCIENTIFIC_EVENT', 'Congresso'), 'Inscrição no evento');
  assert.equal(publicWaitlistBackLabel('ENTERTAINMENT', 'Festival'), 'Voltar ao ingresso');
  assert.equal(publicWaitlistBackLabel('CORPORATE_TRAINING', 'Treinamento'), 'Voltar à inscrição');
  assert.equal(publicOfferSectionTitle('SCIENTIFIC_EVENT', 'Congresso'), 'Inscrições');
  assert.equal(publicDeskSearchSubmitLabel('SCIENTIFIC_EVENT'), 'Buscar inscrição');
  assert.match(publicParticipantAccessLead('ENTERTAINMENT', 'Show ou entretenimento'), /recebido no ingresso/u);
  assert.doesNotMatch(publicParticipantAccessLead('ENTERTAINMENT', 'Show ou entretenimento'), /na ingresso/u);
  assert.match(publicParticipantAccessLead('SCIENTIFIC_EVENT', 'Congresso'), /recebido na inscrição/u);
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
