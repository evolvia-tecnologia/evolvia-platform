import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const desk = await readFile(new URL('../components/event-desk.tsx', import.meta.url), 'utf8');
const kiosk = await readFile(new URL('../app/evento/[slug]/autoatendimento/page.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/eventos/[id]/painel/check-in/page.tsx', import.meta.url), 'utf8');
const deskCss = await readFile(new URL('../components/event-desk.module.css', import.meta.url), 'utf8');
const kioskCss = await readFile(new URL('../app/evento/[slug]/autoatendimento/page.module.css', import.meta.url), 'utf8');

test('a portaria segue recursos ativos e não o perfil do evento', () => {
  assert.match(page, /<EventDesk eventId=\{id\} \/>/u);
  assert.match(desk, /access_control/u);
  assert.match(desk, /material_delivery/u);
  assert.match(desk, /credential/u);
  assert.match(desk, /Imprimir credencial/u);
  assert.match(desk, /Registrar material/u);
  assert.match(desk, /Registrar acesso à atividade/u);
  assert.match(desk, /Confirmar inscrição gratuita/u);
  assert.match(desk, /Inscrição paga segue na página pública/u);
  assert.match(desk, /lot\.priceCents > 0/u);
  assert.doesNotMatch(desk, /SCIENTIFIC_EVENT|CORPORATE_TRAINING|FAIR_EXHIBITION|ENTERTAINMENT|SOCIAL_COMMUNITY/u);
  assert.match(kiosk, /O protocolo da inscrição não registra a entrada/u);
  assert.match(kiosk, /self-check-in/u);
});

test('posto e autoatendimento usam tokens e alvos de toque', () => {
  for (const source of [deskCss, kioskCss]) {
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/u);
    assert.match(source, /var\(--color-brand-blue-600\)/u);
    assert.match(source, /forced-colors: active/u);
  }
  assert.match(deskCss, /min-height: var\(--space-44\)/u);
  assert.match(kioskCss, /min-height: var\(--space-56\)/u);
  assert.match(deskCss, /@media print/u);
});
