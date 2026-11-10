import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROTAS_DO_BALCAO,
  conferirCoerencia,
  decidirRota,
  ehRotaDoBalcao,
  rotasPermitidas,
} from '../src/operator-capability-enforcement.ts';
import { ACOES_DE_OPERADOR, CODIGO_ESCOPO_OPERADOR, acoesDoPerfil } from '../src/operator-capability-policy.ts';

const ORG = 'org-1';
const EVT = 'evt-1';
const USR = 'usr-1';
const TODAS = ['credential', 'access_control', 'material_delivery', 'registration'];
const ESCOPADO = [...TODAS, CODIGO_ESCOPO_OPERADOR];

const ctx = (over = {}) => ({
  papel: 'OPERATOR',
  organizationId: ORG,
  eventId: EVT,
  userId: USR,
  capacidadesDoEvento: ESCOPADO,
  concessoes: [],
  ...over,
});

const conceder = (acao, over = {}) => ({
  organizationId: ORG,
  eventId: EVT,
  userId: USR,
  acao,
  revogadaEm: null,
  ...over,
});

const comPerfil = (perfil, over = {}) =>
  ctx({ concessoes: acoesDoPerfil(perfil).map((a) => conceder(a)), ...over });

// ---------------------------------------------------------------------------
// 1. A propriedade central: rota nao mapeada FALHA FECHADA
// ---------------------------------------------------------------------------

test('rota não mapeada é negada, não liberada', () => {
  for (const rota of [
    'POST /check-in/undo',
    'GET /registrations',
    'DELETE /badge',
    'POST /nova-rota-que-alguem-acrescentou',
    'GET /KIT',
    'GET /kit/',
    '',
    'POST /badge ',
  ]) {
    const d = decidirRota(rota, ctx());
    assert.equal(d.permitido, false, `rota "${rota}" deveria ser negada`);
    assert.equal(d.motivo, 'rota_nao_mapeada', rota);
    assert.equal(d.acaoExigida, null, rota);
  }
});

test('rota não mapeada é negada até para OWNER — inconsistência nega (diretriz 3)', () => {
  for (const papel of ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']) {
    const d = decidirRota('POST /rota-nova', ctx({ papel }));
    assert.equal(d.permitido, false, papel);
    assert.equal(d.motivo, 'rota_nao_mapeada', papel);
  }
});

test('entradas que não são string também são negadas', () => {
  for (const v of [null, undefined, 42, {}, [], true, Object.prototype]) {
    assert.equal(decidirRota(v, ctx()).permitido, false, String(v));
  }
  assert.equal(ehRotaDoBalcao('constructor'), false);
  assert.equal(ehRotaDoBalcao('toString'), false);
});

// ---------------------------------------------------------------------------
// 2. O caminho que PERMITE
// ---------------------------------------------------------------------------

test('rota mapeada com concessão é permitida, e informa a ação exigida', () => {
  const d = decidirRota('POST /check-in', ctx({ concessoes: [conceder('checkin')] }));
  assert.equal(d.permitido, true);
  assert.equal(d.motivo, null);
  assert.equal(d.acaoExigida, 'checkin');
});

test('rota mapeada sem concessão é negada pela política, com motivo da política', () => {
  const d = decidirRota('POST /check-in', ctx());
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'sem_concessao_para_a_acao');
  assert.equal(d.acaoExigida, 'checkin');
});

// ---------------------------------------------------------------------------
// 3. O painel (GET /) e liberado ao staff, mas confere o papel aqui mesmo
// ---------------------------------------------------------------------------

test('GET / é liberada ao staff sem concessão, para o operador ver que está sem concessões', () => {
  for (const papel of ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']) {
    const d = decidirRota('GET /', ctx({ papel, concessoes: [] }));
    assert.equal(d.permitido, true, papel);
    assert.equal(d.acaoExigida, null, papel);
  }
});

