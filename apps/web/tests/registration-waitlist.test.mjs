import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('página da fila exige conta, mostra a própria posição e oferece voltar', async () => {
  const [page, component] = await Promise.all([
    read('../app/evento/[slug]/inscricao/fila/page.tsx'),
    read('../components/registration-waitlist.tsx'),
  ]);
  assert.match(page, /<RegistrationWaitlist slug=\{slug\} \/>/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(component, /getToken\(\)/u);
  assert.match(component, /Entre na sua conta para usar a fila/u);
  assert.match(component, /\/participant\/events\/\$\{encodeURIComponent\(slug\)\}\/waitlist/u);
  assert.match(component, /Você está na posição <strong>\{entry\.position\}<\/strong> da fila/u);
  assert.match(component, /Voltar à inscrição/u);
  assert.match(component, /Voltar ao evento/u);
  assert.match(component, /Fila indisponível/u);
  assert.match(component, /Nenhum lote com fila aberta agora/u);
  assert.match(component, /Prazo vencido/u);
  assert.match(component, /method: 'DELETE'/u);
  assert.match(component, /\?oferta=\$\{encodeURIComponent\(entry\.lotId\)\}/u);
  assert.match(component, /Entrar na fila não cobra nada/u);
});

test('participante não recebe dados de terceiros e organizador vê só códigos pseudônimos', async () => {
  const component = await read('../components/registration-waitlist.tsx');
  const ownEntry = component.match(/type OwnEntry = \{[\s\S]*?\};/u)?.[0] ?? '';
  const organizerEntry = component.match(/type OrganizerEntry = \{[\s\S]*?\};/u)?.[0] ?? '';
  for (const shape of [ownEntry, organizerEntry]) {
    assert.ok(shape.length > 0);
    assert.doesNotMatch(shape, /email|document|cpf|\bname:/iu);
  }
  assert.match(organizerEntry, /code: string/u);
  assert.match(component, /entry\.code/u);
});

test('painel de inscrições configura prazo, promove com idempotência e explica a ordem', async () => {
  const [operations, component] = await Promise.all([
    read('../components/registration-operations.tsx'),
    read('../components/registration-waitlist.tsx'),
  ]);
  assert.match(operations, /<RegistrationWaitlistOrganizer eventId=\{eventId\} \/>/u);
  assert.match(component, /\/events\/\$\{encodeURIComponent\(eventId\)\}\/registration-waitlist/u);
  assert.match(component, /method: 'PATCH'/u);
  assert.match(component, /'idempotency-key': key/u);
  assert.match(component, /promotionKeys\[lot\.lotId\] \?\? newKey/u);
  assert.match(component, /Promover próximo da fila/u);
  assert.match(component, /Não marca pagamento nem entrada/u);
  assert.match(component, /Prazo para confirmar a vaga/u);
  assert.match(component, /Fechar a fila em \(opcional\)/u);
  assert.match(component, /overview\.canManage/u);
});

test('estilos da fila usam tokens, alvo de toque e foco visível', async () => {
  const css = await read('../components/registration-waitlist.module.css');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/iu);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(max-width: 640px\)/u);
  assert.match(css, /forced-colors: active/u);
});
