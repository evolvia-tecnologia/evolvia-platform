import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a ficha mostra o prazo e a inscrição pública avisa só a reserva paga', async () => {
  const [page, layout, hold, notice, css, formPage] = await Promise.all([
    read('../app/eventos/[id]/painel/inscricoes/ficha/page.tsx'),
    read('../app/evento/[slug]/inscricao/layout.tsx'),
    read('../components/registration-hold.tsx'),
    read('../components/registration-hold-notice.tsx'),
    read('../components/registration-hold.module.css'),
    read('../app/evento/[slug]/inscricao/page.tsx'),
  ]);
  assert.match(page, /RegistrationFormBuilder/u);
  assert.match(page, /RegistrationHold/u);
  assert.match(layout, /RegistrationHoldNotice/u);
  assert.match(hold, /Salvar tempo da reserva/u);
  assert.match(hold, /15 minutos, padrão sugerido/u);
  assert.match(notice, /registrationMode !== 'PAID'/u);
  assert.match(notice, /A vaga paga fica reservada por/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(formPage, /PublicRegistrationForm/u);
  assert.match(formPage, /registration-main/u);
  assert.doesNotMatch(notice, /organizationId|registrationData/u);
  assert.doesNotMatch(formPage, /RegistrationHoldNotice/u);
});
