import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../components/event-workspace.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

test('painel aguarda capacidades e mantém o menu fechado se a consulta falhar', () => {
  const payload = { event: { id: 'evt', name: 'Teste', organization: { name: 'Org' } } };
  for (const [state, expected] of [
    [undefined, 'LoadingPanel'], [null, 'ClosedPanel'], [{ papel: 'OPERATOR' }, 'RestrictedOperatorFrame'],
  ]) {
    let index = 0;
    const modules = {
      react: {
        useRef: () => ({ current: null }), useEffect: () => {},
        useState: initial => {
          const value = typeof initial === 'function' ? initial() : initial;
          return [index++ === 4 && state !== undefined ? state : value, () => {}];
        },
      },
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
      'next/navigation': { useRouter: () => ({}), usePathname: () => '/painel' },
      '../lib/event-flow': {
        initialWorkspaceView: eventId => ({ eventId }), acceptWorkspacePayload: view => view,
        visibleWorkspacePayload: () => payload, workspaceShell: () => 'ready',
      },
      '../lib/operator-workspace-nav': { isPapelOperadorRestrito: role => role === 'OPERATOR' },
    };
    const exports = {};
    runInNewContext(compiled, { exports, require: name => modules[name] ?? {} });
    const result = exports.default({ eventId: 'evt', section: 'overview', payload, children: null });
    assert.equal(result.type.name, expected);
  }
});
