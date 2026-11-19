import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const url = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const all = (n, predicate, out = []) => {
  if (!n || typeof n !== 'object') return out;
  if (Array.isArray(n)) { n.forEach((x) => all(x, predicate, out)); return out; }
  if (predicate(n)) out.push(n);
  return all(n.props?.children, predicate, out);
};
const text = (n) => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : String(n ?? '');
const flush = () => new Promise((r) => setImmediate(r));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const link = (js, modules) => url(js.replace(/from ['"]([^'"]+)['"]/g, (_, n) => { assert.ok(modules[n], `módulo não mapeado: ${n}`); return 'from ' + JSON.stringify(modules[n]); }));
const identitySource = await readFile(new URL('../components/exhibitor-event-identity.tsx', import.meta.url), 'utf8');

function runtime(api = async () => { throw new Error('unexpected'); }, token = null) {
  const slots = []; let cursor = 0; const effects = [];
  const state = (initial) => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v) => slots[i] = typeof v === 'function' ? v(slots[i]) : v]; };
  const key = 'identity' + Math.random();
  globalThis[key] = { useState: state, useRef: (v) => state({ current: v })[0], useId: () => 'panel', useEffect: (fn, deps) => {
    const i = cursor++; if (!slots[i] || deps.some((v, j) => v !== slots[i].deps[j])) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
  }, api: (...args) => api(...args), getToken: () => token, clearSession: () => {} };
  const g = 'globalThis[' + JSON.stringify(key) + ']';
  const modules = {
    react: url(`export const {useState,useRef,useId,useEffect}=${g};`),
    'react/jsx-runtime': url('export const Fragment="fragment";export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;'),
    'next/link': url('export default "a";'),
    './eva-screen-support': url('export default "eva";'),
    './exhibitor-event-identity.module.css': url('export default {};'),
    './exhibitor-company-area.module.css': url('export default {};'),
    './event-exhibitors.module.css': url('export default {};'),
    '../lib/api': url(`export class ApiError extends Error{};export const {api,getToken,clearSession}=${g};`),
  };
  modules['./exhibitor-event-identity'] = link(transpile(identitySource), modules);
  return {
    modules,
    render(fn, props) { cursor = 0; const tree = fn(props); effects.splice(0).forEach((f) => f()); return tree; },
    dispose() { slots.forEach((s) => s?.cleanup?.()); delete globalThis[key]; },
  };
}

const identityA = {
  event: { name: 'Feira Alfa', slug: 'feira-alfa' },
  logo: { url: '/api/public/events/feira-alfa/exhibitor-identity/logo?v=logoalfa', width: 600, height: 200 },
  support: { email: 'suporte@alfa.com.br', whatsapp: { number: '5511988887777', label: '(11) 98888-7777' } },
};
const identityB = { event: { name: 'Feira Beta', slug: 'feira-beta' }, logo: null, support: { email: null, whatsapp: null } };

test('links de suporte aceitam somente mailto simples e wa.me numérico', async () => {
  const r = runtime();
  try {
    const m = await import(r.modules['./exhibitor-event-identity']);
    assert.equal(m.mailtoHref('suporte@alfa.com.br'), 'mailto:suporte@alfa.com.br');
    assert.equal(m.whatsappHref('5511988887777'), 'https://wa.me/5511988887777');
    for (const bad of ['a@b.com?bcc=x@y.com', 'javascript:alert(1)', 'a@b', '', null, 'x@y.com\nBcc:z@w.com']) assert.equal(m.mailtoHref(bad), null);
    for (const bad of ['+5511988887777', '11 98888-7777', '0511988887777', 'https://evil.example', '1234567', '1'.repeat(16), 5511988887777]) assert.equal(m.whatsappHref(bad), null);
  } finally { r.dispose(); }
});

