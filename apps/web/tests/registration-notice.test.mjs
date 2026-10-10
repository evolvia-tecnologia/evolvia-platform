import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a tela de comunicações envia aviso só aos confirmados e não mostra endereço', async () => {
  const [page, notice, css] = await Promise.all([
    read('../app/eventos/[id]/painel/comunicacoes/page.tsx'),
    read('../components/registration-notice.tsx'),
    read('../components/registration-notice.module.css'),
  ]);
  assert.match(page, /RegistrationNotice/u);
  assert.match(page, /WhatsApp não é canal/u);
  assert.match(notice, /Todos os confirmados/u);
  assert.match(notice, /Presença do dia/u);
  assert.match(notice, /Presentes hoje/u);
  assert.match(notice, /Ausentes hoje/u);
  assert.match(notice, /Resultado científico/u);
  assert.match(notice, /ACCEPTED_WITH_CHANGES/u);
  assert.match(notice, /generateIdempotencyKey/u);
  assert.match(notice, /getRandomValues/u);
  assert.match(notice, /disabled=\{batchLocked\}/u);
  assert.match(notice, /Começar outro aviso/u);
  assert.match(notice, /!setting/u);
  assert.match(notice, /Idempotency-Key/u);
  assert.match(notice, /Os endereços não aparecem aqui/u);
  assert.match(notice, /Recado para uma inscrição/u);
  assert.match(notice, /registration-notices\/direct/u);
  assert.match(notice, /Protocolo da inscrição/u);
  assert.match(page, /resultado científico já decidido/u);
  assert.match(page, /protocolo de uma inscrição confirmada/u);
  assert.doesNotMatch(page, /ainda não filtram/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.doesNotMatch(page, /nenhum botão desta página envia/u);
  assert.doesNotMatch(notice, /organizationId|registrationData/u);
});
