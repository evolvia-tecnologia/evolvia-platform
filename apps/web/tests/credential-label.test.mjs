import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const layoutModule=(()=>{const metrics=url(compile('../lib/label-text-metrics.ts'));const code128=url(compile('../lib/code128.ts'));return url(compile('../lib/credential-label-layout.ts').replace(/from ['"]\.\/label-text-metrics['"]/g,`from ${JSON.stringify(metrics)}`).replace(/from ['"]\.\/code128['"]/g,`from ${JSON.stringify(code128)}`));})();
const modules={react:url('export const useEffect=()=>{}; export const useRef=v=>({current:v}); export const useState=v=>[typeof v==="function"?v():v,()=>{}];'),'react/jsx-runtime':url('export const Fragment=Symbol.for("react.fragment");export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'),'./print-surface':url('export default "print-surface";'),'./credential-barcode':url('export default "barcode";'),'./credential-qr':url('export default "qr";'),'./credential-label':url('export default "label";'),'../lib/api':url('export const api=(...args)=>globalThis.__labelSaveApi(...args);'),'../lib/credential-label-layout':layoutModule};
async function load(p,css){return (await import(url(compile(p).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(name===css?url('export default new Proxy({},{get:(_,key)=>key});'):modules[name]??name))))).default;}
const Label=await load('../components/credential-label.tsx','./credential-label.module.css');
const {credentialLabelLayout,LABEL_SIZE_PRESETS}=await import(modules['../lib/credential-label-layout']);
const Settings=await load('../components/credential-label-settings.tsx','./credential-label-settings.module.css');
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
const base={eventName:'Evento',name:'Nome do participante',company:'Instituição',category:'Participante',protocol:'DEMO-001',qr:'EVQ1.demo',barcode:null,widthMm:90,heightMm:40};
test('etiqueta sem linhas opcionais permanece renderizável e com dimensões finitas',()=>{
 for(const lines of [undefined,null,[]]){const tree=Label({label:{...base,lines},preview:true});const n=nodes(tree).find(x=>x.type==='section');assert.ok(n,'a prévia precisa conter a etiqueta');assert.match(text(tree),/Nome do participante/);assert.equal(n.props.style.width,'90mm');assert.ok(Number.isFinite(n.props.style['--label-scale']));assert.equal(nodes(n).filter(x=>x.props?.className==='line').length,0);}
});
test('texto ocupa área própria e QR+barras ficam lado a lado na faixa de códigos',()=>{
 const tree=Label({label:{...base,lines:['Área'],barcode:'EVB1.demo'},preview:true});
 const n=nodes(tree).find(x=>x.type==='section');
 assert.ok(n,'a prévia precisa conter a etiqueta');
 assert.deepEqual(n.props.children.filter(Boolean).map(x=>x.props.className),['copy','codesRow']);
 assert.equal(n.props['data-codes'],'both');
 assert.equal(n.props['data-qr'],false,'com ambos os códigos o QR sai da coluna lateral');
 assert.equal(n.props['data-barcode'],true,'faixa inferior ativa para o par QR+barras');
 const row=n.props.children.filter(Boolean).find(x=>x.props.className==='codesRow');
 assert.equal(row.props['data-codes'],'both');
 const rowKids=Array.isArray(row.props.children)
  ? row.props.children
  : [].concat(row.props.children?.props?.children ?? []);
 assert.deepEqual(rowKids.filter(Boolean).map(x=>x.props.className),['codes','barcode']);
});
test('nome legado longo não sofre clamp silencioso e etiqueta pequena avisa sobre legibilidade',()=>{
 const css=readFileSync(new URL('../components/credential-label.module.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/line-clamp\s*:/,'a impressão não deve truncar nomes em duas linhas');
 const longName='Nome completo '.repeat(30);
 const tree=Label({label:{...base,name:longName,widthMm:40,heightMm:8,lines:[]},preview:true});
 assert.ok(nodes(tree).some(node=>node.props?.role==='alert'),'prévia deve alertar quando o conteúdo não cabe com legibilidade');
 assert.equal(nodes(tree).find(node=>node.type==='section').props['data-fit-warning'],true,'bloquear impressão que cortaria o nome');
 assert.ok(text(tree).includes(longName),'o texto completo deve permanecer no renderizador');
});
test('configuração aceita extraFields ausente na carga e no retorno de salvamento',async()=>{
 const initial={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',showCategory:true,codeMode:'QR'};
 let request;globalThis.__labelSaveApi=async(path,options)=>{request={path,options};return{label:initial};};
 try{let saved;const done=new Promise(resolve=>{const tree=Settings({eventId:'evt / 1',initial,fields:[],onSaved:(message,label)=>{saved=label;resolve();},onError:message=>{throw new Error(message);}});nodes(tree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick();});await done;assert.deepEqual(JSON.parse(request.options.body).extraFields,[]);assert.equal(request.path,'/events/evt%20%2F%201/desk/label');assert.deepEqual(saved.extraFields,[]);assert.equal(saved.widthMm,90);}finally{delete globalThis.__labelSaveApi;}
});


test('etiqueta legível mantém impressão liberada e compartilha o mesmo cálculo físico',()=>{
 const tree=Label({label:{...base,lines:[]},preview:true});
 const sheet=nodes(tree).find(node=>node.type==='section');
 assert.equal(sheet.props['data-fit-warning'],false);
 assert.equal(sheet.props.style['--label-scale'],1);
 const desk=readFileSync(new URL('../components/event-desk.tsx',import.meta.url),'utf8');
 assert.match(desk,/if \(badge && credentialLabelLayout\(badge\)\.fitWarning\) return;/u,
   'o auto-print deve respeitar a validação da mesma prévia');
 assert.match(desk,/disabled=\{credentialLabelLayout\(badge\)\.fitWarning\}/u,
   'a impressão manual também deve ser bloqueada se o conteúdo não couber');
 const kiosk=readFileSync(new URL('../components/self-service-kiosk.tsx',import.meta.url),'utf8');
 assert.match(kiosk,/data-kiosk-label-state="preview"/u,
   'o totem mostra a mesma prévia do posto quando a etiqueta não pode ser impressa');
 assert.match(kiosk,/!credentialLabelLayout\(badge\)\.fitWarning && <div className=\{styles\.label\}/u,
   'a etiqueta imprimível do totem só existe quando o conteúdo cabe');
 assert.match(kiosk,/if \(!credentialLabelLayout\(badge\)\.fitWarning\) window\.print\(\)/u,
   'o totem não imprime etiqueta ilegível pelo botão explícito');
});

test('QR sozinho em 4x2 cm aproveita espaço; texto longo com QR não é impresso silenciosamente',()=>{
 const qrOnly={...base,widthMm:40,heightMm:20,name:null,company:null,category:null,lines:[],
   orderedContent:[{code:'qr',kind:'qr',value:''}]};
 const fit=nodes(Label({label:qrOnly,preview:true})).find(node=>node.type==='section');
 assert.equal(fit.props['data-fit-warning'],false,'QR sozinho deve caber em 4x2 cm');
 assert.ok(Number.parseFloat(fit.props.style['--ordered-qr-size'])>=12,'QR deve manter tamanho legível');
 const crowded={...qrOnly,orderedContent:[
   {code:'preferred_name',kind:'text',value:'Nome científico completo '.repeat(12)},
   {code:'institution',kind:'text',value:'Instituição extensa '.repeat(12)},
   {code:'qr',kind:'qr',value:''},
 ]};
 const preview=Label({label:crowded,preview:true});
 const crowdedSheet=nodes(preview).find(node=>node.type==='section');
 assert.equal(crowdedSheet.props['data-fit-warning'],true);
 assert.ok(Number.parseFloat(crowdedSheet.props.style['--ordered-qr-size'])>=12,
   'Texto longo não pode reduzir o QR a zero; impressão ilegível deve continuar bloqueada');
 assert.ok(crowdedSheet.props.style['--label-scale']<.4,
   'A escala deve considerar o espaço reservado ao QR antes de calcular a altura do texto');
 assert.ok(nodes(preview).some(node=>node.props?.role==='alert'));
 assert.ok(text(preview).includes('Nome científico completo '.repeat(12)));
});


test('salvamento global não confirma configuração divergente ou resposta parcial da API', async () => {
 const initial={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',extraFields:['job_title','city_state'],showCategory:true,codeMode:'BOTH'};
 try {
  for(const returned of [{...initial,codeMode:'QR'},{...initial,extraFields:['city_state','job_title']},{preset:'9x4',widthMm:90}]) {
   globalThis.__labelSaveApi=async()=>({label:returned});
   let saved=0;
   const message=await new Promise(resolve=>{
    const tree=Settings({eventId:'event-A',initial,fields:[],onSaved:()=>{saved+=1;resolve('saved');},onError:resolve});
    nodes(tree).find(n=>n.type==='button'&&text(n)==='Salvar etiqueta').props.onClick();
   });
   assert.equal(saved,0,'a UI não pode anunciar persistência divergente');
   assert.match(message,/Não foi possível salvar a etiqueta/u);
  }
 } finally { delete globalThis.__labelSaveApi; }
});

test('salvamento global de etiquetas não envia dois POSTs concorrentes na mesma sessão',async()=>{
 const initial={preset:'9x4',widthMm:90,heightMm:40,showName:true,nameField:'preferred_name',showCompany:true,companyField:'institution',extraFields:[],showCategory:true,codeMode:'QR'};
 let resolveApi;let requests=0;let saved=0;
 globalThis.__labelSaveApi=()=>{requests+=1;return new Promise(resolve=>{resolveApi=resolve;});};
 try{
  const tree=Settings({eventId:'event-A',initial,fields:[],onSaved:()=>{saved+=1;},onError:(message)=>{throw new Error(message);}});
  const button=nodes(tree).find(node=>node.type==='button'&&text(node)==='Salvar etiqueta');
  button.props.onClick();button.props.onClick();
  assert.equal(requests,1,'um clique repetido não pode criar dois salvamentos simultâneos');
  resolveApi({label:initial});
  await new Promise(setImmediate);
  assert.equal(saved,1);
 }finally{delete globalThis.__labelSaveApi;}
});

test('editor global isola eventos e não expõe erro técnico de outro tenant',()=>{
 const source=readFileSync(new URL('../components/credential-label-settings.tsx',import.meta.url),'utf8');
 const desk=readFileSync(new URL('../components/event-desk.tsx',import.meta.url),'utf8');
 assert.match(desk,/<CredentialLabelSettings\s+key=\{eventId\}/u);
 assert.match(source,/useEffect\(\(\) => \{[\s\S]*?session\.current \+= 1;[\s\S]*?\}, \[eventId\]\)/u);
 assert.match(source,/if \(currentSession !== session\.current\) return;/u);
 assert.match(source,/if \(inFlight\.current === currentSession\) \{/u);
 assert.match(source,/onError\('Não foi possível salvar a etiqueta\. Confira os campos e tente novamente\.'\)/u);
 assert.doesNotMatch(source,/onError\(reason\.message\)/u);
});


test('bloqueia prévia quando a medição real exige escala abaixo do limiar legível', () => {
 const label={...base,qr:null,widthMm:60,heightMm:12,name:null,company:null,category:null,lines:[],
   orderedContent:[{code:'preferred_name',kind:'text',value:'Participante Internacional '.repeat(12)}]};
 const layout=credentialLabelLayout(label);
 const preview=Label({label,preview:true});
 const sheet=nodes(preview).find(node=>node.type==='section');
 const scale=Number(sheet.props.style['--label-scale']);
 assert.equal(scale,layout.scale,'prévia e motor compartilham a mesma escala medida');
 assert.ok(scale < 0.65,'escala fica abaixo do limiar térmico de legibilidade');
 assert.equal(layout.fitWarning,true);
 assert.equal(sheet.props['data-fit-warning'],true,
   'impressão bloqueada quando a medição real não cabe com legibilidade');
 assert.ok(nodes(preview).some(node=>node.props?.role==='alert'));
 assert.equal(Label({label,preview:false}),null,'mesma decisão bloqueia a superfície de impressão');
});


test('QR e barras ordenados usam um único layout e bloqueiam ausência do código ou falta de espaço', () => {
  const both={...base, widthMm:90, heightMm:40, name:null, company:null, category:null, lines:[],
    barcode:'EVB1.demo', orderedContent:[{code:'preferred_name',kind:'text',value:'Bia'},
      {code:'qr',kind:'qr',value:''}, {code:'barcode',kind:'barcode',value:''}]};
  const sheet=nodes(Label({label:both,preview:true})).find(n=>n.type==='section');
  assert.equal(sheet.props['data-fit-warning'],false);
  assert.equal(sheet.props['data-codes'],'both');
  assert.ok(nodes(Label({label:both,preview:true})).some(n=>n.props?.className==='codesRow'));
  assert.ok(nodes(Label({label:both,preview:true})).some(n=>n.props?.className==='barcode'));
  assert.equal(nodes(Label({label:{...both,barcode:null},preview:true})).find(n=>n.type==='section').props['data-fit-warning'],true);
  assert.equal(nodes(Label({label:{...both,qr:null},preview:true})).find(n=>n.type==='section').props['data-fit-warning'],true);
  assert.equal(nodes(Label({label:{...both,heightMm:20,widthMm:40},preview:true})).find(n=>n.type==='section').props['data-fit-warning'],true);
});

test('9×4 cm com ambos os códigos limita a largura das barras e preserva proporção', () => {
  const css=readFileSync(new URL('../components/credential-label.module.css',import.meta.url),'utf8');
  const barcodeSrc=readFileSync(new URL('../components/credential-barcode.tsx',import.meta.url),'utf8');
  assert.match(css,/\.codesRow\[data-codes="both"\]/u);
  assert.match(css,/--label-barcode-width/u);
  assert.doesNotMatch(css,/\.barcode \{[^}]*grid-column:\s*1\s*\/\s*-1/u,'barras não ocupam a grade inteira');
  assert.match(barcodeSrc,/preserveAspectRatio="xMidYMid meet"/u);
  assert.doesNotMatch(barcodeSrc,/preserveAspectRatio="none"/u);
  const both={...base,barcode:'EVB1.demo',widthMm:90,heightMm:40};
  const sheet=nodes(Label({label:both,preview:true})).find(n=>n.type==='section');
  const barcodeW=Number.parseFloat(sheet.props.style['--label-barcode-width']);
  const qrW=Number.parseFloat(sheet.props.style['--label-qr-size']);
  const barH=Number.parseFloat(sheet.props.style['--label-barcode-height']);
  assert.ok(barcodeW < 90 - qrW,'largura das barras deixa espaço ao QR e às margens');
  assert.ok(barH <= 5.5,'altura das barras não domina a etiqueta 9×4');
  assert.ok(qrW >= 12 && qrW <= 14,'QR em modo ambos fica na faixa legível sem exagero');
});

test('todos os presets oficiais cobrem QR, barras, ambos e nenhum sem corte silencioso', () => {
  const css=readFileSync(new URL('../components/credential-label.module.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/overflow:\s*hidden/u,'impressão não corta conteúdo com overflow hidden');
  assert.equal(LABEL_SIZE_PRESETS.length,5,'lista oficial de tamanhos');
  for (const size of LABEL_SIZE_PRESETS) {
    const short={...base,widthMm:size.widthMm,heightMm:size.heightMm,name:'Ana',company:'Org',category:'VIP',lines:[],barcode:null};
    const longName='Participante Internacional '.repeat(8);
    const variants=[
      { ...short, qr:'EVQ1.demo', barcode:null },
      { ...short, qr:null, barcode:'EVB1.demo', codeMode:'BARCODE' },
      { ...short, qr:'EVQ1.demo', barcode:'EVB1.demo' },
      { ...short, qr:null, barcode:null, codeMode:undefined, name:longName },
      { ...short, name:null, company:null, category:null, lines:[], qr:'EVQ1.demo',
        orderedContent:[{code:'preferred_name',kind:'text',value:'Bia',style:{align:'center',bold:true,color:'#111827',fontSizeMm:4}},
          {code:'qr',kind:'qr',value:''}] },
      { ...short, name:null, company:null, category:null, lines:[], qr:'EVQ1.demo', barcode:'EVB1.demo',
        orderedContent:[{code:'preferred_name',kind:'text',value:longName},
          {code:'qr',kind:'qr',value:''},{code:'barcode',kind:'barcode',value:''}] },
    ];
    for (const label of variants) {
      const preview=Label({label,preview:true});
      const sheet=nodes(preview).find(n=>n.type==='section');
      assert.ok(sheet,`${size.preset} precisa renderizar prévia`);
      assert.equal(sheet.props.style.width,`${size.widthMm}mm`);
      assert.equal(sheet.props.style.height,`${size.heightMm}mm`);
      assert.equal(sheet.props['data-reduce-to-fit'],true);
      assert.ok(Number.isFinite(sheet.props.style['--label-scale']));
      const layout=credentialLabelLayout(label);
      assert.equal(layout.reduceToFit,true);
      const print=Label({label,preview:false});
      if (layout.fitWarning) {
        assert.equal(print,null,`${size.preset} ilegível não imprime`);
        assert.ok(nodes(preview).some(n=>n.props?.role==='alert'),`${size.preset} avisa na prévia`);
      } else {
        assert.equal(print.type,'print-surface',`${size.preset} legível usa a mesma superfície`);
        assert.equal(print.props.widthMm,size.widthMm);
        assert.equal(print.props.heightMm,size.heightMm);
      }
    }
  }
});

test('motor compartilhado reduz para caber e bloqueia abaixo do limiar em 8×3', () => {
  const crowded={...base,widthMm:80,heightMm:30,name:'Nome '.repeat(40),company:'Empresa '.repeat(20),lines:['Cargo '.repeat(20)],barcode:'EVB1.demo'};
  const layout=credentialLabelLayout(crowded);
  assert.equal(layout.reduceToFit,true);
  assert.ok(layout.scale < 1);
  assert.equal(layout.fitWarning,true);
  assert.ok(layout.bothCodes || layout.showBarcode);
  assert.ok(layout.measuredHeightMm > 0,'altura total medida inclui tipografia e códigos');
});

test('medição usa avanço por glifo e geometria CSS — não largura média por caractere', async () => {
  const layoutSrc=readFileSync(new URL('../lib/credential-label-layout.ts',import.meta.url),'utf8');
  const metricsSrc=readFileSync(new URL('../lib/label-text-metrics.ts',import.meta.url),'utf8');
  assert.match(layoutSrc,/label-text-metrics/u);
  assert.match(layoutSrc,/LABEL_PAD_MM|LABEL_SHEET_GAP_MM|LABEL_COPY_GAP_MM/u);
  assert.match(layoutSrc,/code128Modules/u);
  assert.doesNotMatch(layoutSrc,/fontMm \* 0\.55|textWidthMm \/ \(emphasis/u);
  assert.doesNotMatch(metricsSrc,/avg(Char|Width)|meanWidth|averageChar/iu);
  assert.match(metricsSrc,/Não usa largura média por caractere/u);
  assert.match(metricsSrc,/glyphAdvanceEm|measureRunWidthMm|wrapTextToWidth/u);

  const metricsUrl=url(compile('../lib/label-text-metrics.ts'));
  const {measureRunWidthMm,wrapTextToWidth}=await import(metricsUrl);
  const narrow=measureRunWidthMm('iiii',4.2);
  const wide=measureRunWidthMm('WWWW',4.2);
  assert.ok(wide > narrow * 1.5,'W e i têm avanços distintos — não média única');
  assert.ok(wrapTextToWidth('Nome completo do participante',20,4.2,{uppercase:true}).length >= 2);

  const short=credentialLabelLayout({...base,name:'Ana',company:null,category:null,lines:[],barcode:null,widthMm:80,heightMm:30});
  const tall=credentialLabelLayout({...base,name:'Ana',company:'Org',category:'VIP',lines:['Cargo'],barcode:'EVB1.demo',widthMm:80,heightMm:30});
  assert.ok(tall.measuredHeightMm > short.measuredHeightMm,
    'altura total cresce com linhas, gaps e faixa de códigos reais');
  assert.equal(tall.bothCodes,true);
  assert.equal(tall.codesMode,'both');
});