test('payload de identidade de outro evento, logo externa ou contatos inválidos não são aceitos', async () => {
  const r = runtime();
  try {
    const m = await import(r.modules['./exhibitor-event-identity']);
    assert.deepEqual(m.parseEventIdentity(identityA, 'feira-alfa'), identityA);
    assert.equal(m.parseEventIdentity(identityA, 'feira-beta'), null);
    for (const logoUrl of ['https://evil.example/logo.png', '/api/public/events/feira-beta/exhibitor-identity/logo?v=logo', '/api/public/events/feira-alfa/exhibitor-identity/logo?v=a"onerror', 'javascript:alert(1)']) {
      assert.equal(m.parseEventIdentity({ ...identityA, logo: { ...identityA.logo, url: logoUrl } }, 'feira-alfa').logo, null);
    }
    assert.equal(m.parseEventLogo({ ...identityA.logo, width: 0 }, 'feira-alfa'), null);
    assert.deepEqual(m.parseEventIdentity({ ...identityA, support: { email: 'x@y.com?cc=z@w.com', whatsapp: { number: '+55', label: 'x' } } }, 'feira-alfa').support, { email: null, whatsapp: null });
    assert.deepEqual(m.parseEventIdentity({ event: identityB.event }, 'feira-beta'), identityB);
  } finally { r.dispose(); }
});

test('rodapé mostra apenas os canais configurados do organizador, com WhatsApp em nova aba segura', async () => {
  const r = runtime();
  try {
    const m = await import(r.modules['./exhibitor-event-identity']);
    assert.equal(m.OrganizerSupport({ support: identityB.support, eventName: 'Feira Beta' }), null);
    assert.equal(m.OrganizerSupport({ support: null, eventName: 'Feira Beta' }), null);
    const full = m.OrganizerSupport({ support: identityA.support, eventName: 'Feira Alfa' });
    assert.match(text(full), /Suporte do organizador/u);
    const links = all(full, (n) => n.type === 'a');
    assert.deepEqual(links.map((a) => a.props.href), ['https://wa.me/5511988887777', 'mailto:suporte@alfa.com.br']);
    assert.equal(links[0].props.target, '_blank');
    assert.equal(links[0].props.rel, 'noopener noreferrer');
    assert.match(links[0].props['aria-label'], /nova aba/u);
    assert.equal(links[1].props.target, undefined);
    const emailOnly = m.OrganizerSupport({ support: { email: 'suporte@alfa.com.br', whatsapp: null }, eventName: 'Feira Alfa' });
    assert.deepEqual(all(emailOnly, (n) => n.type === 'a').map((a) => a.props.href), ['mailto:suporte@alfa.com.br']);
    assert.doesNotMatch(JSON.stringify(full), /mitte/iu);
  } finally { r.dispose(); }
});

test('marca usa a logo proporcional com o nome do evento como alternativa e volta ao nome se a imagem falhar', async () => {
  const r = runtime();
  try {
    const m = await import(r.modules['./exhibitor-event-identity']);
    const props = { name: 'Feira Alfa', logo: identityA.logo };
    let tree = r.render(m.EventBrand, props);
    const img = all(tree, (n) => n.type === 'img')[0];
    assert.equal(img.props.alt, 'Feira Alfa');
    assert.equal(img.props.width, 600); assert.equal(img.props.height, 200);
    img.props.onError();
    tree = r.render(m.EventBrand, props);
    assert.equal(all(tree, (n) => n.type === 'img').length, 0);
    assert.equal(text(tree), 'Feira Alfa');
    assert.equal(text(r.render(m.EventBrand, { name: 'Feira Beta', logo: null })), 'Feira Beta');
  } finally { r.dispose(); }
});

