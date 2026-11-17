import assert from 'node:assert/strict';
import test from 'node:test';
import { AREAS, areaDaAcao, jornadaDoOperador, rotaDoPosto } from '../lib/operator-journey.ts';
import { ROTULOS } from '../lib/operator-capability-diff.ts';
import { readFileSync } from 'node:fs';

/**
 * CL-R2.2 — a tela do operador restrito. Este arquivo prova a montagem da
 * jornada; o componente `.tsx` não é importável por teste neste ambiente, e a
 * rota em si é provada em
 * `apps/api/tests-postgres/operator-self-service-http.postgres.test.mjs`.
 *
 * O que se protege aqui é a honestidade da tela: nunca esconder ação que a
 * pessoa TEM, nunca prometer ação que ela não tem, e nunca inventar link.
 */

const TODAS = Object.keys(ROTULOS);
const item = (acao, sensivel = false, capacidade = null) => ({ acao, capacidade, sensivel });
const resposta = (extra = {}) => ({ escopado: true, papel: 'OPERATOR', acoes: [], ...extra });
const achar = (j, acao) => j.grupos.flatMap((g) => g.entradas).find((e) => e.acao === acao);
const permitidas = (j) => j.grupos.flatMap((g) => g.entradas).filter((e) => e.permitida).map((e) => e.acao).sort();

test('toda ação com rótulo tem área: nenhuma cai em "outras" por esquecimento', () => {
  for (const acao of TODAS) {
    assert.notEqual(areaDaAcao(acao), 'outras', `${acao} ficou sem área na tabela da tela`);
  }
});

test('o catálogo inteiro aparece, e só o concedido vem marcado como permitido', () => {
  const j = jornadaDoOperador(resposta({ acoes: [item('checkin'), item('buscar')] }), ROTULOS);
  assert.equal(j.total, TODAS.length);
  assert.equal(j.permitidas, 2);
  assert.deepEqual(permitidas(j), ['buscar', 'checkin']);
  // As demais existem na tela, como indisponíveis: a pessoa vê que a ação
  // existe e que não é dela, em vez de descobrir com um 403 no atendimento.
  assert.equal(achar(j, 'checkin_reverter').permitida, false);
  assert.equal(achar(j, 'credencial_imprimir').permitida, false);
});

test('sem nenhuma concessão, nada vem permitido e o posto não é oferecido', () => {
  const j = jornadaDoOperador(resposta(), ROTULOS);
  assert.deepEqual(permitidas(j), []);
  assert.equal(j.podeAbrirPosto, false, 'oferecer o posto sem nenhuma ação seria mandar a pessoa tomar 403');
  assert.equal(j.aviso.tipo, 'sem_permissao');
});

test('com pelo menos uma ação, o posto é oferecido e não há aviso', () => {
  const j = jornadaDoOperador(resposta({ acoes: [item('buscar')] }), ROTULOS);
  assert.equal(j.podeAbrirPosto, true);
  assert.equal(j.aviso, null);
});

// O ponto que separa tela honesta de tela bonita.
test('evento não escopado avisa que a lista não é concessão sua, e esse aviso tem precedência', () => {
  const j = jornadaDoOperador(resposta({ escopado: false, acoes: TODAS.map((a) => item(a)) }), ROTULOS);
  assert.equal(j.aviso.tipo, 'evento_sem_escopo');
  assert.match(j.aviso.texto, /não uma permissão concedida a você/u);

  // Mesmo com a lista vazia, o aviso de escopo vem antes: dizer "você não tem
  // permissão" num evento sem escopo seria falso.
  const vazia = jornadaDoOperador(resposta({ escopado: false, acoes: [] }), ROTULOS);
  assert.equal(vazia.aviso.tipo, 'evento_sem_escopo');
});

test('papel sem acesso ao balcão recebe explicação própria, não "peça ao organizador"', () => {
  const j = jornadaDoOperador(resposta({ papel: 'VIEWER' }), ROTULOS);
  assert.equal(j.aviso.tipo, 'papel_sem_balcao');
  assert.match(j.aviso.texto, /administra a organiza/u);
  // Pedir concessão não resolveria, e mandar pedir seria mandar a pessoa
  // perder tempo com quem não pode ajudar.
  assert.doesNotMatch(j.aviso.texto, /Peça ao organizador do evento/u);
});

