import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const legacy = url(compile('../lib/post-event-report.ts'));
const { postEventReportOptions, selectedReportCsv } = await import(url(compile('../lib/post-event-report-options.ts').replace(/from ['"]\.\/post-event-report['"]/g, 'from ' + JSON.stringify(legacy))));
const report = { event:{name:'Evento exemplo',timeZone:'UTC',profileLabel:'Corporativo'},generatedAt:'2026-10-06T00:00:00Z',formRevision:1,ageReferenceDay:'2026-10-06',attendanceEnabled:true,
  registration:{confirmed:2,present:1,absent:1,pending:1,expired:2,cancelled:3},categories:[{label:'Categoria A',registered:2,present:1}],
  firstCheckInByDay:[{label:'2026-10-05',count:1},{label:'2026-10-06',count:1}],firstCheckInByHour:[{label:'2026-10-05 09:00',count:1},{label:'2026-10-06 10:00',count:1}],
  fields:[{code:'sex',label:'Sexo',eligible:2,presentEligible:1,notCollected:0,notApplicable:0,multiple:false,buckets:[{label:'Feminino',registered:2,present:1}]},{code:'education_level',label:'Escolaridade',eligible:2,presentEligible:1,notCollected:0,notApplicable:0,multiple:false,buckets:[{label:'Superior',registered:2,present:1}]}],
  payment:{paid:1,exempt:1,review:0,unverified:0,receivedCents:900,confirmedPriceCents:1000,categories:[{label:'Categoria A',confirmed:2,paid:1,exempt:1,review:0,unverified:0,receivedCents:900,confirmedPriceCents:1000}]},scientific:null,limitations:[] };
test('opções seguem módulos, campos disponíveis e compatibilidade de payload legado', () => {
  const ids=postEventReportOptions(report).map(row=>row.id);
  assert.ok(ids.includes('field:sex')); assert.ok(ids.includes('payment-category')); assert.ok(ids.includes('attendance-day')); assert.ok(!ids.includes('scientific'));
  const disabled=postEventReportOptions({...report,attendanceEnabled:false,payment:null,fields:[]}).map(row=>row.id);
  assert.deepEqual(disabled,['all','registration','registration-status']);
  assert.ok(!postEventReportOptions({...report,payment:{...report.payment,categories:undefined}}).some(row=>row.id==='payment-category'));
});
test('exportação por campo inclui somente a dimensão e mantém população e proteção contra fórmulas', () => {
  const csv=selectedReportCsv({...report,fields:[{...report.fields[0],buckets:[{label:'=CMD()',registered:2,present:1}]},report.fields[1]]},'field:sex');
  assert.match(csv,/Sexo/); assert.match(csv,/População elegível/); assert.match(csv,/'=CMD/); assert.doesNotMatch(csv,/Escolaridade|Superior|Valor recebido/);
});
test('exportação de credenciamento respeita dia e tipo de relatório selecionados', () => {
  const csv=selectedReportCsv(report,'attendance-hour','2026-10-06');
  assert.match(csv,/2026-10-06 10:00/); assert.doesNotMatch(csv,/2026-10-05|Credenciados por dia|Feminino/);
  assert.match(csv,/Total do recorte/);
});
test('matriz financeira e situação das reservas mantêm semântica e escopo distintos', () => {
  const payment=selectedReportCsv(report,'payment-category');
  assert.match(payment,/recebido em centavos/); assert.match(payment,/"900";"1000"/); assert.doesNotMatch(payment,/Reservas pendentes|Feminino/);
  const statuses=selectedReportCsv(report,'registration-status');assert.match(statuses,/Reservas expiradas/);assert.doesNotMatch(statuses,/Categoria A|Superior/);
  assert.match(selectedReportCsv(report,'all'),/Pagamentos por categoria/);
  assert.throws(()=>selectedReportCsv({...report,attendanceEnabled:false},'attendance-hour'),/não está disponível/);
});
