import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { publishedChoiceError } from '../lib/registration-input.ts';
import { publishedKitAvailabilityLabel, readPublishedShirtSizes } from '../lib/sports-athlete-and-kits.ts';
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const hooksUrl=data(`let slots=[],cursor=0,effects=[];export const reset=()=>{cursor=0};export const unmount=()=>{slots.forEach(s=>s?.cleanup?.());slots=[];effects=[]};export const run=()=>{const list=effects;effects=[];list.forEach(f=>f())};export function useState(init){const i=cursor++,target=slots;if(!(i in target))target[i]=typeof init==='function'?init():init;return[target[i],v=>{target[i]=typeof v==='function'?v(target[i]):v}]};export function useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i]};export function useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,k)=>v!==old.deps[k])){const entry={deps};slots[i]=entry;effects.push(()=>{old?.cleanup?.();entry.cleanup=fn()})}}`);
const apiUrl=data(`export const calls=[];export const getToken=()=> 'fixture';export const api=(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}));`);
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const modules={react:hooksUrl,'react/jsx-runtime':data('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment=\"fragment\";'),'../lib/api':apiUrl,'../lib/public-registration-cta':data(compile('../lib/public-registration-cta.ts')),'../lib/registration-input':data(compile('../lib/registration-input.ts')),'../lib/credential-print-confirmation':data(compile('../lib/credential-print-confirmation.ts')),'./event-desk.module.css':data('export default new Proxy({},{get:(_,key)=>key})')};
for(const name of ['international-phone-input','check-in-console','credential-label','credential-label-settings','credential-category-templates','credential-operations','eva-screen-support','kit-report','kit-stock-panel','print-surface'])modules['./'+name]=data('export default '+JSON.stringify(name));
modules['./credential-label']=data('export default "credential-label";export const credentialLabelLayout=()=>({fitWarning:Boolean(globalThis.__labelFitWarning)});');
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
async function boot(capabilities=['credential','access_control','registration'], items=[person('person-a','Bia'),person('person-b','Cris')]){globalThis.window={history:{replaceState(){}},location:{origin:'http://localhost',hash:'',pathname:'/',search:''},addEventListener(){},removeEventListener(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){},print(){}};render();hooks.run();api.calls.at(-1).resolve({event:{id:'event-a',name:'Congresso fictício',status:'PUBLISHED',profileCode:'SCIENTIFIC_EVENT'},role:'OPERATOR',capabilities,categories:[{id:'category-qa',name:'Participante',lots:[{id:'lot-qa',name:'Lote QA',priceCents:0}]}],activities:[],fields:[{code:'full_name',label:'Nome completo',type:'TEXT',required:true},{code:'preferred_name',label:'Como deseja ser chamado',type:'TEXT',required:true}],labelFields:[],selfService:[],totemLink:{state:'absent',expiresAt:null}});await tick();let tree=render();hooks.run();const work=form(tree,'search').props.onSubmit({preventDefault(){}});api.calls.at(-1).resolve({items});await work;return render()}
function armPrintFrames(){const queue=[];let next=1,printed=0;globalThis.window.requestAnimationFrame=(fn)=>{const id=next++;queue.push({id,fn});return id};globalThis.window.cancelAnimationFrame=(id)=>{const index=queue.findIndex((item)=>item.id===id);if(index>=0)queue.splice(index,1)};globalThis.window.print=()=>{printed+=1};return{flush(){for(const item of queue.splice(0))item.fn()},printed:()=>printed}}
const readableBadge={eventName:'Congresso fictício',name:'Bia',company:'Instituto',lines:['Pesquisadora'],category:null,protocol:'EVO-1',qr:'EVQ1.fixture',barcode:null,widthMm:90,heightMm:40};
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
 field('full_name').props.onChange('Ana Silva');tree=render();assert.equal(field('preferred_name').props.value,'Ana');
 field('preferred_name').props.onChange('Dra. Ana');tree=render();
 button(tree,'Buscar participante').props.onClick();tree=render();hooks.run();tree=render();
 button(tree,'Nova inscrição').props.onClick();tree=render();hooks.run();tree=render();
 assert.equal(field('full_name').props.value,undefined);assert.equal(field('preferred_name').props.value,undefined);
 field('full_name').props.onChange('Cris Costa');tree=render();assert.equal(field('preferred_name').props.value,'Cris');
 }finally{hooks.unmount();delete globalThis.window}});

