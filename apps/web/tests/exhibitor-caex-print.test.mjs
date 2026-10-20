import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../components/exhibitor-caex.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('caex.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = parsed.statements.filter(n => ts.isFunctionDeclaration(n) && ['escapeHtml','printBadge'].includes(n.name?.text) || ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(parsed) === 'KIND_LABEL'));
const js = ts.transpileModule(selected.map(n => n.getText(parsed)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const badge = {kind:'EXHIBITOR',badgeName:'<Berg>',companyTradeName:'Empresa',role:'Contato',document:'PRIVATE-DOCUMENT'};
function setup({missingDoc=false,missingWindow=false,fail=false}={}) {
 let removed=0,printed=0,html='';const listeners=new Map();
 const printWindow={focus(){},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},print(){printed++;assert.ok(listeners.has('afterprint'));if(fail)throw Error('print failed');}};
 const frame={style:{},contentDocument:missingDoc?null:{open(){},write(s){html=s;},close(){}},contentWindow:missingWindow?null:printWindow,remove(){removed++;}};
 const ctx=vm.createContext({document:{createElement(){return frame;},body:{appendChild(){}}}});vm.runInContext(js,ctx);
 return {run(){ctx.printBadge(badge);},finish(){listeners.get('afterprint')?.();},get removed(){return removed;},get printed(){return printed;},get html(){return html;},get listeners(){return listeners.size;}};
}
test('keeps print document until afterprint and escapes badge without private document',()=>{
 const h=setup();h.run();assert.equal(h.printed,1);assert.equal(h.removed,0);
 assert.match(h.html,/&lt;Berg&gt;/);assert.doesNotMatch(h.html,/PRIVATE-DOCUMENT/);
 h.finish();assert.equal(h.removed,1);
});
for(const option of ['missingDoc','missingWindow'])test('cleans unavailable print context: '+option,()=>{
 const h=setup({[option]:true});h.run();assert.equal(h.removed,1);assert.equal(h.printed,0);
});
test('print exception cleans frame and listener',()=>{
 const h=setup({fail:true});assert.throws(()=>h.run(),/print failed/);assert.equal(h.removed,1);assert.equal(h.listeners,0);
});
