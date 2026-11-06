// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {OperatorCapabilityRepository} from '../dist/operator-capability.repository.js';
import {OperatorCapabilityService} from '../dist/operator-capability.service.js';
const a=new PrismaClient(),b=new PrismaClient();after(async()=>{await Promise.all([a.$disconnect(),b.$disconnect()]);});

async function cenario(prisma,{escopado=true,papelDoAlvo='OPERATOR',capacidades=['credential','access_control']}={}){
 const key=randomUUID();
 const dono=await prisma.user.create({data:{name:'PG capacidades',email:`capability-${key}@evolvia-ci.local`,passwordHash:'fixture'}});
 const operador=await prisma.user.create({data:{name:'Operadora',email:`operator-${key}@evolvia-ci.local`,passwordHash:'fixture'}});
 const estranho=await prisma.user.create({data:{name:'De fora',email:`outsider-${key}@evolvia-ci.local`,passwordHash:'fixture'}});
 const organization=await prisma.organization.create({data:{name:'PG capacidades',slug:`capability-${key}`,createdById:dono.id}});
 const event=await prisma.event.create({data:{ownerId:dono.id,organizationId:organization.id,name:'Evento de permissões',slug:`capability-${key}`,eventType:'Congresso',format:'IN_PERSON',registrationMode:'FREE'}});
 await prisma.organizationMembership.create({data:{organizationId:organization.id,userId:dono.id,role:'OWNER',status:'ACTIVE'}});
 await prisma.organizationMembership.create({data:{organizationId:organization.id,userId:operador.id,role:papelDoAlvo,status:'ACTIVE'}});
 const codigos=escopado?[...capacidades,'operator_scoped_access']:[...capacidades];
 for(const code of codigos) await prisma.eventCapability.create({data:{eventId:event.id,code,status:'ACTIVE'}});
 return {key,dono,operador,estranho,organization,event,escopo:{organizationId:organization.id,eventId:event.id}};
}

const contar=async(prisma,escopo)=>({
 ativas:await prisma.eventOperatorGrant.count({where:escopo}),
 razao:await prisma.eventOperatorGrantEvent.count({where:escopo}),
});

// ---------------------------------------------------------------------------
// 1. Concorrencia: duas concessoes simultaneas nao duplicam
// ---------------------------------------------------------------------------

test('duas conexões concedendo a mesma ação ao mesmo tempo deixam uma linha ativa e uma de razão',{timeout:60000},async()=>{
 const c=await cenario(a);
 const um=new OperatorCapabilityRepository(a),dois=new OperatorCapabilityRepository(b);
 // Barreira depois da leitura do estado vigente, antes de qualquer escrita:
 // é exatamente aí que as duas conexões enxergam "nenhuma concessão ativa".
 const porta=()=>{let abrir;const espera=new Promise(r=>abrir=r);return{espera,abrir};};
 const barreira=porta();let chegaram=0;
 for(const repo of [um,dois]){
  const ler=repo.acoesAtivas.bind(repo);
  repo.acoesAtivas=async(...args)=>{const r=await ler(...args);if(++chegaram===2)barreira.abrir();await barreira.espera;return r;};
 }
 const pedido={...c.escopo,targetUserId:c.operador.id,actorUserId:c.dono.id,reason:'turno da manha',acoes:['checkin']};
 const r=await Promise.allSettled([um.conceder(pedido),dois.conceder(pedido)]);
 assert.equal(r.filter(x=>x.status==='rejected').length,0,'a corrida não deve estourar para quem chamou: '+JSON.stringify(r.map(x=>x.status==='rejected'?String(x.reason&&x.reason.message):x.status)));
 const total=r.filter(x=>x.status==='fulfilled').reduce((n,x)=>n+x.value.aplicadas.length,0);
 assert.equal(total,1,'exatamente uma das duas deve ter escrito');
 assert.deepEqual(await contar(a,c.escopo),{ativas:1,razao:1});
});

