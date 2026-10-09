import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const source = ts.transpileModule(await readFile(new URL('../app/evento/[slug]/avaliador/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const url = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const realReact = pathToFileURL(require.resolve('react')).href;
let sequence = 0;
async function renderArea(area) {
  const key = 'reviewHistoryHarness' + ++sequence;
  let cursor = 0;
  globalThis[key] = { jsxRuntime: require('react/jsx-runtime'), useState: initial => [cursor++ === 0 ? 'fixture-token' : cursor === 2 ? area : initial, () => {}], useEffect: () => {} };
  const hooks = url(`export const { useState, useEffect } = globalThis[${JSON.stringify(key)}];`);
  const jsx = url(`export const { jsx, jsxs, Fragment } = globalThis[${JSON.stringify(key)}].jsxRuntime;`);
  const link = url(`import React from ${JSON.stringify(realReact)}; export default ({href,children,...props})=>React.createElement('a',{href,...props},children);`);
  const modules = { react: hooks, 'react/jsx-runtime': jsx, 'next/link': link,
    'next/navigation': url('export const useParams=()=>({slug:"congresso"});'),
    '../../../../components/public-site-header': url('export default ()=>null;'),
    '../../../../components/scientific-reviews.module.css': url('export default new Proxy({}, {get:(_,key)=>String(key)});') };
  try {
    const transformed = source.replace(/from ['"]([^'"]+)['"]/g, (_match,name)=>'from '+JSON.stringify(modules[name] ?? name));
    const {default:Component} = await import(url(transformed));
    return renderToStaticMarkup(Component());
  } finally { delete globalThis[key]; }
}
const oldCriterion={id:'criterion-1',code:'metodo',label:'Método original',required:true,minScore:0,maxScore:10,weight:1};
function area(source='AT_SUBMISSION', rubric=true) {
  return { reviewerName:'Avaliador',coordinatorDecidesStatus:false,evaluationStyle:'ANALYTIC',
    criteria:[{...oldCriterion,label:'Método atual',maxScore:5,weight:3}],
    assignments:[{id:'assignment-1',status:'SUBMITTED',conflictStatus:'CLEAR',opinion:null,
      submission:{title:'Trabalho fictício',abstractText:'Resumo',authors:[]},
      revisions:[{versionNumber:1,submittedAt:'2026-10-01T12:00:00.000Z',rubric:rubric?{style:'ANALYTIC',source,criteria:[oldCriterion]}:null,
        scores:[{criterionId:oldCriterion.id,value:8}],overallScore:null,recommendation:'ACCEPT'}]}] };
}
test('histórico renderiza a rubrica e nota arquivadas, sem usar faixa ou peso atuais', async () => {
  const html=await renderArea(area());
  assert.match(html,/Rubrica arquivada na entrega deste parecer/u);
  assert.match(html,/Método original/u);
  assert.match(html,/<td>0 a 10<\/td><td>1<\/td><td>8<\/td>/u);
  assert.doesNotMatch(html,/Método atual/u);
  assert.match(html,/scope="col">Peso/u);
  assert.match(html,/aria-label="Rubrica da versão 1"/u);
});
test('snapshot legado anuncia reconstrução e ausência da configuração original', async () => {
  const html=await renderArea(area('RECONSTRUCTED_AT_REOPEN'));
  assert.match(html,/Rubrica reconstituída ao retomar/u);
  assert.match(html,/A configuração original não estava arquivada/u);
  assert.doesNotMatch(html,/Rubrica arquivada na entrega deste parecer/u);
});
test('snapshot sem origem ou inválido não inventa uma rubrica original', async () => {
  assert.match(await renderArea(area('UNKNOWN')),/Origem do snapshot não registrada/u);
  assert.match(await renderArea(area('UNKNOWN',false)),/Rubrica histórica não disponível/u);
});
