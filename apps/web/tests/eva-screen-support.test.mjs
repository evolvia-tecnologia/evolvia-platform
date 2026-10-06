import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [guides, widget, help, registration, participant, desk, kiosk, operations, invitation, access, financial, helpIndex, helpArticle, account] = await Promise.all([
  '../lib/eva-support-guides.ts',
  '../components/eva-screen-support.tsx',
  '../components/scientific-eva-help.tsx',
  '../components/public-registration-form.tsx',
  '../components/participant-area.tsx',
  '../components/event-desk.tsx',
  '../components/self-service-kiosk.tsx',
  '../components/registration-operations.tsx',
  '../app/convites/cientificos/[token]/page.tsx',
  '../app/acesso/page.tsx',
  '../app/eventos/[id]/painel/financeiro/page.tsx',
  '../app/ajuda/page.tsx',
  '../components/public-help-article.tsx',
  '../app/participante/page.tsx',
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

test('a ajuda da EVA permanece local e não encaminha dados para fora', () => {
  assert.match(help, /não envia dados pessoais, documentos ou segredos para fora do Evolvia/u);
  assert.doesNotMatch(`${guides}\n${widget}\n${help}`, /fetch\(|openai|anthropic|api\.openai|https?:\/\//iu);
  for (const guide of ['participant', 'registration', 'kiosk', 'desk', 'registrations', 'help', 'invitation', 'access', 'financial']) {
    assert.match(guides, new RegExp(`${guide}:`, 'u'));
  }
});

test('cada perfil de apoio abre a mesma EVA, sem outro componente', () => {
  const mounts = [
    [registration, 'registration'],
    [participant, 'participant'],
    [account, 'participant'],
    [desk, 'desk'],
    [kiosk, 'kiosk'],
    [operations, 'registrations'],
    [invitation, 'invitation'],
    [access, 'access'],
    [financial, 'financial'],
    [helpIndex, 'help'],
    [helpArticle, 'help'],
  ];
  for (const [source, guide] of mounts) {
    assert.match(source, new RegExp(`<EvaScreenSupport guide="${guide}"`, 'u'));
  }
  assert.match(widget, /ScientificEvaHelp/u);
  assert.doesNotMatch(widget, /fetch\(/u);
});
