import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const hooksUrl=data(`let slots=[],cursor=0,effects=[];export const reset=()=>{cursor=0};export const unmount=()=>{slots.forEach(s=>s?.cleanup?.());slots=[];effects=[]};export const run=()=>{const list=effects;effects=[];list.forEach(f=>f())};export function useState(init){const i=cursor++,target=slots;if(!(i in target))target[i]=typeof init==='function'?init():init;return[target[i],v=>{target[i]=typeof v==='function'?v(target[i]):v}]};export function useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i]};export function useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const entry={deps};slots[i]=entry;effects.push(()=>{old?.cleanup?.();entry.cleanup=fn()})}}`);
const apiUrl=data(`export const calls=[];export const getToken=()=> 'fixture';export const api=(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}));`);
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const modules={react:hooksUrl,'react/jsx-runtime':data('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment=\"fragment\";'),'../lib/api':apiUrl,'../lib/public-registration-cta':data(compile('../lib/public-registration-cta.ts')),'../lib/registration-input':data(compile('../lib/registration-input.ts')),'./event-desk.module.css':data('export default new Proxy({},{get:(_,key)=>key})')};
for(const name of ['international-phone-input','check-in-console','credential-label','credential-label-settings','credential-category-templates','credential-operations','eva-screen-support','kit-report','kit-stock-panel','print-surface'])modules['./'+name]=data('export default '+JSON.stringify(name));
const {default:View}=await import(data(compile('../components/event-desk.tsx').replace(/from ['"]([^'"]+)['"]/g,(_,key)=>'from '+JSON.stringify(modules[key]))));
const hooks=await import(hooksUrl),api=await import(apiUrl);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const tick=()=>new Promise(r=>setTimeout(r,0));
const render=()=>{hooks.reset();const root=View({eventId:'event-a'});return root.type(root.props)};
const button=(tree,name)=>nodes(tree).find(n=>n.type==='button'&&text(n)===name);
const form=(tree,name)=>nodes(tree).find(n=>n.type==='form'&&n.props.className===name);
const person=(id,name)=>({reservationId:id,protocol:'EVO-0000000000000001',name,category:'Congressista',status:'CONFIRMED',checkedInAt:'2026-10-27T12:00:00Z',checkInReversedAt:null,materialDeliveredAt:null,materialReversedAt:null,shirtPreference:null,deliveredSizeLabel:null,presenceDays:['2026-10-27'],presentToday:true});
const record=(id,name,revision=0)=>({reservationId:id,revision,fields:[{code:'preferred_name',type:'TEXT',label:'Como deseja ser chamado',required:true,value:name}],locked:['email']});
async function boot(){globalThis.window={history:{replaceState(){}},location:{origin:'http://localhost',hash:'',pathname:'/',search:''},addEventListener(){},removeEventListener(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){}};render();hooks.run();api.calls.at(-1).resolve({event:{id:'event-a',name:'Congresso fictício',status:'PUBLISHED',profileCode:'SCIENTIFIC_EVENT'},role:'OPERATOR',capabilities:['credential','access_control','registration'],categories:[{id:'category-qa',name:'Participante',lots:[{id:'lot-qa',name:'Lote QA',priceCents:0}]}],activities:[],fields:[{code:'full_name',label:'Nome completo',type:'TEXT',required:true},{code:'preferred_name',label:'Como deseja ser chamado',type:'TEXT',required:true}],labelFields:[],selfService:[],totemLink:{state:'absent',expiresAt:null}});await tick();let tree=render();hooks.run();const work=form(tree,'search').props.onSubmit({preventDefault(){}});api.calls.at(-1).resolve({items:[person('person-a','Bia'),person('person-b','Cris')]});await work;return render()}
test('estorno exige motivo e atualiza entrada sem apagar participante',async()=>{try{let tree=await boot();assert.equal(button(tree,'Desfazer entrada').props.disabled,true);nodes(tree).find(n=>n.props?.id==='desk-reversal-reason').props.onChange({target:{value:'  Registro duplicado  '}});tree=render();assert.equal(button(tree,'Desfazer entrada').props.disabled,false);button(tree,'Desfazer entrada').props.onClick();const call=api.calls.at(-1);assert.match(call.path,/\/desk\/check-in\/reverse$/);assert.deepEqual(JSON.parse(call.options.body),{reservationId:'person-a',reason:'Registro duplicado'});call.resolve({reversedAt:'2026-10-27T13:00:00Z'});await tick();tree=render();assert.ok(button(tree,'Registrar entrada'));assert.match(text(tree),/A última entrada foi desfeita/);assert.match(text(tree),/Cris/);}finally{hooks.unmount();delete globalThis.window}});
test('resposta atrasada da ficha A não é exibida nem salva na pessoa B',async()=>{try{let tree=await boot();button(tree,'Alterar cadastro').props.onClick();const old=api.calls.at(-1);nodes(tree).find(n=>n.type==='button'&&n.props.className==='secondaryAction'&&/Cris/.test(text(n))).props.onClick();old.resolve(record('person-a','Bia'));await tick();tree=render();assert.equal(button(tree,'Salvar cadastro'),undefined);assert.doesNotMatch(text(tree),/Alteração de cadastro/);}finally{hooks.unmount();delete globalThis.window}});
test('cadastro usa revisão, idempotência e valores normalizados devolvidos pelo servidor',async()=>{try{let tree=await boot();button(tree,'Alterar cadastro').props.onClick();api.calls.at(-1).resolve(record('person-a','Bia'));await tick();tree=render();const field=nodes(tree).find(n=>typeof n.type==='function'&&n.props?.field?.code==='preferred_name');field.props.onChange(' Bia nova ');tree=render();form(tree,'register').props.onSubmit({preventDefault(){}});const call=api.calls.at(-1);assert.match(call.path,/person-a\/corrections$/);assert.ok(call.options.headers['Idempotency-Key']);assert.deepEqual(JSON.parse(call.options.body),{expectedRevision:0,updates:{preferred_name:' Bia nova '}});call.resolve(record('person-a','Bia nova',1));await tick();tree=render();const next=nodes(tree).find(n=>typeof n.type==='function'&&n.props?.field?.code==='preferred_name');assert.equal(next.props.value,'Bia nova');assert.match(text(tree),/Cadastro atualizado/);}finally{hooks.unmount();delete globalThis.window}});
test('erro de API aparece no posto e impressão só é preparada após resposta de credencial',async()=>{try{let tree=await boot();button(tree,'Imprimir credencial').props.onClick();api.calls.at(-1).reject(Error('Credencial indisponível'));await tick();tree=render();assert.match(text(tree),/Credencial indisponível/);assert.ok(button(tree,'Imprimir etiqueta'),'ação da tabela deve continuar disponível após falha');assert.equal(nodes(tree).filter(n=>n.type==='credential-label').length,0,'falha não prepara etiqueta para impressão');button(tree,'Imprimir credencial').props.onClick();api.calls.at(-1).resolve({eventName:'Congresso fictício',name:'Bia',company:'Instituto',lines:['Pesquisadora','Osasco / SP'],category:null,protocol:'EVO-1',qr:'EVQ1.fixture',barcode:null,widthMm:90,heightMm:40});await tick();tree=render();assert.ok(button(tree,'Imprimir etiqueta'));assert.equal(nodes(tree).filter(n=>n.type==='credential-label').length,2);}finally{hooks.unmount();delete globalThis.window}});