// ---------------------------------------------------------------------------
// 2. Idempotencia e ciclo conceder -> revogar -> conceder
// ---------------------------------------------------------------------------

test('conceder duas vezes escreve uma vez; revogar e reconceder preserva todo o histórico',{timeout:60000},async()=>{
 const c=await cenario(a);
 const repo=new OperatorCapabilityRepository(a);
 const base={...c.escopo,targetUserId:c.operador.id,actorUserId:c.dono.id,acoes:['checkin']};

 assert.deepEqual((await repo.conceder({...base,reason:'primeira'})).aplicadas,['checkin']);
 assert.deepEqual((await repo.conceder({...base,reason:'repetida'})).aplicadas,[]);
 assert.deepEqual(await contar(a,c.escopo),{ativas:1,razao:1},'conceder de novo não escreve nem na razão');

 assert.deepEqual((await repo.revogar({...base,reason:'saiu do turno'})).aplicadas,['checkin']);
 assert.deepEqual(await contar(a,c.escopo),{ativas:0,razao:2},'a linha ativa sai; a razão só cresce');
 assert.deepEqual((await repo.revogar({...base,reason:'de novo'})).aplicadas,[]);
 assert.deepEqual(await contar(a,c.escopo),{ativas:0,razao:2});

 assert.deepEqual((await repo.conceder({...base,reason:'voltou'})).aplicadas,['checkin']);
 assert.deepEqual(await contar(a,c.escopo),{ativas:1,razao:3});

 const razao=await a.eventOperatorGrantEvent.findMany({where:c.escopo,orderBy:{occurredAt:'asc'},select:{kind:true,reason:true,actorUserId:true,targetUserId:true}});
 assert.deepEqual(razao.map(r=>r.kind),['GRANTED','REVOKED','GRANTED']);
 assert.deepEqual(razao.map(r=>r.reason),['primeira','saiu do turno','voltou']);
 for(const r of razao){assert.equal(r.actorUserId,c.dono.id);assert.equal(r.targetUserId,c.operador.id);}
});

// ---------------------------------------------------------------------------
// 3. Historico imutavel, imposto pelo banco
// ---------------------------------------------------------------------------

test('a razão recusa UPDATE e DELETE, e a recusa vem do banco',{timeout:60000},async()=>{
 const c=await cenario(a);
 const repo=new OperatorCapabilityRepository(a);
 await repo.conceder({...c.escopo,targetUserId:c.operador.id,actorUserId:c.dono.id,reason:'para tentar alterar',acoes:['checkin']});
 const linha=await a.eventOperatorGrantEvent.findFirstOrThrow({where:c.escopo});

 await assert.rejects(a.$executeRaw`UPDATE "EventOperatorGrantEvent" SET "reason"='reescrito' WHERE "id"=${linha.id}`,/imutavel|imut/i);
 await assert.rejects(a.$executeRaw`DELETE FROM "EventOperatorGrantEvent" WHERE "id"=${linha.id}`,/imutavel|imut/i);
 const depois=await a.eventOperatorGrantEvent.findFirstOrThrow({where:{id:linha.id}});
 assert.equal(depois.reason,'para tentar alterar','a razão não pode ter sido alterada');
 assert.equal(await a.eventOperatorGrantEvent.count({where:c.escopo}),1);
});

// ---------------------------------------------------------------------------
// 4. Isolamento multi-tenant imposto pela FK composta
// ---------------------------------------------------------------------------

test('concessão não consegue apontar para evento de outra organização',{timeout:60000},async()=>{
 const um=await cenario(a),outro=await cenario(a);
 await assert.rejects(
  a.eventOperatorGrant.create({data:{organizationId:um.organization.id,eventId:outro.event.id,targetUserId:um.operador.id,action:'checkin',grantedByUserId:um.dono.id}}),
  'o par (eventId, organizationId) não existe em Event, então o banco precisa recusar',
 );
 assert.equal(await a.eventOperatorGrant.count({where:{organizationId:um.organization.id}}),0);
});

