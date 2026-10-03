import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { formatEventDate } from '../lib/event-time-zone.ts';
import {
  formatEstimatedAudience,
  publicEventTypeLabel,
} from '../lib/public-event-profile.ts';

const [presentation, eva, styles] = await Promise.all([
  readFile(new URL('../components/public-event-presentation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/public-eva-support.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/evento/[slug]/page.module.css', import.meta.url), 'utf8'),
]);

const EVA_TOPIC_IDS = ['PROFILE', 'WHEN', 'FORMAT', 'PLACE', 'ACCESSIBILITY', 'CONTACT'];

const completeEvent = {
  eventName: 'Congresso Aberto de Acessibilidade',
  eventType: 'Congresso',
  profileCode: 'SCIENTIFIC_EVENT',
  estimatedAudience: 1200,
  format: 'HYBRID',
  startDate: '2026-10-10T12:00:00.000Z',
  endDate: '2026-10-12T12:00:00.000Z',
  timeZone: 'America/Sao_Paulo',
  venue: 'Centro de Convenções',
  accessibilitySummary: 'Há rampa, intérprete de Libras e assentos reservados.',
  publicContactEmail: 'contato@evento.example',
  publicContactPhone: '+55 (11) 99999-1234',
};

const missingFieldsEvent = {
  eventName: 'Encontro sem dados opcionais',
  eventType: 'Encontro',
  profileCode: 'OTHER',
  estimatedAudience: null,
  format: 'IN_PERSON',
  startDate: null,
  endDate: null,
  timeZone: null,
  venue: null,
  accessibilitySummary: null,
  publicContactEmail: null,
  publicContactPhone: null,
};

function matchingBlock(source, from, opening, closing) {
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === opening) depth += 1;
    else if (source[index] === closing) {
      depth -= 1;
      if (depth === 0) return source.slice(0, index + 1);
    }
  }
  throw new Error('bloco exportado incompleto');
}

function exportedFunction(source, name) {
  const prefix = `export function ${name}`;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`${name} ausente no código-fonte`);
  const signatureEnd = source.indexOf(')', start + prefix.length);
  const bodyStart = source.indexOf('{', signatureEnd);
  return matchingBlock(source.slice(start), bodyStart - start, '{', '}');
}

function exportedConstArray(source, name) {
  const prefix = `export const ${name}`;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`${name} ausente no código-fonte`);
  const assignment = source.indexOf('=', start + prefix.length);
  const bodyStart = source.indexOf('[', assignment);
  return matchingBlock(source.slice(start), bodyStart - start, '[', ']');
}

function loadFunction(source, name, extras = {}) {
  const stripped = stripTypeScriptTypes(exportedFunction(source, name).replace(/^export /, ''));
  const names = Object.keys(extras);
  const values = Object.values(extras);
  return new Function(...names, `${stripped}\nreturn ${name};`)(...values);
}

function loadConst(source, name) {
  const stripped = stripTypeScriptTypes(exportedConstArray(source, name).replace(/^export /, ''));
  return new Function(`${stripped}\nreturn ${name};`)();
}

function rejectBrokenAssistiveResponse({ announcement, focused, alt, decorative }) {
  if (!String(announcement ?? '').trim()) throw new Error('resposta sem anúncio');
  if (!focused) throw new Error('foco perdido');
  if (!decorative && !String(alt ?? '').trim()) throw new Error('alt inadequado');
}

const publicMediaAltText = loadFunction(presentation, 'publicMediaAltText');
const publicSectionHeading = loadFunction(presentation, 'publicSectionHeading');
const publicEmailActionHref = loadFunction(presentation, 'publicEmailActionHref');
const publicPhoneActionHref = loadFunction(presentation, 'publicPhoneActionHref');
const answerFor = loadFunction(eva, 'answerFor', {
  formatEventDate,
  formatEstimatedAudience,
  publicEventTypeLabel,
});
const evaTopics = loadConst(eva, 'EVA_TOPICS');