test('credencial fisicamente ilegível impede impressão manual sem perder a prévia',async()=>{
 globalThis.__labelFitWarning=true;
 try{
  let tree=await boot();
  button(tree,'Imprimir credencial').props.onClick();
  api.calls.at(-1).resolve({eventName:'Congresso fictício',name:'Nome muito longo',company:'Instituto',lines:[],category:null,protocol:'EVO-1',qr:'EVQ1.fixture',barcode:null,widthMm:40,heightMm:20});
  await tick();tree=render();
  const print=nodes(tree).find(n=>n.type==='button'&&text(n)==='Imprimir etiqueta'&&n.props.disabled===true);
  assert.ok(print,'impressão de etiqueta sem espaço físico deve estar desabilitada');
  assert.doesNotThrow(()=>print.props.onClick(),'o handler não pode abrir o diálogo de impressão');
  const labels=nodes(tree).filter(n=>n.type==='credential-label');
  assert.equal(labels.length,1,'somente a prévia permanece; a superfície imprimível não pode existir quando ilegível');
  assert.equal(labels[0].props.preview,true,'a prévia visual continua disponível para orientar a correção');
 }finally{delete globalThis.__labelFitWarning;hooks.unmount();delete globalThis.window}
});


test('etiqueta legível imprime uma vez depois de dois frames e a ilegível não dispara',async()=>{
 try{
  let tree=await boot();
  const spy=armPrintFrames();
  button(tree,'Imprimir credencial').props.onClick();
  api.calls.at(-1).resolve(readableBadge);
  await tick();render();hooks.run();
  assert.equal(spy.printed(),0,'o diálogo espera os dois frames da composição');
  spy.flush();assert.equal(spy.printed(),0);
  spy.flush();assert.equal(spy.printed(),1,'uma etiqueta legível abre a impressão uma única vez');
  spy.flush();assert.equal(spy.printed(),1,'frames seguintes não repetem a impressão');
 }finally{delete globalThis.__labelFitWarning;hooks.unmount();delete globalThis.window}
});

test('etiqueta ilegível, cancelamento e operador sem credencial não chamam impressão',async()=>{
 globalThis.__labelFitWarning=true;
 try{
  let tree=await boot();
  const blocked=armPrintFrames();
  button(tree,'Imprimir credencial').props.onClick();
  api.calls.at(-1).resolve({...readableBadge,name:'Nome muito longo',widthMm:40,heightMm:20});
  await tick();render();hooks.run();
  blocked.flush();blocked.flush();
  assert.equal(blocked.printed(),0,'layout ilegível não agenda impressão automática');
  hooks.unmount();
  delete globalThis.__labelFitWarning;
  tree=await boot();
  const cancelled=armPrintFrames();
  button(tree,'Imprimir credencial').props.onClick();
  api.calls.at(-1).resolve(readableBadge);
  await tick();render();hooks.run();
  hooks.unmount();
  cancelled.flush();cancelled.flush();
  assert.equal(cancelled.printed(),0,'sair da tela cancela os frames pendentes');
  tree=await boot(['access_control']);
  assert.equal(button(tree,'Imprimir credencial'),undefined,'operador sem credencial não recebe a ação de impressão');
 }finally{delete globalThis.__labelFitWarning;hooks.unmount();delete globalThis.window}
});

test('Ctrl/Cmd+P e menu do navegador não imprimem etiqueta ilegível',async()=>{
 globalThis.__labelFitWarning=true;
 const listeners=[];
 const inserted=[];
 try{
  let tree=await boot();
  globalThis.window.addEventListener=(type,fn,capture)=>{if(type==='keydown')listeners.push({fn,capture});};
  globalThis.window.removeEventListener=(type,fn)=>{const index=listeners.findIndex(item=>item.fn===fn&&type==='keydown');if(index>=0)listeners.splice(index,1);};
  globalThis.document={
   createElement:()=>({textContent:'',setAttribute(){},remove(){const index=inserted.indexOf(this);if(index>=0)inserted.splice(index,1);}}),
   head:{appendChild:node=>inserted.push(node)},
  };
  button(tree,'Imprimir credencial').props.onClick();
  api.calls.at(-1).resolve({eventName:'Congresso fictício',name:'Nome extenso',company:'Instituto',lines:[],category:null,protocol:'EVO-1',qr:'EVQ1.fixture',barcode:null,widthMm:40,heightMm:20});
  await tick();tree=render();hooks.run();
  assert.equal(listeners.length,1,'o atalho deve ser interceptado na fase de captura');
  assert.equal(listeners[0].capture,true);
  for(const modifier of ['ctrlKey','metaKey']){
   let prevented=false;
   listeners[0].fn({key:'p',ctrlKey:false,metaKey:false,[modifier]:true,preventDefault(){prevented=true;}});
   assert.equal(prevented,true,modifier+'+P deve ser bloqueado');
  }
  let ordinaryPrevented=false;
  listeners[0].fn({key:'a',ctrlKey:true,metaKey:false,preventDefault(){ordinaryPrevented=true;}});
  assert.equal(ordinaryPrevented,false,'atalhos não relacionados devem continuar funcionando');
  assert.equal(inserted.length,1,'a impressão pelo menu precisa de bloqueio CSS');
  assert.ok(inserted[0].textContent.includes('@media print') && inserted[0].textContent.includes('visibility: hidden !important'), 'a mídia de impressão deve ocultar o conteúdo inválido');
  assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n)==='Imprimir etiqueta'&&n.props.disabled===true),
    'o botão da prévia inválida deve estar desabilitado, independentemente da ação de impressão da tabela');
  hooks.unmount();
  assert.equal(listeners.length,0,'listener deve ser removido no unmount');
  assert.equal(inserted.length,0,'CSS temporário deve ser removido no unmount');
 }finally{delete globalThis.__labelFitWarning;hooks.unmount();delete globalThis.window;delete globalThis.document;}
});