// ---------------------------------------------------------------------------
// 5. 403, 404 e NENHUMA gravacao nas recusas
// ---------------------------------------------------------------------------

test('quem não é membro recebe 404 e não escreve nada',{timeout:60000},async()=>{
 const c=await cenario(a);
 const service=new OperatorCapabilityService(new OperatorCapabilityRepository(a));
 const antes=await contar(a,c.escopo);
 for(const chamada of [
  ()=>service.painel(c.estranho.id,c.event.id),
  ()=>service.historico(c.estranho.id,c.event.id,'10'),
  ()=>service.conceder(c.estranho.id,c.event.id,c.operador.id,{motivo:'tentativa',acoes:['checkin']}),
  ()=>service.revogar(c.estranho.id,c.event.id,c.operador.id,{motivo:'tentativa',acoes:['checkin']}),
 ]){
  await assert.rejects(chamada(),(e)=>{assert.equal(e.getStatus?.(),404);assert.match(e.message,/Evento não encontrado/);return true;});
 }
 assert.deepEqual(await contar(a,c.escopo),antes,'recusa não pode gravar');
 assert.deepEqual(antes,{ativas:0,razao:0});
});

test('operador recebe 403 ao tentar conceder, e não escreve nada',{timeout:60000},async()=>{
 const c=await cenario(a);
 const service=new OperatorCapabilityService(new OperatorCapabilityRepository(a));
 for(const chamada of [
  ()=>service.painel(c.operador.id,c.event.id),
  ()=>service.historico(c.operador.id,c.event.id,'10'),
  ()=>service.conceder(c.operador.id,c.event.id,c.operador.id,{motivo:'autoatendimento',acoes:['checkin']}),
 ]){
  await assert.rejects(chamada(),(e)=>{assert.equal(e.getStatus?.(),403);return true;});
 }
 assert.deepEqual(await contar(a,c.escopo),{ativas:0,razao:0},'operador não pode ter escrito nada');
});

test('organizador concedendo a quem não é operador recebe 403 e não escreve nada',{timeout:60000},async()=>{
 const c=await cenario(a,{papelDoAlvo:'VIEWER'});
 const service=new OperatorCapabilityService(new OperatorCapabilityRepository(a));
 await assert.rejects(
  service.conceder(c.dono.id,c.event.id,c.operador.id,{motivo:'tentativa',acoes:['checkin']}),
  (e)=>{assert.equal(e.getStatus?.(),403);assert.match(e.message,/operadores/);return true;},
 );
 assert.deepEqual(await contar(a,c.escopo),{ativas:0,razao:0});
});

test('motivo ausente e ação inválida recusam sem gravar',{timeout:60000},async()=>{
 const c=await cenario(a);
 const service=new OperatorCapabilityService(new OperatorCapabilityRepository(a));
 for(const corpo of [
  {acoes:['checkin']},
  {motivo:'   ',acoes:['checkin']},
  {motivo:'ok',acoes:['voar']},
  {motivo:'ok',acoes:['updateLabel']},
  {motivo:'ok',acoes:[]},
  {motivo:'ok',acoes:['checkin'],perfil:'credenciamento'},
  {motivo:'ok',perfil:'inexistente'},
  {motivo:'x'.repeat(201),acoes:['checkin']},
 ]){
  await assert.rejects(service.conceder(c.dono.id,c.event.id,c.operador.id,corpo),(e)=>{assert.equal(e.getStatus?.(),403);return true;},JSON.stringify(corpo));
 }
 assert.deepEqual(await contar(a,c.escopo),{ativas:0,razao:0},'nenhuma das oito recusas pode ter gravado');
});