for(const action of ['run','openEdit','saveEdit'])test(`finally antigo de ${action} não libera uma ação nova de outra pessoa`,async()=>{try{
 let tree=await boot();
 if(action==='saveEdit'){button(tree,'Alterar cadastro').props.onClick();api.calls.at(-1).resolve(record('person-a','Bia'));await tick();tree=render();form(tree,'register').props.onSubmit({preventDefault(){}});}
 else button(tree,action==='run'?'Imprimir credencial':'Alterar cadastro').props.onClick();
 const old=api.calls.at(-1);
 nodes(render()).find(n=>n.type==='button'&&n.props.className==='secondaryAction'&&/Cris/.test(text(n))).props.onClick();
 tree=render();button(tree,'Alterar cadastro').props.onClick();const current=api.calls.at(-1);assert.notEqual(old,current);
 old.resolve(action==='run'?{}:record('person-a','Bia'));await tick();tree=render();
 assert.equal(button(tree,'Alterar cadastro').props.disabled,true,'resposta antiga não pode remover busy da nova ação');
 const count=api.calls.length;button(tree,'Alterar cadastro').props.onClick();assert.equal(api.calls.length,count,'ação pendente não aceita duplicação');
 current.resolve(record('person-b','Cris'));await tick();tree=render();assert.equal(button(tree,'Alterar cadastro').props.disabled,false);
 assert.equal(nodes(tree).find(n=>typeof n.type==='function'&&n.props?.field?.code==='preferred_name').props.value,'Cris');
 }finally{hooks.unmount();delete globalThis.window}});

test('clique duplo antes do render dispara uma única ação e permite retry após erro',async()=>{try{
 let tree=await boot(),count=api.calls.length;const click=button(tree,'Imprimir credencial').props.onClick;click();click();assert.equal(api.calls.length,count+1);
 api.calls.at(-1).reject(Error('Rede indisponível'));await tick();tree=render();count=api.calls.length;button(tree,'Imprimir credencial').props.onClick();assert.equal(api.calls.length,count+1);api.calls.at(-1).reject(Error('Rede indisponível'));await tick();
 }finally{hooks.unmount();delete globalThis.window}});

test('motivo dos três estornos é normalizado antes de chegar à API', () => {
  const source = readFileSync(new URL('../components/event-desk.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/reason: reversalReason\.trim\(\)/gu) ?? []).length, 3);
});



test('nova inscrição limpa respostas e reativa sugestão sem herdar o participante anterior',async()=>{try{
 let tree=await boot();
 button(tree,'Nova inscrição').props.onClick();tree=render();hooks.run();tree=render();
 const field=(code)=>nodes(tree).find(n=>typeof n.type==='function'&&n.props?.field?.code===code);
 field('full_name').props.onChange('Ana Silva');tree=render();assert.equal(field('preferred_name').props.value,'Ana Silva');
 field('preferred_name').props.onChange('Dra. Ana');tree=render();
 button(tree,'Buscar participante').props.onClick();tree=render();hooks.run();tree=render();
 button(tree,'Nova inscrição').props.onClick();tree=render();hooks.run();tree=render();
 assert.equal(field('full_name').props.value,undefined);assert.equal(field('preferred_name').props.value,undefined);
 field('full_name').props.onChange('Cris Costa');tree=render();assert.equal(field('preferred_name').props.value,'Cris Costa');
 }finally{hooks.unmount();delete globalThis.window}});
