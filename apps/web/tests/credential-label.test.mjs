import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const reactMock=`
export const useRef=value=>{const i=globalThis.__labelHookIndex++;const h=globalThis.__labelHooks;if(!(i in h))h[i]={current:value};return h[i];};
export const useState=value=>{const i=globalThis.__labelHookIndex++;const h=globalThis.__labelHooks;if(!(i in h))h[i]=typeof value==='function'?value():value;return [h[i],next=>{h[i]=typeof next==='function'?next(h[i]):next;}];};
export const useEffect=fn=>{const i=globalThis.__labelHookIndex++;const h=globalThis.__labelHooks;if(!(i in h)){h[i]={cleanup:undefined};globalThis.__labelPendingEffects.push(()=>{h[i].cleanup=fn();});}};
`;
const modules={react:url(reactMock),'react/jsx-runtime':url('export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;'),'./print-surface':url('export default "print-surface";'),'./credential-barcode':url('export default "barcode";'),'./credential-qr':url('export default "qr";'),'./credential-label':url('export default "label";'),'../lib/api':url('export const api=(...args)=>globalThis.__labelSaveApi(...args);')};
async function load(p,css){return (await import(url(compile(p).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(name===css?url('export default new Proxy({},{get:(_,key)=>key});'):modules[name]??name))))).default;}
const Label=await load('../components/credential-label.tsx','./credential-label.module.css');
const Settings=await load('../components/credential-label-settings.tsx','./credential-label-settings.module.css');
function createSettingsRenderer(){
  let activeKey;let hooks=[];
  const cleanup=()=>{for(const hook of hooks)if(typeof hook?.cleanup==='function')hook.cleanup();};
  return {
    render(props){
      const wrapper=Settings(props);
      if(activeKey!==wrapper.key){cleanup();activeKey=wrapper.key;hooks=[];}
      globalThis.__labelHooks=hooks;globalThis.__labelHookIndex=0;
      globalThis.__labelPendingEffects=[];
      const tree=wrapper.type(wrapper.props);
      // useEffect é aplicado após a renderização, como no commit React.
      for(const effect of globalThis.__labelPendingEffects)effect();
      globalThis.__labelPendingEffects=[];
      return tree;
    },
    unmount:cleanup,
  };
}
const renderSettings=props=>createSettingsRenderer().render(props);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const base={eventName:'Evento',name:'Nome do participante',company:'Instituição',category:'Participante',protocol:'DEMO-001',qr:'EVQ1.demo',barcode:null,widthMm:90,heightMm:40};
test('etiqueta sem linhas opcionais permanece renderizável e com dimensões finitas',()=>{
 for(const lines of [undefined,null,[]]){const n=Label({label:{...base,lines},preview:true});assert.match(text(n),/Nome do participante/);assert.equal(n.props.style.width,'90mm');assert.ok(Number.isFinite(n.props.style['--label-scale']));assert.equal(nodes(n).filter(x=>x.props?.className==='line').length,0);}
});
test('texto ocupa área própria e barcode é irmão da área QR, sem dividir a coluna de texto',()=>{
 const n=Label({label:{...base,lines:['Área'],barcode:'EVB1.demo'},preview:true});assert.deepEqual(n.props.children.filter(Boolean).map(x=>x.props.className),['copy','codes','barcode']);assert.equal(n.props['data-qr'],true);assert.equal(n.props['data-barcode'],true);
});
test('configuração aceita extraFields ausente na carga e no retorno de salvamento',async()=>{
 const initial={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',showCategory:true,codeMode:'QR'};
 let request;globalThis.__labelSaveApi=async(path,options)=>{request={path,options};return{label:initial};};
 try{let saved;const done=new Promise(resolve=>{const tree=renderSettings({eventId:'evt / 1',initial,fields:[],onSaved:(message,label)=>{saved=label;resolve();},onError:message=>{throw new Error(message);}});nodes(tree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick();});await done;assert.deepEqual(JSON.parse(request.options.body).extraFields,[]);assert.equal(request.path,'/events/evt%20%2F%201/desk/label');assert.deepEqual(saved.extraFields,[]);assert.equal(saved.widthMm,90);}finally{delete globalThis.__labelSaveApi;}
});


test('resposta sem etiqueta é rejeitada sem apagar o rascunho nem sinalizar sucesso',async()=>{
  const initial={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',extraFields:['job_title'],showCategory:false,codeMode:'QR'};
  try{
    for(const payload of [null,undefined,{}, {label:null}]){
      const errors=[];const notices=[];
      globalThis.__labelSaveApi=async()=>payload;
      const renderer=createSettingsRenderer();
      try{
        const props={eventId:'evento-ficticio',initial,fields:[],onSaved:(message)=>notices.push(message),onError:(message)=>errors.push(message)};
        const tree=renderer.render(props);
        nodes(tree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick();
        await new Promise(resolve=>setTimeout(resolve,0));
        assert.deepEqual(errors,['Resposta do servidor não contém os dados da etiqueta.']);
        assert.deepEqual(notices,[]);
        const current=renderer.render(props);
        assert.match(text(current),/9 × 4 cm · dados de exemplo/);
        assert.ok(nodes(current).filter(n=>n.type==='fieldset').every(n=>n.props.disabled===false));
      }finally{renderer.unmount();}
    }
  }finally{delete globalThis.__labelSaveApi;}
});

test('salvar etiqueta impede clique duplo antes do render e libera nova tentativa após erro',async()=>{
  const initial={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',extraFields:['job_title','city_state'],showCategory:false,codeMode:'QR'};
  const requests=[];const errors=[];const notices=[];
  globalThis.__labelSaveApi=(path,options)=>new Promise((resolve,reject)=>requests.push({path,options,resolve,reject}));
  try{
    const tree=renderSettings({eventId:'evento-ficticio',initial,fields:[],onSaved:(message,label)=>notices.push({message,label}),onError:message=>errors.push(message)});
    const save=nodes(tree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick;
    save();save();
    assert.equal(requests.length,1,'um clique duplo não pode enviar duas alterações');
    requests[0].reject(new Error('Falha temporária'));
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(errors,['Falha temporária']);
    save();save();
    assert.equal(requests.length,2,'após falha, nova tentativa única é permitida');
    assert.deepEqual(JSON.parse(requests[1].options.body).extraFields,['job_title','city_state']);
    requests[1].resolve({label:initial});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(notices.length,1);
    assert.deepEqual(notices[0].label.extraFields,['job_title','city_state']);
  }finally{delete globalThis.__labelSaveApi;}
});

test('controles ficam desabilitados durante o POST real e reabilitados após retorno',async()=>{
  const initial={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',extraFields:['job_title','city_state'],showCategory:false,codeMode:'QR'};
  const props={eventId:'evento-ficticio',initial,fields:[],onSaved:()=>{},onError:()=>{}};
  const renderer=createSettingsRenderer();
  let resolveRequest;
  globalThis.__labelSaveApi=()=>new Promise(resolve=>{resolveRequest=resolve;});
  try{
    const enabledTree=renderer.render(props);
    const enabled=nodes(enabledTree).filter(n=>n.type==='fieldset');
    assert.equal(enabled.length,3);
    assert.ok(enabled.every(n=>n.props.disabled===false),'controles disponíveis sem salvamento');
    nodes(enabledTree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick();
    const disabled=nodes(renderer.render(props)).filter(n=>n.type==='fieldset');
    assert.equal(disabled.length,3);
    assert.ok(disabled.every(n=>n.props.disabled===true),'tamanho, dados e QR bloqueados durante POST');
    resolveRequest({label:initial});
    await new Promise(resolve=>setTimeout(resolve,0));
    const reenabled=nodes(renderer.render(props)).filter(n=>n.type==='fieldset');
    assert.ok(reenabled.every(n=>n.props.disabled===false),'controles reabilitados após salvar');
  }finally{renderer.unmount();delete globalThis.__labelSaveApi;}
});

test('troca de evento recria o formulário e descarta resposta tardia da etiqueta anterior',async()=>{
  const first={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',extraFields:['job_title'],showCategory:false,codeMode:'QR'};
  const second={...first,preset:'6x3',widthMm:60,heightMm:30,extraFields:['city_state']};
  const requests=[];const notices=[];const errors=[];
  globalThis.__labelSaveApi=(path,options)=>new Promise((resolve,reject)=>requests.push({path,options,resolve,reject}));
  const renderer=createSettingsRenderer();
  const common={fields:[],onSaved:(message,label)=>notices.push({message,label}),onError:message=>errors.push(message)};
  try{
    const oldTree=renderer.render({...common,eventId:'org-a/evt-a',initial:first});
    nodes(oldTree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick();
    assert.equal(requests.length,1);
    const newProps={...common,eventId:'org-b/evt-b',initial:second};
    const newTree=renderer.render(newProps);
    assert.match(text(newTree),/6 × 3 cm · dados de exemplo/);
    nodes(newTree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick();
    assert.equal(requests.length,2,'POST do evento anterior não bloqueia o novo evento');
    assert.equal(requests[0].path,'/events/org-a%2Fevt-a/desk/label');
    assert.equal(requests[1].path,'/events/org-b%2Fevt-b/desk/label');
    assert.deepEqual(JSON.parse(requests[1].options.body).extraFields,['city_state']);
    requests[0].resolve({label:first});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(notices.length,0,'resposta tardia não pode avisar sobre outro evento');
    assert.deepEqual(errors,[]);
    requests[1].resolve({label:second});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(notices.length,1);
    assert.equal(notices[0].label.widthMm,60);
    assert.match(text(renderer.render(newProps)),/6 × 3 cm · dados de exemplo/);
  }finally{renderer.unmount();delete globalThis.__labelSaveApi;}
});

test('carga com campos opcionais vazios e resposta parcial preserva seleções do rascunho', async () => {
  const initial = {
    preset: '9x4', widthMm: 90, heightMm: 40, showName: true, nameField: '',
    showCompany: true, companyField: undefined, extraFields: [null, 'job_title', ''],
    showCategory: false, codeMode: 'QR',
  };
  const renderer = createSettingsRenderer();
  let request;
  let saved;
  const errors = [];
  globalThis.__labelSaveApi = async (path, options) => {
    request = { path, options };
    return { label: { widthMm: 80 } };
  };
  try {
    const props = {
      eventId: 'org-b/evento-b', initial,
      fields: [{ code: '', label: 'Inválido' }, { code: null, label: 'Ausente' }],
      onSaved: (_message, label) => { saved = label; },
      onError: (message) => errors.push(message),
    };
    const tree = renderer.render(props);
    const selects = nodes(tree).filter((node) => node.type === 'select');
    assert.equal(selects[0].props.value, 'preferred_name');
    assert.equal(selects[1].props.value, 'institution');
    assert.equal(nodes(tree).filter((node) => node.type === 'option' &&
      (node.props.value === null || node.props.value === undefined)).length, 0);
    nodes(tree).find((node) => node.type === 'button' && text(node) === 'Salvar etiqueta').props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(errors, []);
    assert.equal(request.path, '/events/org-b%2Fevento-b/desk/label');
    const sent = JSON.parse(request.options.body);
    assert.equal(sent.nameField, 'preferred_name');
    assert.equal(sent.companyField, 'institution');
    assert.deepEqual(sent.extraFields, ['job_title']);
    assert.equal(saved.widthMm, 80);
    assert.equal(saved.heightMm, 40);
    assert.equal(saved.nameField, 'preferred_name');
    assert.equal(saved.companyField, 'institution');
    assert.deepEqual(saved.extraFields, ['job_title'], 'resposta sem extraFields não apaga linhas do rascunho');
    assert.match(text(renderer.render(props)), /8 × 4 cm · dados de exemplo/);
  } finally {
    renderer.unmount();
    delete globalThis.__labelSaveApi;
  }
});

test('resposta com opções vazias não cria campos inválidos no seletor', async () => {
  const initial = {
    preset: '9x4', widthMm: 90, heightMm: 40, showName: true, nameField: 'preferred_name',
    showCompany: true, companyField: 'institution', extraFields: ['job_title'],
    showCategory: false, codeMode: 'QR',
  };
  const renderer = createSettingsRenderer();
  let saved;
  const errors = [];
  globalThis.__labelSaveApi = async () => ({
    label: { nameField: null, companyField: '', extraFields: [null, 'city_state', ''] },
  });
  try {
    const props = {
      eventId: 'evento-ficticio', initial, fields: [],
      onSaved: (_message, label) => { saved = label; },
      onError: (message) => errors.push(message),
    };
    const tree = renderer.render(props);
    nodes(tree).find((node) => node.type === 'button' && text(node) === 'Salvar etiqueta').props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(errors, []);
    assert.equal(saved.nameField, 'preferred_name');
    assert.equal(saved.companyField, 'institution');
    assert.deepEqual(saved.extraFields, ['city_state']);
    const updated = renderer.render(props);
    const selects = nodes(updated).filter((node) => node.type === 'select');
    assert.equal(selects[0].props.value, 'preferred_name');
    assert.equal(selects[1].props.value, 'institution');
    assert.equal(nodes(updated).filter((node) => node.type === 'option' &&
      (node.props.value === null || node.props.value === undefined)).length, 0);
  } finally {
    renderer.unmount();
    delete globalThis.__labelSaveApi;
  }
});