const printSheet = (tree) => nodes(tree).find((node) => node.type === 'section' && node.props?.['aria-label'] === 'Credencial para impressão');
const sheetButton = (tree, name) => nodes(printSheet(tree)).find((node) => node.type === 'button' && text(node) === name);

test('a sequência da emissão confirma no servidor e a impressão do navegador não', async () => {
  try {
    delete globalThis.__labelFitWarning;
    let prints = 0;
    let tree = await boot();
    globalThis.window.print = () => { prints += 1; };
    button(tree, 'Imprimir credencial').props.onClick();
    const badgeCall = api.calls.at(-1);
    assert.match(badgeCall.path, /\/desk\/badge$/);
    badgeCall.resolve({ ...readableBadge, emissao: { sequence: 7, concluida: false } });
    await tick();
    tree = render();
    assert.equal(prints, 0);
    assert.ok(sheetButton(tree, 'A etiqueta saiu'));
    const before = api.calls.length;
    sheetButton(tree, 'Imprimir etiqueta').props.onClick();
    assert.equal(prints, 1);
    assert.equal(api.calls.length, before, 'abrir a impressão do navegador não confirma papel');
    sheetButton(tree, 'A etiqueta saiu').props.onClick();
    const confirm = api.calls.at(-1);
    assert.match(confirm.path, /\/events\/event-a\/credential-prints\/confirm$/);
    assert.equal(confirm.options.method, 'POST');
    assert.deepEqual(JSON.parse(confirm.options.body), { reservationId: 'person-a', sequence: 7 });
    confirm.resolve({ sequence: 7, acaoExigida: 'credencial_imprimir', concluida: true, repetida: false });
    await tick();
    tree = render();
    assert.match(text(tree), /O servidor registrou esta sequência como impressa/);
    sheetButton(tree, 'A etiqueta saiu').props.onClick();
    api.calls.at(-1).resolve({ sequence: 7, acaoExigida: 'credencial_reimprimir', concluida: true, repetida: true });
    await tick();
    tree = render();
    assert.match(text(tree), /Nada foi gravado de novo/);
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

const personButton = (tree, name) => nodes(tree).find((node) => node.type === 'button' && node.props.className === 'secondaryAction' && text(node) === name);

test('trocar de participante durante a confirmação não leva o aviso para a pessoa seguinte', async () => {
  try {
    delete globalThis.__labelFitWarning;
    let tree = await boot();
    button(tree, 'Imprimir credencial').props.onClick();
    api.calls.at(-1).resolve({ ...readableBadge, emissao: { sequence: 7, concluida: false } });
    await tick();
    tree = render();
    sheetButton(tree, 'A etiqueta saiu').props.onClick();
    const confirm = api.calls.at(-1);
    assert.deepEqual(JSON.parse(confirm.options.body), { reservationId: 'person-a', sequence: 7 });
    personButton(tree, 'Cris').props.onClick();
    tree = render();
    assert.equal(printSheet(tree), undefined, 'a troca tira a etiqueta da tela antes da resposta');
    confirm.resolve({ sequence: 7, acaoExigida: 'credencial_imprimir', concluida: true, repetida: false });
    await tick();
    tree = render();
    assert.doesNotMatch(text(tree), /O servidor registrou esta sequência como impressa/);
    assert.doesNotMatch(text(tree), /Nada foi gravado de novo/);
    assert.equal(printSheet(tree), undefined);
    assert.ok(nodes(tree).some((node) => node.type === 'h3' && text(node) === 'Cris'));

    button(tree, 'Imprimir credencial').props.onClick();
    api.calls.at(-1).resolve({ ...readableBadge, name: 'Cris', emissao: { sequence: 2, concluida: false } });
    await tick();
    tree = render();
    sheetButton(tree, 'A etiqueta saiu').props.onClick();
    const late = api.calls.at(-1);
    assert.deepEqual(JSON.parse(late.options.body), { reservationId: 'person-b', sequence: 2 });
    personButton(tree, 'Bia').props.onClick();
    late.reject(Error('Esta credencial já foi impressa. Confirmar outra impressão exige permissão de reimpressão.'));
    await tick();
    tree = render();
    assert.doesNotMatch(text(tree), /Confirmar outra impressão exige permissão de reimpressão/);
    assert.doesNotMatch(text(tree), /Não foi possível saber se o servidor registrou/);
    assert.equal(printSheet(tree), undefined);
    assert.ok(nodes(tree).some((node) => node.type === 'h3' && text(node) === 'Bia'));
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('fechar a impressão não confirma, a falha reenvia a mesma sequência e a repetida não cria outra', async () => {
  try {
    delete globalThis.__labelFitWarning;
    let prints = 0;
    let tree = await boot();
    globalThis.window.print = () => { prints += 1; };
    button(tree, 'Imprimir credencial').props.onClick();
    api.calls.at(-1).resolve({ ...readableBadge, emissao: { sequence: 7, concluida: false } });
    await tick();
    tree = render();
    const beforePrint = api.calls.length;
    sheetButton(tree, 'Imprimir etiqueta').props.onClick();
    if (typeof globalThis.window.onafterprint === 'function') globalThis.window.onafterprint();
    assert.equal(prints, 1);
    assert.equal(api.calls.length, beforePrint, 'fechar ou abortar o diálogo não confirma papel');

    sheetButton(tree, 'A etiqueta saiu').props.onClick();
    const failed = api.calls.at(-1);
    assert.deepEqual(JSON.parse(failed.options.body), { reservationId: 'person-a', sequence: 7 });
    failed.reject(new Error('rede'));
    await tick();
    tree = render();
    assert.match(text(tree), /Envie a mesma confirmação outra vez/);
    assert.equal(sheetButton(tree, 'A etiqueta saiu').props.disabled, false);

    sheetButton(tree, 'A etiqueta saiu').props.onClick();
    const retry = api.calls.at(-1);
    assert.deepEqual(JSON.parse(retry.options.body), { reservationId: 'person-a', sequence: 7 });
    retry.resolve({ sequence: 7, acaoExigida: 'credencial_imprimir', concluida: true, repetida: true });
    await tick();
    tree = render();
    assert.match(text(tree), /Nada foi gravado de novo/);
    const confirmations = api.calls.slice(beforePrint).filter((call) => String(call.path).endsWith('/credential-prints/confirm'));
    assert.equal(confirmations.length, 2);
    for (const call of confirmations) {
      assert.deepEqual(JSON.parse(call.options.body), { reservationId: 'person-a', sequence: 7 });
    }
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('sem sequência, com resposta estranha ou com etiqueta ilegível a confirmação não acontece', async () => {
  try {
    delete globalThis.__labelFitWarning;
    let tree = await boot();
    button(tree, 'Imprimir credencial').props.onClick();
    api.calls.at(-1).resolve(readableBadge);
    await tick();
    tree = render();
    assert.equal(sheetButton(tree, 'A etiqueta saiu'), undefined);
    assert.match(text(printSheet(tree)), /não trouxe a sequência da emissão/);

    button(tree, 'Imprimir credencial').props.onClick();
    api.calls.at(-1).resolve({ ...readableBadge, emissao: { sequence: 3, concluida: false } });
    await tick();
    tree = render();
    sheetButton(tree, 'A etiqueta saiu').props.onClick();
    api.calls.at(-1).resolve({ sequence: 9, acaoExigida: 'credencial_imprimir', concluida: true, repetida: false });
    await tick();
    tree = render();
    assert.match(text(tree), /não confirmou esta sequência/);
    assert.ok(sheetButton(tree, 'A etiqueta saiu'), 'a mesma emissão continua disponível');

    globalThis.__labelFitWarning = true;
    tree = render();
    assert.equal(sheetButton(tree, 'A etiqueta saiu'), undefined);
    assert.match(text(printSheet(tree)), /Etiqueta ilegível não pode ser confirmada como impressa/);
    assert.equal(sheetButton(tree, 'Imprimir etiqueta').props.disabled, true);
  } finally {
    delete globalThis.__labelFitWarning;
    hooks.unmount();
    delete globalThis.window;
  }
});


test('tamanho publicado na ficha segue até a retirada e não reserva outra peça', async () => {
  const published = {
    fields: [{
      code: 'shirt_size',
      type: 'SELECT',
      enabled: true,
      label: 'Tamanho da camiseta',
      options: [{ id: 'size-m', label: 'M' }, { id: 'size-g', label: 'G' }],
    }],
  };
  const sizes = readPublishedShirtSizes(published);
  const choiceFields = [{ code: 'shirt_size', label: 'Tamanho da camiseta', type: 'SELECT', options: sizes }];
  assert.deepEqual(sizes.map((size) => size.id), ['size-m', 'size-g']);
  assert.equal(publishedChoiceError(choiceFields, { shirt_size: 'size-m' }), null);
  assert.match(publishedChoiceError(choiceFields, { shirt_size: 'size-xx' }) ?? '', /nenhum estoque foi reservado/);
  assert.match(publishedKitAvailabilityLabel(8), /8 unidades/);
  assert.match(publishedKitAvailabilityLabel(8), /não reserva estoque/);

  const athlete = person('person-a', 'Bia');
  athlete.shirtPreference = { sizeId: 'size-m', label: 'M' };
  try {
    let tree = await boot(
      ['credential', 'access_control', 'registration', 'material_delivery'],
      [athlete, person('person-b', 'Cris')],
    );
    const kitCall = api.calls.find((call) => call.path.endsWith('/desk/kit'));
    assert.ok(kitCall, 'o posto lê o saldo canônico do kit');
    kitCall.resolve({
      name: 'Kit da corrida',
      shirtsEnabled: true,
      sizes: [
        { id: 'size-m', label: 'M', forecast: 10, delivered: 2, available: 8 },
        { id: 'size-g', label: 'G', forecast: 4, delivered: 4, available: 0 },
      ],
    });
    await tick();
    tree = render();
    hooks.run();
    tree = render();
    assert.match(text(tree), /Preferência de tamanho: M\. A preferência não reserva estoque\./);
    const sameSize = form(tree, 'kit');
    const sameSelect = nodes(sameSize).find((node) => node.type === 'select');
    assert.equal(sameSelect.props.value, 'size-m');
    assert.ok(nodes(sameSelect).some((node) => node.type === 'option' && text(node).includes('8 disponíveis')));
    const exhausted = nodes(sameSelect).find((node) => node.type === 'option' && node.props.value === 'size-g');
    assert.equal(exhausted.props.disabled, true);
    assert.match(text(exhausted), /esgotado/);
    const before = api.calls.length;
    sameSize.props.onSubmit({ preventDefault() {} });
    const delivery = api.calls.at(-1);
    assert.equal(api.calls.length, before + 1);
    assert.match(delivery.path, /\/desk\/material$/);
    assert.deepEqual(JSON.parse(delivery.options.body), {
      reservationId: 'person-a',
      sizeId: 'size-m',
      confirmSizeChange: false,
    });
    assert.equal(JSON.parse(delivery.options.body).stock, undefined);

    delivery.resolve({ deliveredAt: '2026-11-09T18:00:00.000Z', sizeLabel: 'M' });
    await tick();
    const kitReads = api.calls.filter((call) => call.path.endsWith('/desk/kit'));
    assert.equal(kitReads.length, 2, 'a retirada pede uma leitura nova do saldo');
    const updatedKitCall = kitReads[1];
    assert.notEqual(updatedKitCall, kitCall, 'sem a chamada nova o saldo antigo continuaria valendo');
    updatedKitCall.resolve({
      name: 'Kit da corrida',
      shirtsEnabled: true,
      sizes: [
        { id: 'size-m', label: 'M', forecast: 10, delivered: 3, available: 7 },
        { id: 'size-g', label: 'G', forecast: 4, delivered: 4, available: 0 },
      ],
    });
    await tick();
    tree = render();
    assert.match(text(tree), /Material retirado/);
    assert.match(text(tree), /tamanho M/);
    assert.equal(form(tree, 'kit'), undefined, 'a retirada concluída não abre outra reserva');
    nodes(tree).find((node) => node.type === 'button' && node.props.className === 'secondaryAction' && /Cris/.test(text(node))).props.onClick();
    tree = render();
    const nextKit = form(tree, 'kit');
    assert.match(text(nextKit), /7 disponíveis/);
    assert.doesNotMatch(text(nextKit), /8 disponíveis/);

    hooks.unmount();
    const other = person('person-a', 'Bia');
    other.shirtPreference = { sizeId: 'size-m', label: 'M' };
    const marked = api.calls.length;
    tree = await boot(
      ['credential', 'access_control', 'registration', 'material_delivery'],
      [other],
    );
    const secondKitCall = api.calls.slice(marked).find((call) => call.path.endsWith('/desk/kit'));
    assert.ok(secondKitCall, 'o posto lê o saldo canônico do kit na segunda inicialização');
    secondKitCall.resolve({
      name: 'Kit da corrida',
      shirtsEnabled: true,
      sizes: [
        { id: 'size-m', label: 'M', forecast: 10, delivered: 2, available: 8 },
        { id: 'size-g', label: 'G', forecast: 4, delivered: 4, available: 0 },
        { id: 'size-p', label: 'P', forecast: 6, delivered: 3, available: 3 },
      ],
    });
    await tick();
    tree = render();
    hooks.run();
    tree = render();
    const selectOf = (current) => nodes(form(current, 'kit')).find((node) => node.type === 'select');
    selectOf(tree).props.onChange({ target: { value: 'size-g' } });
    tree = render();
    const withoutStock = api.calls.length;
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    assert.equal(api.calls.length, withoutStock, 'tamanho esgotado não registra retirada');
    assert.match(text(render()), /Este tamanho está esgotado no posto/);
    selectOf(render()).props.onChange({ target: { value: 'size-p' } });
    tree = render();
    const blocked = api.calls.length;
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    assert.equal(api.calls.length, blocked, 'trocar o tamanho sem confirmação não registra retirada');
    assert.match(text(render()), /Confirme a troca do tamanho solicitado antes de registrar a entrega/);
    const box = nodes(form(render(), 'kit')).find((node) => node.type === 'input' && node.props.type === 'checkbox');
    box.props.onChange({ target: { checked: true } });
    tree = render();
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), {
      reservationId: 'person-a',
      sizeId: 'size-p',
      confirmSizeChange: true,
    });
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('releitura recusada do saldo não mantém a quantidade anterior nem abre outra retirada', async () => {
  const athlete = person('person-a', 'Bia');
  athlete.shirtPreference = { sizeId: 'size-m', label: 'M' };
  try {
    const marked = api.calls.length;
    let tree = await boot(
      ['credential', 'access_control', 'registration', 'material_delivery'],
      [athlete, person('person-b', 'Cris')],
    );
    const kitCall = api.calls.slice(marked).find((call) => call.path.endsWith('/desk/kit'));
    kitCall.resolve({
      name: 'Kit da corrida',
      shirtsEnabled: true,
      sizes: [
        { id: 'size-m', label: 'M', forecast: 10, delivered: 2, available: 8 },
        { id: 'size-g', label: 'G', forecast: 4, delivered: 4, available: 0 },
      ],
    });
    await tick();
    tree = render();
    hooks.run();
    tree = render();
    const before = api.calls.length;
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    const delivery = api.calls.at(-1);
    assert.equal(api.calls.length, before + 1);
    delivery.resolve({ deliveredAt: '2026-11-09T18:00:00.000Z', sizeLabel: 'M' });
    await tick();
    const updatedKitCall = api.calls.filter((call) => call.path.endsWith('/desk/kit')).at(-1);
    assert.notEqual(updatedKitCall, kitCall);
    updatedKitCall.reject(new Error('saldo indisponível'));
    await tick();
    tree = render();
    assert.match(text(tree), /Kit registrado/);
    assert.match(text(tree), /Material retirado/);
    assert.match(text(tree), /O saldo do kit não pôde ser relido/);
    assert.match(text(tree), /A retirada já registrada permanece/);
    assert.doesNotMatch(text(tree), /O estorno já registrado permanece/);
    assert.equal(nodes(tree).find((node) => node.props?.role === 'alert').props.className, 'error');
    assert.doesNotMatch(text(tree), /8 disponíveis/);
    assert.equal(form(tree, 'kit'), undefined);
    const callsAfter = api.calls.length;
    const other = nodes(tree).find((node) => node.type === 'button' && node.props.className === 'secondaryAction' && /Cris/.test(text(node)));
    other.props.onClick();
    tree = render();
    assert.equal(form(tree, 'kit'), undefined, 'sem saldo relido a próxima pessoa não registra outra retirada');
    assert.equal(api.calls.length, callsAfter);
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('preferência esgotada não registra retirada e outro tamanho com saldo pede confirmação', async () => {
  const athlete = person('person-a', 'Bia');
  athlete.shirtPreference = { sizeId: 'size-g', label: 'G' };
  try {
    const marked = api.calls.length;
    let tree = await boot(
      ['credential', 'access_control', 'registration', 'material_delivery'],
      [athlete],
    );
    api.calls.slice(marked).find((call) => call.path.endsWith('/desk/kit')).resolve({
      name: 'Kit da corrida',
      shirtsEnabled: true,
      sizes: [
        { id: 'size-m', label: 'M', forecast: 10, delivered: 2, available: 8 },
        { id: 'size-g', label: 'G', forecast: 4, delivered: 4, available: 0 },
      ],
    });
    await tick();
    tree = render();
    hooks.run();
    tree = render();
    const select = nodes(form(tree, 'kit')).find((node) => node.type === 'select');
    assert.equal(select.props.value, 'size-g');
    assert.match(text(form(tree, 'kit')), /G · esgotado/);
    assert.equal(nodes(form(tree, 'kit')).find((node) => node.type === 'button' && text(node) === 'Registrar kit').props.disabled, true);
    const before = api.calls.length;
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    assert.equal(api.calls.length, before, 'a preferência sem saldo não chama a retirada');
    select.props.onChange({ target: { value: 'size-m' } });
    tree = render();
    const unconfirmed = api.calls.length;
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    assert.equal(api.calls.length, unconfirmed);
    nodes(form(render(), 'kit')).find((node) => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = render();
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), {
      reservationId: 'person-a',
      sizeId: 'size-m',
      confirmSizeChange: true,
    });
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('estorno confirmado com saldo recusado não diz que a retirada permanece', async () => {
  const athlete = person('person-a', 'Bia');
  athlete.materialDeliveredAt = '2026-11-09T18:00:00.000Z';
  athlete.deliveredSizeLabel = 'M';
  try {
    const marked = api.calls.length;
    let tree = await boot(
      ['credential', 'access_control', 'registration', 'material_delivery'],
      [athlete, person('person-b', 'Cris')],
    );
    api.calls.slice(marked).find((call) => call.path.endsWith('/desk/kit')).resolve({
      name: 'Kit da corrida',
      shirtsEnabled: true,
      sizes: [{ id: 'size-m', label: 'M', forecast: 10, delivered: 3, available: 7 }],
    });
    await tick();
    tree = render();
    hooks.run();
    tree = render();
    nodes(tree).find((node) => node.props?.id === 'desk-reversal-reason').props.onChange({ target: { value: 'Tamanho trocado no posto' } });
    tree = render();
    button(tree, 'Desfazer material').props.onClick();
    const reversal = api.calls.at(-1);
    assert.match(reversal.path, /\/desk\/material\/reverse$/);
    reversal.resolve({ reversedAt: '2026-11-09T19:00:00.000Z' });
    await tick();
    const refreshed = api.calls.at(-1);
    assert.match(refreshed.path, /\/desk\/kit$/);
    refreshed.reject(new Error('saldo indisponível'));
    await tick();
    tree = render();
    assert.match(text(tree), /Retirada desfeita/);
    assert.match(text(tree), /O estorno já registrado permanece/);
    assert.doesNotMatch(text(tree), /A retirada já registrada permanece/);
    assert.equal(form(tree, 'kit'), undefined);
    const callsAfter = api.calls.length;
    nodes(tree).find((node) => node.type === 'button' && node.props.className === 'secondaryAction' && /Cris/.test(text(node))).props.onClick();
    tree = render();
    assert.equal(form(tree, 'kit'), undefined, 'sem saldo relido a próxima pessoa não registra outra retirada');
    assert.equal(api.calls.length, callsAfter);
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('nova emissão enquanto a anterior aguarda confirmação', async () => {
 try {
 let tree = await boot();
 const issue = async (sequence) => {
   const trigger = button(tree, 'Imprimir credencial');
   assert.equal(Boolean(trigger.props.disabled), false);
   trigger.props.onClick();
   api.calls.at(-1).resolve({...readableBadge, emissao: {sequence, concluida: false}});
   await tick();
   tree = render();
 };
 await issue(7);
 sheetButton(tree, 'A etiqueta saiu').props.onClick();
 const pending = api.calls.at(-1);
 assert.equal(JSON.parse(pending.options.body).sequence, 7);
 tree = render();
 await issue(8);
 pending.resolve({sequence:7, acaoExigida:'credencial_imprimir', concluida:true, repetida:false});
 await tick(); tree = render();
 assert.ok(sheetButton(tree, 'A etiqueta saiu'));
 assert.equal(text(tree).includes('O servidor registrou esta sequência como impressa'), false, 'sequência 8 ainda não confirmada exibe sucesso da 7');
 } finally { hooks.unmount(); delete globalThis.window; }
});

test('trocar participante durante a retirada mantém a próxima entrega bloqueada até reler o saldo do evento', async () => {
  try {
    const athlete = person('person-a', 'Bia');
    const next = person('person-b', 'Cris');
    athlete.shirtPreference = next.shirtPreference = { sizeId: 'size-m', label: 'M' };
    const kitStock = available => ({
      name: 'Kit', shirtsEnabled: true,
      sizes: [{ id: 'size-m', label: 'M', forecast: 1, available, delivered: 1 - available }],
    });
    const start = api.calls.length;
    let tree = await boot(['material_delivery'], [athlete, next]);
    api.calls.slice(start).find(call => call.path.endsWith('/desk/kit')).resolve(kitStock(1));
    await tick();
    render(); hooks.run(); tree = render();
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    const delivery = api.calls.at(-1);
    assert.equal(JSON.parse(delivery.options.body).reservationId, 'person-a');
    nodes(tree).find(node => node.type === 'button' && /Cris/.test(text(node))).props.onClick();
    render(); hooks.run(); tree = render();
    const previous = api.calls.length;
    form(tree, 'kit').props.onSubmit({ preventDefault() {} });
    assert.equal(api.calls.length, previous, 'a segunda seleção deve aguardar a mutação de estoque em andamento');
    delivery.resolve({ deliveredAt: '2026-11-11T20:00:00Z', sizeLabel: 'M' });
    await tick();
    const refreshed = api.calls.at(-1);
    assert.match(refreshed.path, /\/desk\/kit$/);
    assert.equal(button(render(), 'Registrar kit').props.disabled, true);
    refreshed.resolve(kitStock(0));
    await tick();
    tree = render();
    assert.match(text(form(tree, 'kit')), /M · esgotado/);
    assert.equal(button(tree, 'Registrar kit').props.disabled, true);
    assert.doesNotMatch(text(tree), /Kit registrado/);
    nodes(tree).find(node => node.type === 'button' && /Bia/.test(text(node))).props.onClick();
    assert.match(text(render()), /Material retirado/);
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('estorno pendente preserva o motivo da próxima pessoa e uma leitura inicial atrasada não repõe o saldo', async () => {
  try {
    const items = [person('person-a', 'Bia'), person('person-b', 'Cris')];
    for (const item of items) item.materialDeliveredAt = '2026-11-11T19:00:00Z';
    const start = api.calls.length;
    let tree = await boot(['material_delivery'], items);
    const initial = api.calls.slice(start).find(call => call.path.endsWith('/desk/kit'));
    const reason = current => nodes(current).find(node => node.props?.id === 'desk-reversal-reason');
    reason(tree).props.onChange({ target: { value: 'Retirada duplicada' } });
    button(render(), 'Desfazer material').props.onClick();
    const reversal = api.calls.at(-1);
    nodes(render()).find(node => node.type === 'button' && /Cris/.test(text(node))).props.onClick();
    render(); hooks.run(); tree = render();
    reason(tree).props.onChange({ target: { value: 'Motivo exclusivo de Cris' } });
    reversal.resolve({ reversedAt: '2026-11-11T20:00:00Z' });
    await tick();
    const refreshed = api.calls.at(-1);
    assert.notEqual(refreshed, initial);
    assert.match(refreshed.path, /\/desk\/kit$/);
    refreshed.reject(new Error('saldo indisponível'));
    await tick();
    initial.resolve({ name: 'Kit antigo', shirtsEnabled: false, sizes: [] });
    await tick();
    tree = render();
    assert.equal(reason(tree).props.value, 'Motivo exclusivo de Cris');
    assert.doesNotMatch(text(tree), /Retirada desfeita/);
    assert.match(text(tree), /O estorno já registrado permanece/);
    nodes(tree).find(node => node.type === 'button' && /Bia/.test(text(node))).props.onClick();
    tree = render();
    assert.equal(button(tree, 'Registrar material'), undefined, 'o saldo inicial não reabre a retirada');
    assert.equal(button(tree, 'Desfazer material'), undefined, 'o estorno pertence à primeira pessoa');
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('imprimir lista durante emissão permite preparar a etiqueta seguinte', async () => {
  try {
    const tree = await boot();
    button(tree, 'Lista para impressão').props.onClick();
    const operations = () => nodes(render()).find(node => node.type === 'credential-operations').props;
    operations().onPrintBadge('person-a');
    const first = api.calls.at(-1);
    operations().onPrintList('Lista QA', ['Linha']);
    operations().onPrintBadge('person-b');
    const next = api.calls.at(-1);
    assert.notEqual(next, first);
    assert.equal(JSON.parse(next.options.body).reservationId, 'person-b');
    first.resolve(readableBadge);
    await tick();
    assert.equal(nodes(render()).filter(node => node.type === 'credential-label').length, 0);
    next.resolve({ ...readableBadge, name: 'Cris' });
    await tick();
    assert.ok(nodes(render()).some(node => node.type === 'credential-label'));
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});

test('saldo atualizado no painel tem precedência sobre a leitura inicial do posto', async () => {
  try {
    const start = api.calls.length;
    const tree = await boot(['material_delivery']);
    const initial = api.calls.slice(start).find(call => call.path.endsWith('/desk/kit'));
    button(tree, 'Kit e camisas').props.onClick();
    const stock = nodes(render()).find(node => node.type === 'kit-stock-panel');
    stock.props.onChange({ name: 'Kit', shirtsEnabled: true, sizes: [{ id: 'size-m', label: 'M', available: 0 }] });
    initial.resolve({ name: 'Kit antigo', shirtsEnabled: false, sizes: [] });
    await tick();
    button(render(), 'Buscar participante').props.onClick();
    assert.match(text(render()), /M · esgotado/);
  } finally {
    hooks.unmount();
    delete globalThis.window;
  }
});