test('GET / nega VIEWER sem delegar a negativa a requireRole', () => {
  const d = decidirRota('GET /', ctx({ papel: 'VIEWER' }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'papel_sem_acesso_ao_balcao');
});

// ---------------------------------------------------------------------------
// 4. Rotas de organizador
// ---------------------------------------------------------------------------

test('rota de organizador nega OPERATOR mesmo com todas as concessões possíveis', () => {
  const todas = Object.keys(ACOES_DE_OPERADOR).map((a) => conceder(a));
  for (const [rota, e] of Object.entries(ROTAS_DO_BALCAO)) {
    if (e.tipo !== 'organizador') continue;
    const d = decidirRota(rota, ctx({ concessoes: todas }));
    assert.equal(d.permitido, false, rota);
    assert.equal(d.motivo, 'rota_exige_organizador', rota);
  }
});

test('rota de organizador permite OWNER/ADMIN/MANAGER e nega VIEWER', () => {
  for (const [rota, e] of Object.entries(ROTAS_DO_BALCAO)) {
    if (e.tipo !== 'organizador') continue;
    for (const papel of ['OWNER', 'ADMIN', 'MANAGER']) {
      assert.equal(decidirRota(rota, ctx({ papel })).permitido, true, `${rota}/${papel}`);
    }
    assert.equal(decidirRota(rota, ctx({ papel: 'VIEWER' })).permitido, false, `${rota}/VIEWER`);
  }
});

// ---------------------------------------------------------------------------
// 5. POST /badge: uma rota, duas acoes
// ---------------------------------------------------------------------------

test('POST /badge exige imprimir na primeira vez e reimprimir depois', () => {
  const comImprimir = ctx({ concessoes: [conceder('credencial_imprimir')] });
  const primeira = decidirRota('POST /badge', { ...comImprimir, jaImprimiu: false });
  assert.equal(primeira.acaoExigida, 'credencial_imprimir');
  assert.equal(primeira.permitido, true);

  const repetida = decidirRota('POST /badge', { ...comImprimir, jaImprimiu: true });
  assert.equal(repetida.acaoExigida, 'credencial_reimprimir');
  assert.equal(repetida.permitido, false);
  assert.equal(repetida.motivo, 'sem_concessao_para_a_acao');
});

test('quem tem reimprimir mas não imprimir não imprime a primeira', () => {
  const c = ctx({ concessoes: [conceder('credencial_reimprimir')] });
  assert.equal(decidirRota('POST /badge', { ...c, jaImprimiu: false }).permitido, false);
  assert.equal(decidirRota('POST /badge', { ...c, jaImprimiu: true }).permitido, true);
});

test('jaImprimiu ausente ou não booleano é tratado como primeira impressão, nunca como reimpressão', () => {
  const c = ctx({ concessoes: [conceder('credencial_imprimir')] });
  for (const v of [undefined, null, 0, '', 'true', 1]) {
    const d = decidirRota('POST /badge', { ...c, jaImprimiu: v });
    assert.equal(d.acaoExigida, 'credencial_imprimir', String(v));
  }
});

// ---------------------------------------------------------------------------
// 6. Coerencia entre o mapa de rotas e o catalogo
// ---------------------------------------------------------------------------

test('o mapa de rotas e o catálogo de ações estão coerentes', () => {
  assert.deepEqual(conferirCoerencia(), []);
});

test('o mapa cobre as 24 rotas do EventDeskController', () => {
  assert.equal(Object.keys(ROTAS_DO_BALCAO).length, 24);
  const metodos = new Set(Object.values(ROTAS_DO_BALCAO).map((e) => e.metodo));
  // badge aparece uma vez como rota, mas carrega duas ações
  assert.equal(metodos.size, 24);
});

test('cada rota aponta para o método que a ação diz ser o dela', () => {
  for (const [rota, e] of Object.entries(ROTAS_DO_BALCAO)) {
    if (e.tipo !== 'acao') continue;
    assert.equal(ACOES_DE_OPERADOR[e.acao].metodo, e.metodo, rota);
  }
});

// ---------------------------------------------------------------------------
// 7. Interface limitada, a partir dos perfis
// ---------------------------------------------------------------------------

test('perfil de credenciamento não alcança rotas de material nem de organizador', () => {
  const rotas = rotasPermitidas(comPerfil('credenciamento'));
  assert.ok(rotas.includes('POST /check-in'));
  assert.ok(rotas.includes('POST /badge'));
  assert.ok(rotas.includes('GET /'));
  assert.equal(rotas.includes('POST /check-in/reverse'), false);
  assert.equal(rotas.includes('POST /material'), false);
  assert.equal(rotas.includes('POST /label'), false);
  assert.equal(rotas.includes('GET /kit/export'), false);
});

test('perfil de supervisão de credenciamento alcança as reversões do próprio escopo, e só', () => {
  const rotas = rotasPermitidas(comPerfil('credenciamento_supervisao'));
  assert.ok(rotas.includes('POST /check-in/reverse'));
  assert.ok(rotas.includes('POST /registrations/:reservationId/corrections'));
  assert.equal(rotas.includes('POST /material/reverse'), false);
  assert.equal(rotas.includes('POST /day-presence/reverse'), false);
});

test('somente_leitura não alcança nenhuma rota que escreva', () => {
  const rotas = rotasPermitidas(comPerfil('somente_leitura'));
  const escrevem = Object.entries(ROTAS_DO_BALCAO)
    .filter(([r, e]) => r.startsWith('POST') && e.tipo === 'acao' && ACOES_DE_OPERADOR[e.acao].sensivel)
    .map(([r]) => r);
  for (const r of escrevem) assert.equal(rotas.includes(r), false, r);
  assert.ok(rotas.includes('GET /report'));
  assert.ok(rotas.includes('GET /kit/report'));
});

test('operador sem concessão alcança só GET / em evento escopado', () => {
  assert.deepEqual(rotasPermitidas(ctx({ concessoes: [] })), ['GET /']);
});

test('organizador alcança todas as 24 rotas', () => {
  assert.equal(rotasPermitidas(ctx({ papel: 'MANAGER' })).length, 24);
});

test('VIEWER não alcança rota alguma', () => {
  assert.deepEqual(rotasPermitidas(ctx({ papel: 'VIEWER' })), []);
});

// ---------------------------------------------------------------------------
// 8. Aditividade tambem na borda
// ---------------------------------------------------------------------------

test('evento não escopado: operador alcança as rotas de hoje, sem concessão', () => {
  const rotas = rotasPermitidas(ctx({ capacidadesDoEvento: TODAS, concessoes: [] }));
  const deOrganizador = Object.entries(ROTAS_DO_BALCAO)
    .filter(([, e]) => e.tipo === 'organizador')
    .map(([r]) => r);
  assert.equal(rotas.length, 24 - deOrganizador.length);
  for (const r of deOrganizador) assert.equal(rotas.includes(r), false, r);
});

// ---------------------------------------------------------------------------
// 9. O proprio conferidor de coerencia precisa saber acusar
// ---------------------------------------------------------------------------

test('conferirCoerencia acusa ação que não existe no catálogo', () => {
  const p = conferirCoerencia({ 'POST /x': { tipo: 'acao', metodo: 'checkInReservation', acao: 'voar' } });
  assert.match(p[0], /ação "voar" não existe no catálogo/u);
  // e não confunde o problema da ação inválida com os de cobertura
  assert.equal(p.filter((m) => /não existe no catálogo/u.test(m)).length, 1, p.join(' | '));
});

test('conferirCoerencia acusa rota apontando para o método errado', () => {
  const p = conferirCoerencia({ 'POST /x': { tipo: 'acao', metodo: 'report', acao: 'checkin' } });
  assert.ok(
    p.some((m) => /é do método "checkInReservation", não "report"/u.test(m)),
    p.join(' | '),
  );
});

test('conferirCoerencia acusa rota de organizador cujo método não é de organizador', () => {
  const p = conferirCoerencia({ 'POST /x': { tipo: 'organizador', metodo: 'checkInReservation' } });
  assert.ok(
    p.some((m) => /"checkInReservation" não está na lista de métodos só de organizador/u.test(m)),
    p.join(' | '),
  );
});

test('conferirCoerencia acusa liberação ao staff de método que não é o painel', () => {
  const p = conferirCoerencia({ 'POST /x': { tipo: 'staff', metodo: 'badge' } });
  assert.ok(p.some((m) => /só "context" pode ser liberada ao staff/u.test(m)), p.join(' | '));
});

test('conferirCoerencia acusa ação do catálogo que nenhuma rota exige', () => {
  const p = conferirCoerencia({ 'GET /': { tipo: 'staff', metodo: 'context' } });
  const faltando = p.filter((m) => /não é exigida por nenhuma rota/u.test(m));
  // as 17 ações ficam sem rota: sem rota de impressão, o par não é dispensado
  assert.equal(faltando.length, 17, p.join(' | '));
  // com a rota de impressão presente, o par passa a estar coberto
  const comBadge = conferirCoerencia({
    'GET /': { tipo: 'staff', metodo: 'context' },
    'POST /badge': { tipo: 'impressao', metodo: 'badge' },
  }).filter((m) => /não é exigida por nenhuma rota/u.test(m));
  assert.equal(comBadge.length, 15, comBadge.join(' | '));
});

test('conferirCoerencia acusa método só de organizador sem rota', () => {
  const p = conferirCoerencia({ 'POST /badge': { tipo: 'impressao', metodo: 'badge' } });
  assert.equal(p.filter((m) => /só de organizador .* sem rota mapeada/u.test(m)).length, 7, p.join(' | '));
});

test('conferirCoerencia aceita um mapa pequeno mas coerente, sem inventar problema', () => {
  // mapa coerente quanto a metodo/acao: os unicos problemas devem ser de cobertura
  const p = conferirCoerencia({ 'POST /check-in': { tipo: 'acao', metodo: 'checkInReservation', acao: 'checkin' } });
  assert.equal(p.filter((m) => /não existe no catálogo|é do método|não está na lista|pode ser liberada/u.test(m)).length, 0, p.join(' | '));
});