test('troca de evento descarta identidade atrasada do evento anterior', async () => {
  let resolveAlfa;
  const calls = [];
  const r = runtime(async (path) => { calls.push(path); return path.includes('feira-alfa') ? new Promise((done) => { resolveAlfa = done; }) : identityB; });
  try {
    const m = await import(r.modules['./exhibitor-event-identity']);
    const Probe = ({ slug }) => ({ type: 'probe', props: { value: m.useEventIdentity(slug) } });
    r.render(Probe, { slug: 'feira-alfa' });
    r.render(Probe, { slug: 'feira-beta' }); await flush();
    resolveAlfa(identityA); await flush();
    const tree = r.render(Probe, { slug: 'feira-beta' });
    assert.deepEqual(tree.props.value, identityB);
    assert.deepEqual(calls, ['/public/events/feira-alfa/exhibitor-identity', '/public/events/feira-beta/exhibitor-identity']);
    const back = r.render(Probe, { slug: 'feira-alfa' });
    assert.equal(back.props.value, null);
  } finally { r.dispose(); }
});

test('entrada do portal sem sessão mostra logo e suporte do evento da rota, sem consultar dados da empresa', async () => {
  const calls = [];
  const r = runtime(async (path) => { calls.push(path); return path.includes('feira-alfa') ? identityA : identityB; });
  try {
    const source = await readFile(new URL('../components/exhibitor-company-area.tsx', import.meta.url), 'utf8');
    const mod = await import(link(transpile(source + '\nexport {CompanyDesk};'), r.modules));
    r.render(mod.CompanyDesk, { slug: 'feira-alfa' }); await flush();
    let tree = r.render(mod.CompanyDesk, { slug: 'feira-alfa' });
    assert.deepEqual(calls, ['/public/events/feira-alfa/exhibitor-identity']);
    const brand = all(tree, (n) => typeof n.type === 'function' && n.type.name === 'EventBrand')[0];
    assert.equal(brand.props.name, 'Feira Alfa');
    assert.equal(brand.props.logo.url, identityA.logo.url);
    const support = all(tree, (n) => typeof n.type === 'function' && n.type.name === 'OrganizerSupport')[0];
    assert.deepEqual(support.props.support, identityA.support);
    assert.match(text(tree), /Plataforma Evolvia/u);

    const other = runtime(async (path) => { calls.push(path); return identityB; });
    try {
      const otherMod = await import(link(transpile(source + '\nexport {CompanyDesk};'), other.modules));
      other.render(otherMod.CompanyDesk, { slug: 'feira-beta' }); await flush();
      tree = other.render(otherMod.CompanyDesk, { slug: 'feira-beta' });
      const otherBrand = all(tree, (n) => typeof n.type === 'function' && n.type.name === 'EventBrand')[0];
      assert.equal(otherBrand.props.name, 'Feira Beta');
      assert.equal(otherBrand.props.logo, null);
      assert.deepEqual(all(tree, (n) => typeof n.type === 'function' && n.type.name === 'OrganizerSupport')[0].props.support, identityB.support);
    } finally { other.dispose(); }
  } finally { r.dispose(); }
});

test('CAEX usa somente a logo do evento autorizado e cai para o nome quando ela não pertence ao evento', async () => {
  const home = (logo) => ({ event: { name: 'Feira Alfa', slug: 'feira-alfa' }, identity: { logo }, canManage: true,
    summary: { exhibitors: {}, providers: {} }, companies: [], credentials: [] });
  for (const [logo, expected] of [[identityA.logo, identityA.logo], [{ ...identityA.logo, url: '/api/public/events/feira-beta/exhibitor-identity/logo?v=x' }, null], [null, null]]) {
    const r = runtime(async () => home(logo), 'token');
    try {
      const source = await readFile(new URL('../components/exhibitor-caex.tsx', import.meta.url), 'utf8');
      const mod = await import(link(transpile(source + '\nexport {CaexDesk};'), r.modules));
      r.render(mod.CaexDesk, { eventId: 'event-a' }); await flush();
      const tree = r.render(mod.CaexDesk, { eventId: 'event-a' });
      const brand = all(tree, (n) => typeof n.type === 'function' && n.type.name === 'EventBrand')[0];
      assert.equal(brand.props.name, 'Feira Alfa');
      assert.deepEqual(brand.props.logo, expected);
    } finally { r.dispose(); }
  }
});