test('a marca de sensível vem do servidor e nunca é inferida do nome', () => {
  const j = jornadaDoOperador(resposta({ acoes: [item('checkin_reverter', true), item('checkin', false)] }), ROTULOS);
  assert.equal(achar(j, 'checkin_reverter').sensivel, true);
  assert.equal(achar(j, 'checkin').sensivel, false);
  // `material_reverter` tem "reverter" no nome, mas não foi concedida: não
  // pode aparecer marcada como sensível só por causa do nome.
  assert.equal(achar(j, 'material_reverter').sensivel, false);
});

// Deriva nesta direção é a que fere: a pessoa TEM a ação e a tela a esconde.
test('ação que o servidor conhece e a interface ainda não rotula aparece pelo código, permitida', () => {
  const j = jornadaDoOperador(resposta({ acoes: [item('acao_nova_do_servidor', true)] }), ROTULOS);
  const nova = achar(j, 'acao_nova_do_servidor');
  assert.ok(nova, 'ação desconhecida não pode desaparecer da tela');
  assert.equal(nova.permitida, true);
  assert.equal(nova.sensivel, true);
  assert.equal(nova.rotulo, 'acao_nova_do_servidor', 'sem rótulo, mostra o código');
  assert.equal(areaDaAcao('acao_nova_do_servidor'), 'outras');
  assert.equal(j.total, TODAS.length + 1);
  assert.equal(j.podeAbrirPosto, true);
});

test('resposta malformada não derruba a tela nem inventa permissão', () => {
  for (const ruim of [
    resposta({ acoes: undefined }),
    resposta({ acoes: [null] }),
    resposta({ acoes: [{ acao: '' }] }),
    resposta({ acoes: [{ capacidade: null, sensivel: true }] }),
  ]) {
    const j = jornadaDoOperador(ruim, ROTULOS);
    assert.deepEqual(permitidas(j), [], JSON.stringify(ruim.acoes ?? null));
    assert.equal(j.podeAbrirPosto, false);
  }
});

test('ação repetida na resposta não vira duas entradas', () => {
  const j = jornadaDoOperador(resposta({ acoes: [item('checkin'), item('checkin', true)] }), ROTULOS);
  const todas = j.grupos.flatMap((g) => g.entradas).filter((e) => e.acao === 'checkin');
  assert.equal(todas.length, 1);
  assert.equal(j.permitidas, 1);
  assert.equal(todas[0].sensivel, true, 'a última ocorrência vale, e não some');
});

test('os grupos vazios não aparecem e a ordem das áreas é estável', () => {
  const j = jornadaDoOperador(resposta({ acoes: [item('buscar')] }), ROTULOS);
  const areas = j.grupos.map((g) => g.area);
  assert.deepEqual(areas, AREAS.filter((a) => areas.includes(a)), 'ordem tem de seguir AREAS');
  assert.ok(!areas.includes('outras'), 'sem ação desconhecida, não existe grupo "outras"');
  for (const grupo of j.grupos) {
    assert.ok(grupo.entradas.length > 0, `grupo ${grupo.area} veio vazio`);
    assert.ok(grupo.titulo.length > 0);
  }
});

test('cada entrada aparece em exatamente um grupo', () => {
  const j = jornadaDoOperador(resposta({ acoes: TODAS.map((a) => item(a)) }), ROTULOS);
  const vistas = j.grupos.flatMap((g) => g.entradas).map((e) => e.acao);
  assert.equal(new Set(vistas).size, vistas.length, 'ação duplicada entre grupos');
  assert.equal(vistas.length, TODAS.length);
});

// Não inventar link de funcionalidade que não existe.
test('a rota do posto é a única publicada e vai escapada', () => {
  assert.equal(rotaDoPosto('evt-1'), '/eventos/evt-1/painel/check-in');
  assert.equal(rotaDoPosto('a/b?c'), '/eventos/a%2Fb%3Fc/painel/check-in');
});

// ---------------------------------------------------------------------------
// Segunda parte: contrato de CÓDIGO-FONTE do componente.
//
// `operator-journey.tsx` tem JSX, que o Node não parseia, logo não pode ser
// importado aqui. O que se prende abaixo são as decisões de honestidade da
// tela — as que, se alguém desfizer sem perceber, voltam a fazer a interface
// mentir. Limite declarado: teste de texto não distingue código de comentário,
// então as asserções olham CHAMADA e atribuição, não menção.
// ---------------------------------------------------------------------------

const FONTE_CRUA = readFileSync(new URL('../components/operator-journey.tsx', import.meta.url), 'utf8');

