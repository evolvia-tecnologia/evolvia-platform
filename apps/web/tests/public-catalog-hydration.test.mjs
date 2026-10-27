import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = (relative) => ts.transpileModule(
  readFileSync(new URL(relative, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

function tree(node) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(tree);
  const props = {};
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (typeof value === 'function') continue;
    props[key] = key === 'children' ? tree(value) : value;
  }
  return { type: node.type, props };
}

async function renderSuggest(currentSearch) {
  const key = `suggest${Math.random().toString(36).slice(2)}`;
  globalThis[key] = {
    state(initial) { return [typeof initial === 'function' ? initial() : initial, () => undefined]; },
    ref(initial) { return { current: initial }; },
    effect() {},
    jsx(type, props) { return { type, props }; },
  };
  const source = compile('../components/public-region-suggest.tsx')
    .replace(/from ['"]react['"]/g, `from ${JSON.stringify(dataUrl(`export const useState=globalThis[${JSON.stringify(key)}].state;export const useRef=globalThis[${JSON.stringify(key)}].ref;export const useEffect=globalThis[${JSON.stringify(key)}].effect;`))}`)
    .replace(/from ['"]react\/jsx-runtime['"]/g, `from ${JSON.stringify(dataUrl(`export const jsx=globalThis[${JSON.stringify(key)}].jsx;export const jsxs=jsx;`))}`)
    .replace(/from ['"]next\/navigation['"]/g, `from ${JSON.stringify(dataUrl('export function useRouter(){return {push(){}}}'))}`)
    .replace(/from ['"]\.\.\/lib\/public-discovery['"]/g, `from ${JSON.stringify(dataUrl(compile('../lib/public-discovery.ts')))}`)
    .replace(/from ['"]\.\.\/app\/eventos\/page\.module\.css['"]/g, `from ${JSON.stringify(dataUrl('export default new Proxy({}, {get:(_,name)=>name});'))}`);
  const { default: Suggest } = await import(dataUrl(source));
  try {
    return tree(Suggest({ currentSearch }));
  } finally {
    delete globalThis[key];
  }
}

test('sugestão de região não suspende e o primeiro HTML é o mesmo em CURRENT/PAST/ALL', async () => {
  const [catalog, suggest, hydration] = await Promise.all([
    readFile(new URL('../app/eventos/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/public-region-suggest.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../scripts/validate-public-catalog-hydration.mjs', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(suggest, /useSearchParams/u);
  assert.match(catalog, /<Suspense key="public-catalog-content" fallback=\{null\}>/u);
  assert.match(catalog, /<PublicRegionSuggest currentSearch=/u);
  assert.match(hydration, /\/eventos\?period=CURRENT/u);
  assert.match(hydration, /\/eventos\?period=PAST/u);
  assert.match(hydration, /\/eventos\?period=ALL/u);
  assert.match(hydration, /width: 320, height: 720/u);
  assert.match(hydration, /width: 390, height: 844/u);
  assert.match(hydration, /width: 1366, height: 768/u);

  const empty = await renderSuggest('');
  const past = await renderSuggest('period=PAST');
  const current = await renderSuggest('period=CURRENT');
  const all = await renderSuggest('period=ALL');
  assert.deepEqual(empty, past);
  assert.deepEqual(past, current);
  assert.deepEqual(current, all);
  assert.equal(empty.type, 'div');
  assert.equal(empty.props.children[0].type, 'button');
  assert.equal(empty.props.children[0].props.children, 'Sugerir minha região');
  assert.equal(empty.props.children[1].props.children, '');
});