test('evento completo expõe hierarquia, fatos, contato acionável e mídia com alternativa', () => {
  assert.match(presentation, /aria-label="Fatos do evento"/u);
  assert.match(presentation, /<dt>Tipo<\/dt>/u);
  assert.match(presentation, /<dt>Formato<\/dt>/u);
  assert.match(presentation, /<dt>Início<\/dt>/u);
  assert.match(presentation, /<dt>Encerramento<\/dt>/u);
  assert.match(presentation, /<dt>Público estimado<\/dt>/u);
  assert.match(presentation, /<dt>Local<\/dt>/u);
  assert.match(presentation, /<dt>E-mail<\/dt>/u);
  assert.match(presentation, /<dt>Telefone<\/dt>/u);
  assert.match(presentation, /id="about-title" tabIndex=\{-1\}/u);
  assert.match(presentation, /id="accessibility-title" tabIndex=\{-1\}/u);
  assert.match(presentation, /id="contact-title" tabIndex=\{-1\}/u);
  assert.match(presentation, /publicSectionHeading\(section\.kind, section\.title\)/u);
  assert.match(presentation, /Enviar e-mail para/u);
  assert.match(presentation, /Ligar para/u);

  assert.equal(
    publicMediaAltText({ decorative: false, altText: 'Banner do congresso' }, completeEvent.eventName),
    'Banner do congresso',
  );
  assert.equal(publicSectionHeading('TEXT', 'Programação pública'), 'Programação pública');
  assert.equal(publicEmailActionHref(completeEvent.publicContactEmail), 'mailto:contato@evento.example');
  assert.equal(publicPhoneActionHref(completeEvent.publicContactPhone), 'tel:+5511999991234');

  const answers = Object.fromEntries(EVA_TOPIC_IDS.map((topic) => [topic, answerFor(topic, completeEvent)]));
  assert.match(answers.PROFILE.text, /Congresso/u);
  assert.match(answers.PROFILE.text, /1\.200 pessoas/u);
  assert.match(answers.WHEN.text, /Congresso Aberto de Acessibilidade/u);
  assert.equal(answers.FORMAT.title, 'Evento híbrido');
  assert.equal(answers.PLACE.title, 'Local da etapa presencial');
  assert.equal(answers.PLACE.text, 'Centro de Convenções');
  assert.equal(answers.ACCESSIBILITY.targetId, 'accessibility-title');
  assert.equal(answers.CONTACT.targetId, 'contact-title');
  assert.doesNotMatch(JSON.stringify(answers), /Inscreva-se|organizationId|eventId|tenantId|organizationSecret/u);
});

