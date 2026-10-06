import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluationResults, evaluationSummaryCsv, evaluationCommentPage} from '../lib/event-evaluation-results.ts';
const questions=[{id:'q1',label:'Conteúdo',kind:'RATING',required:true},{id:'q2',label:'Sugestões',kind:'TEXT',required:false}];
const row=(id,answers)=>({id,answers,submittedAt:'2026-10-06T04:00:00Z'});
test('média e distribuição usam só notas inteiras entre 1 e 5, sem converter texto',()=>{
 const data={title:'Avaliação',questions,rows:[row('1',{q1:5,q2:'Muito bom'}),row('2',{q1:1}),row('3',{q1:'5'}),row('4',{q1:6}),row('5',{q1:3.5}),row('6',{q1:null}),row('7',{})]};
 const result=evaluationResults(data);assert.equal(result.total,7);assert.deepEqual(result.ratings[0],{id:'q1',label:'Conteúdo',answered:2,missing:2,invalid:3,average:3,distribution:[{value:1,count:1},{value:2,count:0},{value:3,count:0},{value:4,count:0},{value:5,count:1}]});assert.equal(result.texts[0].answered,1);assert.equal(result.texts[0].missing,6);
});
test('dados vazios não viram nota zero ou taxa de inscritos',()=>{const r=evaluationResults({title:null,questions,rows:[]});assert.equal(r.total,0);assert.equal(r.ratings[0].average,null);assert.equal(r.texts[0].comments.length,0);});
test('comentários mantêm acentos e conteúdo, busca ignora acentos e página é limitada',()=>{
 const comments=Array.from({length:23},(_,i)=>({id:String(i),text:`Ótima organização ${i}`}));
 const p=evaluationCommentPage(comments,'ORGANIZACAO',1);assert.equal(p.total,23);assert.equal(p.rows.length,10);assert.equal(p.rows[0].id,'10');assert.equal(p.pages,3);assert.equal(evaluationCommentPage(comments,'',99).rows.length,3);assert.equal(evaluationCommentPage(comments,'inexistente',99).rows.length,0);assert.equal(evaluationCommentPage(comments,'',-2).current,0);
});
test('CSV agregado neutraliza fórmulas e não inclui comentários ou identificadores individuais',()=>{
 const data={title:'=DANGEROUS()',questions:[{...questions[0],label:' \t@formula'},{...questions[1],label:'Observações;texto'}],rows:[row('private-id',{q1:4,q2:'SEGREDO DO COMENTÁRIO'})]};const csv=evaluationSummaryCsv(data);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/'=DANGEROUS/);assert.match(csv,/' \t@formula/);assert.match(csv,/"Observações;texto"/);assert.doesNotMatch(csv,/SEGREDO DO COMENTÁRIO|private-id/);assert.match(csv,/NPS/);
});
