import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('evento mostra CTA somente quando a API confirma disponibilidade', async () => {
  const [page, presentation] = await Promise.all([
    read('../app/evento/[slug]/page.tsx'),
    read('../components/public-event-presentation.tsx'),
  ]);
  assert.match(page, /registrationOffer\(slug\)/u);
  assert.match(page, /registrationMode=\{registrationMode\}/u);
  assert.match(presentation, /registrationMode &&/u);
  assert.match(presentation, /\/evento\/\$\{encodeURIComponent\(event\.event\.slug\)\}\/inscricao/u);
  assert.match(presentation, /publicRegistrationCtaLabel/u);
  assert.match(presentation, /\/evento\/\$\{encodeURIComponent\(event\.event\.slug\)\}\/participante/u);
});

test('formulário entrega categoria, lote, ficha, benefício, protocolo e checkout', async () => {
  const [page, form] = await Promise.all([
    read('../app/evento/[slug]/inscricao/page.tsx'),
    read('../components/public-registration-form.tsx'),
  ]);
  assert.match(page, /PublicRegistrationForm slug=\{slug\}/u);
  assert.match(form, /categoryId/u);
  assert.match(form, /lotId/u);
  assert.match(form, /benefitCode/u);
  assert.match(form, /field\.type === 'CONSENT'/u);
  assert.match(form, /idempotency-key/u);
  assert.match(form, /crypto\.randomUUID/u);
  assert.match(form, /result\.protocol/u);
  assert.match(form, /Ir para o pagamento seguro/u);
  assert.match(form, /\/checkout/u);
  assert.match(form, /window\.location\.assign/u);
  assert.match(form, /Atualizar confirmação/u);
  assert.match(form, /Por segurança, seus dados pessoais não são exibidos/u);
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
