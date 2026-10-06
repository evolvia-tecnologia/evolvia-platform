import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const modules = {
  'react/jsx-runtime': pathToFileURL(require.resolve('react/jsx-runtime')).href,
  '../lib/post-event-insights': url(compile(readFileSync(new URL('../lib/post-event-insights.ts', import.meta.url), 'utf8'))),
  '../lib/post-event-report': url(compile(readFileSync(new URL('../lib/post-event-report.ts', import.meta.url), 'utf8'))),
  './post-event-reports.module.css': url('export default new Proxy({}, {get:(_,key)=>key});'),
};
const source = compile(readFileSync(new URL('../components/post-event-overview.tsx', import.meta.url), 'utf8'));
const { default: Overview } = await import(url(source.replace(/from ['"]([^'"]+)['"]/g, (_, name) => `from ${JSON.stringify(modules[name] ?? name)}`)));
const report = { event: { timeZone: 'UTC' }, attendanceEnabled: true, registration: { confirmed: 4, present: 3, absent: 1 }, categories: [{ label: 'Estudantes', registered: 4 }], firstCheckInByHour: [{ label: '2026-10-06 09:00', count: 3 }], scientific: null };
const render = (data) => renderToStaticMarkup(React.createElement(Overview, { report: data }));
test('visão usa números textuais e gráfico coerente com o denominador', () => {
  const html = render(report); assert.match(html, /75%/); assert.match(html, /3 inscrições credenciadas de 4 inscrições confirmadas/); assert.match(html, /aria-hidden="true"/);
  assert.match(html, /width:75%/); assert.match(html, /Somente inscrições confirmadas/);
});
test('sem credenciamento, a visão não acessa horários ausentes nem mostra taxa', () => {
  const html = render({ ...report, attendanceEnabled: false, firstCheckInByHour: null });
  assert.doesNotMatch(html, /Taxa de credenciamento|Horários com mais/); assert.match(html, /Inscrições por categoria/);
});
test('arrays ausentes são seguros e nenhuma população gera percentual inventado', () => {
  const html = render({ ...report, categories: null, firstCheckInByHour: null, scientific: { submissions: null }, registration: { confirmed: 0, present: 0, absent: 0 } });
  assert.match(html, /Sem inscrições confirmadas/); assert.doesNotMatch(html, /Situação dos trabalhos/);
});
test('rótulos são escapados e recortes top-8 explicitam categorias restantes', () => {
  const html = render({ ...report, categories: Array.from({length:9}, (_, i) => ({ label: i ? 'Categoria '+i : '<img src=x>', registered: 10-i })) });
  assert.match(html, /As oito maiores categorias/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x>/);
});
test('resumo usa concordância singular e títulos revisados em português', () => {
  const html = render({ ...report, registration: { confirmed: 1, present: 1, absent: 0 } });
  assert.match(html, /1 inscrição credenciada de 1 inscrição confirmada/);
  assert.match(html, /Horários com mais primeiros credenciamentos/);
  assert.doesNotMatch(html, /1 inscrições|mais primeiro credenciamento/);
});
