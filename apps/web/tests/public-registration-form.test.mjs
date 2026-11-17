import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('evento oferece inscrição para quem ainda não comprou, com o rótulo do modo', async () => {
  const [page, presentation, preview] = await Promise.all([
    read('../app/evento/[slug]/page.tsx'),
    read('../components/public-event-presentation.tsx'),
    read('../components/publication-preview.tsx'),
  ]);
  assert.match(page, /registrationOffer\(slug\)/u);
  assert.match(page, /registrationMode=\{registrationMode\}/u);
  assert.match(presentation, /registrationMode &&/u);
  assert.match(presentation, /\/evento\/\$\{encodeURIComponent\(event\.event\.slug\)\}\/inscricao/u);
  assert.match(presentation, /publicRegistrationCtaLabel/u);
  assert.match(presentation, /\/evento\/\$\{encodeURIComponent\(event\.event\.slug\)\}\/participante/u);
  assert.match(preview, /\/public\/events\/\$\{encodeURIComponent\(preview\.event\.slug\)\}\/registration/u);
  assert.match(preview, /registrationMode=\{offer\?\.mode \?\? null\}/u);
  assert.match(page, /categories=\{offer\?\.categories \?\? \[\]\}/u);
  assert.match(page, /readPublishedShirtSizes\(payload\)/u);
  assert.match(page, /shirtSizes=\{registration\.shirtSizes\}/u);
  assert.match(page, /athletePrompts=\{registration\.athletePrompts\}/u);
});

test('formulário entrega categoria, lote, ficha, benefício, protocolo e checkout', async () => {
  const [page, form] = await Promise.all([
    read('../app/evento/[slug]/inscricao/page.tsx'),
    read('../components/public-registration-form.tsx'),
  ]);
  assert.match(page, /<PublicRegistrationForm/u);
  assert.match(page, /context="registration"/u);
  assert.match(page, /isRunningProfile\(profile\.eventType\)/u);
  assert.match(page, /slug=\{slug\}/u);
  assert.match(form, /categoryId/u);
  assert.match(form, /lotId/u);
  assert.match(form, /benefitCode/u);
  assert.match(form, /field\.type === 'CONSENT'/u);
  assert.match(form, /field\.help && <small>\{field\.help\}<\/small>/u);
  assert.match(form, /publishedChoiceError\(visibleFields, answers\)/u);
  assert.match(form, /id="terms-acceptance"/u);
  assert.match(form, /Abrir \{options\.terms\.fileName\}/u);
  assert.match(form, /disabled=\{sending \|\| !options\.terms\}/u);
  assert.match(form, /idempotency-key/u);
  assert.match(form, /crypto\.randomUUID/u);
  assert.match(form, /result\.protocol/u);
  assert.match(form, /Ir para o pagamento seguro/u);
  assert.match(form, /\/checkout/u);
  assert.match(form, /window\.location\.assign/u);
  assert.match(form, /Atualizar confirmação/u);
  assert.match(form, /Por segurança, seus dados pessoais não são exibidos/u);
});

test('a corrida fica dentro da ficha, depois do título, também enquanto carrega', async () => {
  const [page, form] = await Promise.all([
    read('../app/evento/[slug]/inscricao/page.tsx'),
    read('../components/public-registration-form.tsx'),
  ]);
  const markup = page.slice(page.indexOf('return <>'));
  assert.equal(markup.match(/<PublicRegistrationForm\b/gu)?.length, 1);
  assert.doesNotMatch(markup, /<PublicSportsLanding/u);
  assert.match(markup, /<PublicRegistrationForm[\s\S]*preface=\{sportsPreface\}/u);
  assert.match(page, /heading=\{runningEvent\?\.event\.name\}/u);

  const loading = form.slice(form.indexOf('if (loading)'), form.indexOf('if (error && !options)'));
  assert.ok(loading.indexOf('<h1>{heading}</h1>') < loading.indexOf('{preface}'), 'o título precede a corrida no carregamento');
  assert.ok(loading.indexOf('{preface}') < loading.indexOf('role="status"'), 'a corrida fica dentro do main de carregamento');

  const filled = form.slice(form.lastIndexOf('return <main'));
  assert.ok(filled.indexOf('<h1>{options.event.name}</h1>') < filled.indexOf('{preface}'));
  assert.ok(filled.indexOf('{preface}') < filled.indexOf('<form'));
});

test('retorno do provedor consulta o estado do servidor e não confirma pelo callback', async () => {
  const [page, form] = await Promise.all([
    read('../app/evento/[slug]/inscricao/page.tsx'),
    read('../components/public-registration-form.tsx'),
  ]);
  assert.match(page, /query\.protocolo/u);
  assert.match(page, /initialProtocol/u);
  assert.match(form, /reservationStatus/u);
  assert.match(form, /paymentConfirmed/u);
  assert.doesNotMatch(form, /pagamento.*===.*confirm/iu);
});

test('lote esgotado leva à fila e a oferta da fila confirma pela mesma ficha autenticada', async () => {
  const [page, form] = await Promise.all([
    read('../app/evento/[slug]/inscricao/page.tsx'),
    read('../components/public-registration-form.tsx'),
  ]);
  assert.match(page, /query\.oferta/u);
  assert.match(page, /offerLotId=\{offerLotId\}/u);
  assert.match(form, /options\.waitlist/u);
  assert.match(form, /Entrar na fila de espera/u);
  assert.match(form, /\/inscricao\/fila/u);
  assert.match(form, /\/waitlist\/\$\{encodeURIComponent\(offerLotId\)\}\/offer/u);
  assert.match(form, /\/waitlist\/\$\{encodeURIComponent\(offerLotId\)\}\/accept/u);
  assert.match(form, /Authorization: `Bearer \$\{token\}`/u);
  assert.match(form, /'idempotency-key': idempotencyKey/u);
  assert.match(form, /publicRegistrationSubmitLabel/u);
  assert.match(form, /As vagas disponíveis acabaram/u);
});

test('ficha pública e área do participante herdam borda e botão da paleta', async () => {
  const globals = await read('../app/globals.css');
  assert.match(globals, /--line:var\(--border\)/u);
  assert.match(globals, /--action:var\(--primary\)/u);
  assert.match(globals, /--action-contrast:var\(--color-surface\)/u);
  assert.match(globals, /--surface-soft:var\(--soft\)/u);
});

test('tela preserva semântica, acessibilidade e reflow', async () => {
  const [page, form, css] = await Promise.all([
    read('../app/evento/[slug]/inscricao/page.tsx'),
    read('../components/public-registration-form.tsx'),
    read('../components/public-registration-form.module.css'),
  ]);
  assert.match(page, /skip-link/u);
  assert.match(form, /<main/u);
  assert.match(form, /<form/u);
  assert.match(form, /<fieldset/u);
  assert.match(form, /<legend>/u);
  assert.match(form, /role="alert"/u);
  assert.match(form, /role="status"/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /grid-template-columns: 1fr/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
});