test('campos ausentes não inventam data, local, contato, inscrição nem telefone clicável', () => {
  assert.equal(publicSectionHeading('HIGHLIGHT', null), 'Destaque');
  assert.equal(publicSectionHeading('TEXT', '   '), 'Informação adicional');
  assert.equal(publicEmailActionHref('contato incompleto'), null);
  assert.equal(publicPhoneActionHref('a confirmar'), null);
  assert.equal(publicPhoneActionHref('123'), null);
  assert.equal(publicPhoneActionHref('secretaria'), null);

  const answers = Object.fromEntries(EVA_TOPIC_IDS.map((topic) => [topic, answerFor(topic, missingFieldsEvent)]));
  assert.match(answers.PROFILE.text, /a EVA não deduz nem inventa esse dado/u);
  assert.equal(answers.WHEN.title, 'Data ainda não publicada');
  assert.equal(answers.PLACE.title, 'Local ainda não publicado');
  assert.equal(answers.ACCESSIBILITY.title, 'Informação ainda não publicada');
  assert.equal(answers.ACCESSIBILITY.targetId, undefined);
  assert.equal(answers.CONTACT.title, 'Contato ainda não publicado');
  assert.doesNotMatch(answers.CONTACT.text, /mailto:|tel:/u);
  assert.doesNotMatch(presentation, /Inscreva-se/u);
  assert.doesNotMatch(eva, /fetch\(|XMLHttpRequest|localStorage|sessionStorage/u);
  assert.doesNotMatch(eva, /organizationId|eventId|tenantId|organizationSecret/u);
});

test('mídia decorativa fica sem alternativa e mídia informativa usa texto publicado ou o nome do evento', () => {
  assert.equal(publicMediaAltText({ decorative: true, altText: 'não deve ser lido' }, completeEvent.eventName), '');
  assert.equal(publicMediaAltText({ decorative: true, altText: null }, completeEvent.eventName), '');
  assert.equal(
    publicMediaAltText({ decorative: false, altText: null }, completeEvent.eventName),
    completeEvent.eventName,
  );
  assert.equal(publicMediaAltText({ decorative: false, altText: '   ' }, 'Logo oficial'), 'Logo oficial');
  assert.match(presentation, /publicMediaAltText\(event\.media\.cover, event\.event\.name\)/u);
  assert.match(presentation, /publicMediaAltText\(event\.media\.logo, event\.event\.name\)/u);
});

test('EVA cobre os seis tópicos com grupo nomeado, estado pressionado e destino focável', () => {
  assert.deepEqual(evaTopics.map((topic) => topic.id), EVA_TOPIC_IDS);
  for (const label of [
    'Que tipo de evento é?',
    'Quando acontece?',
    'Como será?',
    'Onde será?',
    'Há informações de acessibilidade?',
    'Como falar com a organização?',
  ]) {
    assert.ok(evaTopics.some((topic) => topic.label === label), label);
  }

  assert.match(eva, /role="group"/u);
  assert.match(eva, /aria-label="Dúvidas que a EVA pode orientar"/u);
  assert.match(eva, /aria-pressed=\{selectedTopic === topic\.id\}/u);
  assert.match(eva, /answerRef\.current\?\.focus\(\)/u);
  assert.match(eva, /aria-live="polite"/u);
  assert.match(eva, /aria-atomic="true"/u);
  assert.match(eva, /onClick=\{focusPublishedTarget\}/u);
  assert.match(eva, /href=\{`#\$\{answer\.targetId\}`\}/u);
  assert.equal((eva.match(/aria-live="polite"/g) ?? []).length, 1);
  assert.doesNotMatch(eva, /<section[\s\S]*aria-live="polite"/u);
});

test('teste negativo rejeita resposta sem anúncio, foco perdido ou alt inadequado', () => {
  assert.throws(
    () => rejectBrokenAssistiveResponse({ announcement: '', focused: true, alt: 'Banner', decorative: false }),
    /resposta sem anúncio/u,
  );
  assert.throws(
    () => rejectBrokenAssistiveResponse({ announcement: 'Orientação da EVA: Tipo e público estimado', focused: false, alt: 'Banner', decorative: false }),
    /foco perdido/u,
  );
  assert.throws(
    () => rejectBrokenAssistiveResponse({ announcement: 'Orientação da EVA: Tipo e público estimado', focused: true, alt: '', decorative: false }),
    /alt inadequado/u,
  );
  assert.doesNotThrow(() => rejectBrokenAssistiveResponse({
    announcement: 'Orientação da EVA: Tipo e público estimado',
    focused: true,
    alt: '',
    decorative: true,
  }));

  const announcement = /aria-live="polite"/.test(eva) && /Orientação da EVA: \$\{answer\.title\}/.test(eva);
  const focused = /answerRef\.current\?\.focus\(\)/.test(eva) && /tabIndex=\{-1\}/.test(eva);
  const informativeAlt = publicMediaAltText({ decorative: false, altText: null }, completeEvent.eventName);
  const decorativeAlt = publicMediaAltText({ decorative: true, altText: null }, completeEvent.eventName);

  rejectBrokenAssistiveResponse({
    announcement: announcement ? 'Orientação da EVA: Tipo e público estimado' : '',
    focused,
    alt: informativeAlt,
    decorative: false,
  });
  rejectBrokenAssistiveResponse({
    announcement: announcement ? 'Orientação da EVA: Tipo e público estimado' : '',
    focused,
    alt: decorativeAlt,
    decorative: true,
  });
});

test('perfil público mantém teclado, alto contraste e reflow em 320px sem CTA de inscrição', () => {
  assert.match(styles, /\.visuallyHidden \{/u);
  assert.match(styles, /\.contact a \{[\s\S]*min-height: 44px/u);
  assert.match(styles, /\.evaTopics button \{[\s\S]*min-height: 44px/u);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*grid-template-columns: 1fr/u);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*min-width: 0/u);
  assert.match(styles, /@media \(forced-colors: active\) \{[\s\S]*\.section h2:focus-visible/u);
  assert.match(styles, /@media \(forced-colors: active\) \{[\s\S]*\.evaTopics button\[aria-pressed="true"\]/u);
  assert.match(styles, /\.section h2:focus-visible,[\s\S]*outline: 3px solid var\(--color-brand-blue-600\)/u);
  assert.doesNotMatch(presentation, /Inscreva-se|organizationId|eventId|tenantId|organizationSecret/u);
  assert.doesNotMatch(eva, /Inscreva-se|pagamento automático|fetch\(/u);
});