/**
 * Tira comentários antes de asserir.
 *
 * Isto não é zelo: é correção de um defeito que já me pegou três vezes neste
 * projeto. A asserção de `key={eventId}` passava porque o próprio comentário
 * do componente cita `key={eventId}` em prosa — remover a linha de código
 * deixava o teste verde, e uma mutação sobreviveu exatamente assim.
 *
 * Limite assumido: a remoção é textual, então uma barra dupla dentro de string
 * cortaria a linha cedo. Vale aqui porque este componente não tem nenhuma, e
 * há teste abaixo que confere isso em vez de confiar na leitura.
 */
function semComentarios(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .map((linha) => linha.replace(/\/\/.*$/u, ''))
    .join('\n');
}

const COMPONENTE = semComentarios(FONTE_CRUA);

test('o removedor de comentários é seguro neste arquivo: nenhuma barra dupla no meio da linha', () => {
  // Se um dia aparecer uma URL no componente, esta asserção reprova e avisa
  // que o removedor acima passou a poder cortar código.
  const semBloco = FONTE_CRUA.replace(/\/\*[\s\S]*?\*\//gu, '');
  for (const linha of semBloco.split('\n')) {
    const corte = linha.indexOf('//');
    if (corte === -1) continue;
    assert.equal(linha.slice(0, corte).trim(), '', `barra dupla no meio da linha: ${linha.trim()}`);
  }
});

test('o recorte sem comentários não ficou vazio nem comeu código', () => {
  // Fonte vazia faria toda asserção de doesNotMatch passar por vacuidade.
  assert.ok(COMPONENTE.includes('ScopedOperatorJourney'));
  assert.ok(COMPONENTE.length > FONTE_CRUA.length / 3, 'recorte suspeito de ter comido código');
  assert.ok(!COMPONENTE.includes('Esconder bot'), 'a prosa do comentário tem de ter saído do recorte');
});

test('a tela recomeça o estado ao trocar de evento', () => {
  assert.match(
    COMPONENTE,
    /<ScopedOperatorJourney key=\{eventId\}/u,
    'sem key por evento, trocar de evento mostraria as permissões do anterior por um instante',
  );
});

test('a tela decide pela mesma montagem testada acima, e não por regra própria', () => {
  assert.match(COMPONENTE, /jornadaDoOperador\(resposta, ROTULOS\)/u);
  assert.doesNotMatch(COMPONENTE, /includes\('reverter'\)/u, 'sensível vem do servidor, nunca do nome');
  assert.doesNotMatch(COMPONENTE, /includes\('reimprimir'\)/u);
});

test('em erro, a lista anterior é apagada em vez de ficar velha na tela', () => {
  // Manter na tela uma permissão que o servidor pode ter revogado é
  // exatamente a mentira que esta tela existe para não contar.
  assert.match(COMPONENTE, /setJornada\(null\)/u);
});

test('a tela reconfere ao retomar o foco: revogação não avisa esta aba', () => {
  assert.match(COMPONENTE, /addEventListener\('focus'/u);
  assert.match(COMPONENTE, /addEventListener\('visibilitychange'/u);
  assert.match(COMPONENTE, /removeEventListener\('focus'/u, 'ouvinte sem remoção vaza entre eventos');
  assert.match(COMPONENTE, /removeEventListener\('visibilitychange'/u);
});

test('a tela diz, em texto, que não é ela que autoriza', () => {
  assert.match(
    COMPONENTE,
    /quem autoriza cada operação é o servidor/u,
    'esconder botão não é controle de acesso, e a tela tem de admitir isso a quem usa',
  );
});

test('o link do posto sai do módulo testado, sem rota escrita à mão', () => {
  assert.match(COMPONENTE, /rotaDoPosto\(eventId\)/u);
  assert.doesNotMatch(COMPONENTE, /href="\/eventos/u, 'rota escrita à mão escapa do teste e pode não existir');
});

test('o posto só é oferecido quando há ação liberada', () => {
  assert.match(COMPONENTE, /jornada\.podeAbrirPosto && /u, 'oferecer sem permissão é mandar a pessoa tomar 403');
});

test('estado liberado e não liberado têm TEXTO, não só cor', () => {
  assert.match(COMPONENTE, />liberada</u);
  assert.match(COMPONENTE, />não liberada</u);
});

test('avisos e erros usam os papéis de acessibilidade certos', () => {
  assert.match(COMPONENTE, /role="alert"/u);
  assert.match(COMPONENTE, /role="status"/u);
});

test('a tela não chama rota que não existe', () => {
  const chamadas = [...COMPONENTE.matchAll(/api<[^>]*>\(\s*`([^`]+)`/gu)].map((m) => m[1]);
  assert.deepEqual(
    chamadas,
    ['/events/${encodeURIComponent(eventId)}/operators/me/capabilities'],
    'só a rota de autoatendimento, e com o id escapado',
  );
});
