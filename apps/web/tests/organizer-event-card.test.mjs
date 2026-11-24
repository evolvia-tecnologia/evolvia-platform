import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
import { loadPublicationSource } from './helpers/publication-source.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const {
  countCompletedFoundations,
  countDraftsToContinue,
  eventFormatCaption,
  eventListAction,
  foundationProgress,
} = await loadPublicationSource('organizer-event-card');

const STATUSES = ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED'];
const WIZARDS = ['ACTIVE', 'COMPLETED', 'ABANDONED', null];
const PERCENTS = [0, 92, 100];
const PROFILES = [
  ['CORPORATE_TRAINING', 'Convenção'],
  ['SCIENTIFIC_EVENT', 'Congresso'],
  ['FAIR_EXHIBITION', 'Feira'],
  ['ENTERTAINMENT', 'Show ou entretenimento'],
  ['SOCIAL_COMMUNITY', 'Corrida'],
];

function expectedAction(status, wizardStatus) {
  if (status === 'PUBLISHED') return ['Gerenciar evento', '/eventos/evt/painel', true];
  if (status === 'SUSPENDED') return ['Gerenciar evento', '/eventos/evt/painel', false];
  if (status === 'FINISHED' || status === 'CANCELLED') return ['Consultar evento', '/eventos/evt/painel', false];
  if (status === 'HOMOLOGATION' || status === 'READY_TO_PUBLISH') return ['Revisar publicação', '/eventos/evt/painel/divulgacao', false];
  if ((status === 'DRAFT' || status === 'SETUP') && wizardStatus === 'ACTIVE') return ['Continuar configuração', '/eventos/evt/configuracao', true];
  return ['Revisar evento', '/eventos/evt/painel', false];
}

test('o botão segue a situação do evento, não o wizard, nos oito estados e quatro andamentos', () => {
  for (const status of STATUSES) {
    for (const wizardStatus of WIZARDS) {
      for (const percent of PERCENTS) {
        const action = eventListAction(status, wizardStatus, 'evt');
        assert.deepEqual(
          [action.label, action.href, action.primary],
          expectedAction(status, wizardStatus),
          `${status} ${wizardStatus} ${percent}`,
        );
        assert.equal(action.href.includes('publicar'), false);
        assert.notEqual(action.label, 'Publicar');
      }
    }
  }
});

test('o progresso da fundação não vira 100 quando o wizard falta, e o formato publicado permanece', () => {
  assert.equal(foundationProgress(null), null);
  assert.equal(foundationProgress(undefined), null);
  for (const percent of PERCENTS) assert.equal(foundationProgress({ completionPercent: percent }), percent);
  for (const status of ['PUBLISHED', 'SUSPENDED', 'FINISHED', 'HOMOLOGATION', 'READY_TO_PUBLISH']) {
    assert.equal(eventFormatCaption(status, 'IN_PERSON', { status: 'ACTIVE', completionPercent: 0 }), 'Presencial');
    assert.equal(eventFormatCaption(status, 'HYBRID', { status: 'ACTIVE', completionPercent: 92 }), 'Híbrido');
  }
  assert.equal(eventFormatCaption('DRAFT', 'ONLINE', { status: 'ACTIVE', completionPercent: 0 }), 'Formato a definir');
  assert.equal(eventFormatCaption('SETUP', 'ONLINE', { status: 'ACTIVE', completionPercent: 19 }), 'Formato a definir');
  assert.equal(eventFormatCaption('DRAFT', 'ONLINE', { status: 'ACTIVE', completionPercent: 92 }), 'Online');
  assert.equal(eventFormatCaption('DRAFT', 'ONLINE', { status: 'COMPLETED', completionPercent: 0 }), 'Online');
  assert.equal(eventFormatCaption('PUBLISHED', 'IN_PERSON', null), 'Presencial');
});

test('rascunho publicado com wizard ativo não entra na métrica de rascunho nem fundação inventada', () => {
  const events = [
    { status: 'PUBLISHED', wizard: { status: 'ACTIVE', completionPercent: 92 } },
    { status: 'DRAFT', wizard: { status: 'ACTIVE', completionPercent: 0 } },
    { status: 'SETUP', wizard: { status: 'ACTIVE', completionPercent: 92 } },
    { status: 'DRAFT', wizard: { status: 'COMPLETED', completionPercent: 100 } },
    { status: 'DRAFT', wizard: { status: 'ABANDONED', completionPercent: 100 } },
    { status: 'FINISHED', wizard: null },
    { status: 'CANCELLED', wizard: { status: 'COMPLETED', completionPercent: 100 } },
  ];
  assert.equal(countDraftsToContinue(events), 2);
  assert.equal(countCompletedFoundations(events), 3);
  assert.equal(countCompletedFoundations([{ status: 'PUBLISHED', wizard: null }]), 0);
});

function loadCard() {
  const cache = new Map();
  const directory = fileURLToPath(new URL('../components/', import.meta.url));
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const result = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    new Function('require', 'module', 'exports', result.outputText)((name) => {
      if (name === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
      if (name.startsWith('.')) return load(resolve(dirname(path), `${name}.ts`));
      return require(name);
    }, module, module.exports);
    return module.exports;
  }
  return load(resolve(directory, 'organizer-event-card.tsx')).default;
}

const text = (node) => node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');

test('cinco perfis mostram o mesmo destino, com selo, progresso e botão separados, também no mobile', async () => {
  const Card = loadCard();
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /@media\(max-width:700px\)\{[\s\S]*\.event-card-footer\{align-items:stretch;flex-direction:column\}/u);
  for (const mobile of [false, true]) {
    const previousWindow = globalThis.window;
    globalThis.window = { matchMedia: () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} }) };
    let tree;
    try {
      await act(async () => {
        tree = create(React.createElement(React.Fragment, null, PROFILES.map(([profile, eventType]) => React.createElement(Card, {
          key: profile,
          item: {
            id: profile,
            name: eventType,
            eventType,
            format: 'IN_PERSON',
            status: 'PUBLISHED',
            updatedAt: '2026-11-17T12:00:00.000Z',
            organization: { name: 'Organização' },
            wizard: { status: 'ACTIVE', completionPercent: 92 },
            capabilityCodes: [],
          },
        }))));
      });
      const links = tree.root.findAllByType('a');
      assert.equal(links.length, PROFILES.length);
      for (const link of links) {
        assert.equal(link.props.href, `/eventos/${link.props.href.split('/')[2]}/painel`);
        assert.equal(text(link).replace('→', ''), 'Gerenciar evento');
        assert.equal(link.props.tabIndex, undefined);
      }
      const bars = tree.root.findAllByProps({ role: 'progressbar' });
      assert.equal(bars.length, PROFILES.length);
      for (const bar of bars) {
        assert.equal(bar.props['aria-valuenow'], 92);
        assert.equal(bar.props['aria-valuetext'], '92%');
      }
      assert.equal(tree.root.findAllByProps({ className: 'event-status status-published' }).length, PROFILES.length);
      assert.match(text(tree.root), /Progresso da fundação/);
      assert.doesNotMatch(text(tree.root), /Continuar configuração/);
    } finally {
      if (tree) await act(async () => tree.unmount());
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  }
});