// ---------------------------------------------------------------------------
// 6. Perfil predefinido e painel
// ---------------------------------------------------------------------------

test('conceder por perfil grava uma linha por ação e o painel devolve o que foi concedido',{timeout:60000},async()=>{
 const c=await cenario(a);
 const service=new OperatorCapabilityService(new OperatorCapabilityRepository(a));
 const r=await service.conceder(c.dono.id,c.event.id,c.operador.id,{motivo:'perfil de credenciamento',perfil:'credenciamento'});
 assert.equal(r.aplicadas.length,4);
 assert.deepEqual(await contar(a,c.escopo),{ativas:4,razao:4});

 const painel=await service.painel(c.dono.id,c.event.id);
 assert.equal(painel.escopado,true);
 assert.equal(painel.catalogo.length,17);
 assert.equal(painel.perfis.length,8);
 const alvo=painel.operadores.find(o=>o.userId===c.operador.id);
 assert.ok(alvo,'o operador precisa aparecer no painel');
 assert.deepEqual([...alvo.acoes].sort(),['buscar','checkin','credencial_imprimir','inscricao_ler']);

 const historico=await service.historico(c.dono.id,c.event.id,'10');
 assert.equal(historico.length,4);
 for(const h of historico){assert.equal(h.kind,'GRANTED');assert.equal(h.reason,'perfil de credenciamento');}
});

// ---------------------------------------------------------------------------
// 7. Impressao: tentativa nao conta como conclusao
// ---------------------------------------------------------------------------

test('tentativa de impressão não conta como impressão; só a confirmação conta',{timeout:60000},async()=>{
 const c=await cenario(a);
 const repo=new OperatorCapabilityRepository(a);
 const reservationId=randomUUID();
 const base={...c.escopo,reservationId,actorUserId:c.operador.id};

 assert.equal(await repo.jaImprimiu(c.event.id,reservationId),false);
 assert.equal(await repo.registrarTentativaDeImpressao(base),1);
 assert.equal(await repo.jaImprimiu(c.event.id,reservationId),false,'prévia ou papel atolado NÃO é impressão');
 assert.equal(await repo.registrarTentativaDeImpressao(base),2,'a segunda tentativa ocupa a posição seguinte');
 assert.equal(await repo.jaImprimiu(c.event.id,reservationId),false);

 await repo.confirmarImpressao({...base,sequence:2});
 assert.equal(await repo.jaImprimiu(c.event.id,reservationId),true,'só a confirmação conta');
 await repo.confirmarImpressao({...base,sequence:2});
 assert.equal(await a.eventCredentialPrint.count({where:{eventId:c.event.id,reservationId,kind:'CONFIRMED'}}),1,'confirmar duas vezes é idempotente');

 assert.equal(await a.eventCredentialPrint.count({where:{eventId:c.event.id,reservationId,kind:'ISSUED'}}),2);
 const linha=await a.eventCredentialPrint.findFirstOrThrow({where:{eventId:c.event.id,reservationId,kind:'CONFIRMED'}});
 await assert.rejects(a.$executeRaw`DELETE FROM "EventCredentialPrint" WHERE "id"=${linha.id}`,/imutavel|imut/i);
});

test('duas tentativas simultâneas de impressão não ocupam a mesma posição',{timeout:60000},async()=>{
 const c=await cenario(a);
 const um=new OperatorCapabilityRepository(a),dois=new OperatorCapabilityRepository(b);
 const reservationId=randomUUID();
 const base={...c.escopo,reservationId,actorUserId:c.operador.id};
 const r=await Promise.all([um.registrarTentativaDeImpressao(base),dois.registrarTentativaDeImpressao(base)]);
 assert.deepEqual([...r].sort(),[1,2],'o laço de retry precisa resolver a corrida, não duplicar a posição');
 assert.equal(await a.eventCredentialPrint.count({where:{eventId:c.event.id,reservationId,kind:'ISSUED'}}),2);
});
