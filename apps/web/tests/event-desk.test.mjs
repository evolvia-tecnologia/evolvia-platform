import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const desk = await readFile(new URL('../components/event-desk.tsx', import.meta.url), 'utf8');
const labelSettings = await readFile(new URL('../components/credential-label-settings.tsx', import.meta.url), 'utf8');
const kiosk = await readFile(new URL('../components/self-service-kiosk.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/eventos/[id]/painel/check-in/page.tsx', import.meta.url), 'utf8');
const deskCss = await readFile(new URL('../components/event-desk.module.css', import.meta.url), 'utf8');
const kioskCss = await readFile(new URL('../components/self-service-kiosk.module.css', import.meta.url), 'utf8');
const labelCss = await readFile(new URL('../components/credential-label.module.css', import.meta.url), 'utf8');

test('a portaria segue recursos ativos e não o perfil do evento', () => {
  assert.match(page, /<EventDesk eventId=\{id\} \/>/u);
  assert.match(desk, /access_control/u);
  assert.match(desk, /material_delivery/u);
  assert.match(desk, /credential/u);
  assert.match(desk, /Imprimir credencial/u);
  assert.match(desk, /Registrar material/u);
  assert.match(desk, /Registrar acesso à atividade/u);
  assert.match(desk, /Confirmar inscrição gratuita/u);
  assert.match(desk, /Alterar cadastro/u);
  assert.match(desk, /role === 'OWNER'/u);
  assert.match(desk, /Nova inscrição/u);
  assert.match(desk, /embedded/u);
  assert.match(desk, /Inscrição paga segue na página pública/u);
  assert.match(desk, /lot\.priceCents > 0/u);
  assert.doesNotMatch(desk, /SCIENTIFIC_EVENT|CORPORATE_TRAINING|FAIR_EXHIBITION|ENTERTAINMENT|SOCIAL_COMMUNITY/u);
  assert.match(desk, /Autoatendimento do totem/u);
  assert.match(desk, /Links do credenciamento/u);
  assert.match(desk, /Posto da equipe/u);
  assert.match(desk, /Leitor de QR/u);
  assert.match(desk, /Totem de autoatendimento/u);
  assert.match(kiosk, /Imprima sua etiqueta/u);
  assert.match(kiosk, /Insira o número do seu CPF/u);
  assert.match(kiosk, /Apresente o QR Code ou o código de barras da etiqueta para leitura/u);
  assert.match(desk, /CredentialLabelSettings/u);
  assert.match(labelSettings, /Etiqueta térmica/u);
  assert.match(labelSettings, /4×2 cm/u);
  assert.match(labelSettings, /10×5 cm/u);
  assert.match(labelSettings, /Personalizada/u);
  assert.match(labelSettings, /Nome para crachá/u);
  assert.match(labelSettings, /Só código de barras/u);
  assert.match(kiosk, /self-service/u);
  assert.doesNotMatch(kiosk, /SCIENTIFIC_EVENT|CORPORATE_TRAINING|FAIR_EXHIBITION|ENTERTAINMENT|SOCIAL_COMMUNITY/u);
});

test('posto e autoatendimento usam tokens e alvos de toque', () => {
  for (const source of [deskCss, kioskCss, labelCss]) {
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/u);
    assert.match(source, /var\(--color-brand-blue-600\)/u);
    assert.match(source, /forced-colors: active/u);
  }
  assert.match(deskCss, /min-height: var\(--space-44\)/u);
  assert.match(kioskCss, /min-height: var\(--space-56\)/u);
  assert.match(deskCss, /@media print/u);
});
