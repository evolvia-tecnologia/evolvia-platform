import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const data = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const hooksUrl = data(`let slots=[],cursor=0,effects=[];export const reset=()=>{cursor=0};export const unmount=()=>{slots.forEach(s=>s?.cleanup?.());slots=[];effects=[]};export const run=()=>{const list=effects;effects=[];list.forEach(f=>f())};export function useState(init){const i=cursor++,target=slots;if(!(i in target))target[i]=typeof init==='function'?init():init;return[target[i],v=>{target[i]=typeof v==='function'?v(target[i]):v}]};export function useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i]};export function useMemo(fn){return fn()};export function useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const entry={deps};slots[i]=entry;effects.push(()=>{old?.cleanup?.();entry.cleanup=fn()})}}`);
const apiUrl = data(`export const calls=[];export const getToken=()=>'sessao';export const api=(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}));`);
const modules = {
  react: hooksUrl,
  'react/jsx-runtime': data('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'),
  'next/link': data('export default "a";'),
  'next/navigation': data('export const useRouter=()=>({replace(){}});'),
  '../lib/api': apiUrl,
  '../lib/benefit-api-feedback': data(compile('../lib/benefit-api-feedback.ts')),
  '../lib/benefit-save-lock': data(compile('../lib/benefit-save-lock.ts')),
  './registration-benefits-builder.module.css': data('export default new Proxy({},{get:(_,key)=>key})'),
};
const source = compile('../components/registration-benefits-builder.tsx').replace(/from ['"]([^'"]+)['"]/g, (_, key) => 'from ' + JSON.stringify(modules[key]));
const { default: View } = await import(data(source));
const hooks = await import(hooksUrl);
const api = await import(apiUrl);
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const render = () => { hooks.reset(); return View({ eventId: 'event-a' }); };
const invitation = {
  id: 'benefit-1',
  code: 'CONVITE-1',
  name: 'Convite',
  kind: 'INVITATION',
  discountPercent: 0,
  maxUses: 1,
  usedCount: 1,
  validFrom: '2026-11-01T13:00:00.000Z',
  validUntil: '2026-12-01T13:00:00.000Z',
  active: true,
  sortOrder: 0,
};

async function boot(mode = 'PAID') {
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  globalThis.document = { getElementById: () => ({ focus() {} }) };
  render();
  hooks.run();
  const list = api.calls.at(-2);
  const uses = api.calls.at(-1);
  assert.match(list.path, /\/registration-benefits$/);
  assert.match(uses.path, /\/registration-benefits\/uses$/);
  list.resolve({
    event: { id: 'event-a', name: 'Corrida', status: 'PUBLISHED', registrationMode: mode },
    revision: 2,
    benefits: [invitation],
    publicRedemptionEnabled: false,
    message: 'Controle antes da liberação.',
  });
  uses.resolve({ benefits: [{ id: 'benefit-1', code: 'CONVITE-1', name: 'Convite', usedCount: 1, remaining: 0, uses: [] }] });
  await tick();
  return render();
}

const footerSave = (tree) => nodes(tree).filter((node) => node.type === 'button' && node.props.type === 'submit' && text(node) === 'Salvar benefícios').at(-1);
const form = (tree) => nodes(tree).find((node) => node.type === 'form');

test('o rodapé salva uma vez, recupera o erro e só confirma a lista devolvida', async () => {
  try {
    const marked = api.calls.length;
    let tree = await boot();
    assert.match(text(tree), /Este código está esgotado/);
    assert.equal(footerSave(tree).props.disabled, true);
    nodes(tree).find((node) => node.props?.id === 'benefit-0-name').props.onChange({ target: { value: 'Convite da organização' } });
    tree = render();
    assert.equal(footerSave(tree).props.disabled, false);
    assert.equal(footerSave(tree).props.type, 'submit');
    const before = api.calls.length;
    form(tree).props.onSubmit({ preventDefault() {} });
    form(tree).props.onSubmit({ preventDefault() {} });
    const saves = api.calls.slice(before);
    assert.equal(saves.length, 1, 'Enter e um segundo envio no mesmo instante não duplicam a gravação');
    const save = saves[0];
    assert.equal(save.options.method, 'PUT');
    const body = JSON.parse(save.options.body);
    assert.equal(body.expectedRevision, 2);
    assert.equal(body.benefits[0].name, 'Convite da organização');
    assert.equal(body.benefits[0].kind, 'INVITATION');
    assert.equal(body.benefits[0].discountPercent, 0);
    save.reject(new Error('O nome do benefício é inválido.'));
    await tick();
    tree = render();
    assert.match(text(tree), /O nome do benefício é inválido/);
    assert.doesNotMatch(text(tree), /salvos/);
    assert.equal(nodes(tree).find((node) => node.props?.id === 'benefit-0-name').props.value, 'Convite da organização');
    assert.equal(footerSave(tree).props.disabled, false);
    form(tree).props.onSubmit({ preventDefault() {} });
    const retry = api.calls.at(-1);
    assert.notEqual(retry, save);
    retry.resolve({
      event: { id: 'event-a', name: 'Corrida', status: 'PUBLISHED', registrationMode: 'PAID' },
      revision: 3,
      benefits: [{ ...invitation, name: 'Nome antigo' }],
      publicRedemptionEnabled: false,
      message: 'Controle antes da liberação.',
    });
    await tick();
    tree = render();
    assert.match(text(tree), /manteve a lista anterior/);
    assert.equal(nodes(tree).find((node) => node.props?.id === 'benefit-0-name').props.value, 'Convite da organização');
    form(tree).props.onSubmit({ preventDefault() {} });
    const confirmed = api.calls.at(-1);
    const sent = JSON.parse(confirmed.options.body);
    confirmed.resolve({
      event: { id: 'event-a', name: 'Corrida', status: 'PUBLISHED', registrationMode: 'PAID' },
      revision: 4,
      benefits: sent.benefits.map((item) => ({ ...invitation, ...item, id: 'benefit-1', usedCount: 1 })),
      publicRedemptionEnabled: false,
      message: 'Controle antes da liberação.',
    });
    await tick();
    tree = render();
    assert.match(text(tree), /Cupons, convites e cortesias salvos/);
    assert.equal(footerSave(tree).props.disabled, true);
    const after = api.calls.length;
    form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(api.calls.length, after);
    assert.ok(api.calls.length > marked);
  } finally {
    hooks.unmount();
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
  }
});

test('evento gratuito oferece convite e não oferece desconto comercial', async () => {
  try {
    const tree = await boot('FREE');
    const add = nodes(tree).filter((node) => node.type === 'button' && node.props.type === 'button');
    const coupon = add.find((node) => text(node).includes('Cupom'));
    const invitationButton = add.find((node) => text(node).includes('Convite'));
    const courtesy = add.find((node) => text(node).includes('Cortesia'));
    assert.equal(coupon.props.disabled, true);
    assert.equal(courtesy.props.disabled, true);
    assert.equal(invitationButton.props.disabled, false);
    assert.match(text(tree), /Convite não aplica desconto/);
    assert.equal(nodes(tree).find((node) => node.props?.id === 'benefit-0-discountPercent').props.disabled, true);
  } finally {
    hooks.unmount();
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
  }
});
