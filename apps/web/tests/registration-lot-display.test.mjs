import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a inscrição pública mostra o prazo e a tela de lotes guarda a escolha', async () => {
  const [page, categories, window, panel, css] = await Promise.all([
    read('../app/evento/[slug]/inscricao/page.tsx'),
    read('../app/eventos/[id]/painel/inscricoes/categorias-lotes/page.tsx'),
    read('../components/registration-lot-window.tsx'),
    read('../components/registration-lot-display.tsx'),
    read('../components/registration-lot-display.module.css'),
  ]);
  assert.match(page, /PublicRegistrationForm/u);
  assert.match(page, /RegistrationLotWindow slug=\{slug\}/u);
  assert.match(categories, /RegistrationCommercialBuilder/u);
  assert.match(categories, /RegistrationLotDisplay eventId=\{id\}/u);
  assert.match(window, /PRAZO DA INSCRIÇÃO/u);
  assert.match(window, /Escada de preços/u);
  assert.match(window, /Abre em/u);
  assert.match(panel, /Só o lote atual/u);
  assert.match(panel, /Escada de preços/u);
  assert.match(panel, /registration-lot-display/u);
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.doesNotMatch(window, /registrationData|organizationId/u);
  assert.doesNotMatch(panel, /organizationId/u);
});
