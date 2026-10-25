import assert from 'node:assert/strict';
import test from 'node:test';
import { eventReportLinks } from '../lib/event-report-links.ts';
const base = {event:{id:'event A',profileCode:'OTHER'},enabledModules:[],attendanceEnabled:false,scientific:null};
test('seis famílias têm acesso comum sem conceder recursos por nome do perfil',()=>{
  for (const profileCode of ['SCIENTIFIC_EVENT','CORPORATE_TRAINING','FAIR_EXHIBITION','ENTERTAINMENT','SOCIAL_COMMUNITY','OTHER']) {
    const links = eventReportLinks({...base,event:{...base.event,profileCode}});
    assert.deepEqual(links.map(item=>item.id),['people','evaluation','certificates']);
    assert.ok(links.every(item=>item.href.startsWith('/eventos/event%20A/')));
  }
});
test('capabilities e dados autorizados liberam apenas as consultas correspondentes',()=>{
  const enabled = {...base,enabledModules:['exhibitor'],attendanceEnabled:true,scientific:{submissions:[]}};
  assert.deepEqual(eventReportLinks(enabled).map(item=>item.id),['people','evaluation','certificates','desk','submissions','reviews','program','exhibitors','caex']);
  assert.ok(eventReportLinks({...enabled,enabledModules:[]}).every(item=>!['exhibitors','caex'].includes(item.id)));
  assert.ok(eventReportLinks({...enabled,scientific:null}).every(item=>!['submissions','reviews','program'].includes(item.id)));
});
test('links não fazem requisições nem carregam documento/contato e mantêm evento no caminho',()=>{
  const links = eventReportLinks({...base,event:{id:'a/b?c#d'},enabledModules:undefined});
  assert.ok(links.every(item=>item.href.startsWith('/eventos/a%2Fb%3Fc%23d/')));
  assert.equal(new Set(links.map(item=>item.id)).size,links.length);
  assert.ok(links.every(item=>!item.href.includes('undefined') && !item.href.includes('http')));
});
