import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_MAXIMO, LIMITE_PADRAO, MAX_TERMO, MIN_TERMO, ORDENS,
  montarCatalogo, normalizar, validarPedidoDoCatalogo,
} from '../src/platform-catalog-request.ts';
import { montarVisaoGeral } from '../src/platform-overview-policy.ts';

const T0 = Date.parse('2026-11-15T12:00:00.000Z');
const dia = 86400_000;

let contador = 0;
function evento(over = {}) {
  contador += 1;
  return {
    id: `evt-${String(contador).padStart(4, '0')}`,
    name: `Evento ${contador}`,
    slug: `evento-${contador}`,
    eventType: 'Congresso',
    organizationId: 'org-aaaaaaaa',
    organizationName: 'Organização A',
    profileCode: 'SCIENTIFIC_EVENT',
    format: 'IN_PERSON',
    status: 'PUBLISHED',
    subjectAreas: ['saude'],
    createdAt: new Date(T0 - dia),
    updatedAt: new Date(T0),
    startDate: new Date(T0 + dia),
    endDate: new Date(T0 + 2 * dia),
    removido: false,
    ...over,
  };
}

const pedir = (corpo = {}) => {
  const lido = validarPedidoDoCatalogo(corpo);
  assert.equal(lido.ok, true, JSON.stringify(lido.erros));
  return lido.pedido;
};

// ------------------------------------------------------------- a composição

test('o total do catálogo é IGUAL ao total da visão geral, no mesmo recorte', () => {
  // Este é o teste mais importante do arquivo. As duas telas recortam pelas
  // mesmas dimensões, e se usassem implementações diferentes o painel diria 12
  // e a lista mostraria 11 — divergência que ninguém nota até conferir à mão.
  // Aqui as duas respostas são comparadas diretamente.
  const eventos = [
    evento({ status: 'PUBLISHED', format: 'IN_PERSON', subjectAreas: ['saude'] }),
    evento({ status: 'DRAFT', format: 'ONLINE', subjectAreas: ['educacao'] }),
    evento({ status: 'PUBLISHED', format: 'ONLINE', subjectAreas: ['saude', 'educacao'] }),
    evento({ status: 'FINISHED', format: 'HYBRID', subjectAreas: [] }),
    evento({ status: 'PUBLISHED', format: 'IN_PERSON', organizationId: 'org-zzzzzzzz' }),
  ];

  const recortes = [
    {},
    { situacoes: ['PUBLISHED'] },
    { formatos: ['ONLINE'] },
    { areas: ['saude'] },
    { areas: ['saude', 'educacao'] },
    { organizationIds: ['org-aaaaaaaa'] },
    { situacoes: ['PUBLISHED'], formatos: ['IN_PERSON'] },
    { profileCodes: ['SCIENTIFIC_EVENT'] },
    { de: new Date(T0 - 2 * dia).toISOString() },
    { ate: new Date(T0 - 2 * dia).toISOString() },
  ];

  for (const recorte of recortes) {
    const painel = montarVisaoGeral(eventos, pedir(recorte).filtro, { agora: T0 });
    const lista = montarCatalogo(eventos, pedir({ ...recorte, limite: LIMITE_MAXIMO }));
    assert.equal(
      lista.total, painel.totais.criados,
      `recorte ${JSON.stringify(recorte)}: painel disse ${painel.totais.criados} e lista disse ${lista.total}`,
    );
    assert.deepEqual(
      [...lista.itens.map((i) => i.id)].sort(),
      [...painel.composicao.criados].sort(),
      `recorte ${JSON.stringify(recorte)}: os MESMOS eventos, não só a mesma quantidade`,
    );
  }
});

test('erro do filtro compartilhado chega ao pedido do catálogo', () => {
  // O catálogo não revalida as dimensões compartilhadas; ele compõe. Então as
  // mensagens de lá têm de aparecer aqui, senão a tela recebe 400 sem motivo.
  const lido = validarPedidoDoCatalogo({ formatos: ['PRESENCIAL'] });
  assert.equal(lido.ok, false);
  assert.ok(lido.erros.some((e) => /formatos/i.test(e)), lido.erros.join(' | '));
});

test('problemas do compartilhado e do catálogo vêm juntos', () => {
  const lido = validarPedidoDoCatalogo({ formatos: ['PRESENCIAL'], ordem: 'alfabetica', limite: 0, termo: 'x' });
  assert.equal(lido.ok, false);
  assert.ok(lido.erros.length >= 4, lido.erros.join(' | '));
});

// ------------------------------------------------------------------- busca

test('a busca ignora acento nos dois sentidos', () => {
  // Quem digita "saude" espera achar "Saúde", e quem digita "Saúde" espera
  // achar "saude". Busca com acento é busca que não acha.
  const comAcento = evento({ name: 'Congresso de Saúde Pública' });
  const semAcento = evento({ name: 'Forum de Saude Coletiva' });
  const eventos = [comAcento, semAcento];

  for (const termo of ['saude', 'Saúde', 'SAUDE', 'saúde']) {
    const r = montarCatalogo(eventos, pedir({ termo }));
    assert.equal(r.total, 2, `termo ${termo}`);
  }
});

test('normalizar derruba acento, caixa e espaço nas pontas', () => {
  // Valores esperados escritos à mão, não calculados. Na primeira versão eu
  // montei o esperado com uma expressão e ela estava errada — o teste acusou o
  // código, que estava certo. Esperado calculado é esperado que pode errar
  // junto com o código, ou errar sozinho e custar tempo.
  assert.equal(normalizar('  Saúde Pública  '), 'saude publica');
  assert.equal(normalizar('ÇÃÕÉÊÍÓÚÀ'), 'caoeeioua');
  assert.equal(normalizar('Ação'), 'acao');
  assert.equal(normalizar('Ñoño'), 'nono');
  assert.equal(normalizar('CRESCIMENTO'), 'crescimento');
});

test('a busca olha nome, slug, tipo e organização — e nada invisível', () => {
  const porNome = evento({ name: 'Simpósio Alfa', slug: 'x1', eventType: 'Congresso', organizationName: 'Org A' });
  const porSlug = evento({ name: 'Outro', slug: 'simposio-beta', eventType: 'Congresso', organizationName: 'Org A' });
  const porTipo = evento({ name: 'Outro', slug: 'x3', eventType: 'Simpósio Técnico', organizationName: 'Org A' });
  const porOrg = evento({ name: 'Outro', slug: 'x4', eventType: 'Congresso', organizationName: 'Instituto Simpósio' });
  const invisivel = evento({ name: 'Outro', slug: 'x5', eventType: 'Congresso', organizationName: 'Org A', profileCode: 'SIMPOSIO_INVENTADO' });

  const r = montarCatalogo([porNome, porSlug, porTipo, porOrg, invisivel], pedir({ termo: 'simposio' }));
  assert.deepEqual(
    [...r.itens.map((i) => i.id)].sort(),
    [porNome.id, porSlug.id, porTipo.id, porOrg.id].sort(),
  );
  assert.ok(
    !r.itens.some((i) => i.id === invisivel.id),
    'casar em campo que a linha não mostra produz resultado que não se explica',
  );
});

test('busca curta demais é recusada, não executada', () => {
  // Um caractere casa com quase tudo: é varredura com aparência de busca.
  for (const termo of ['a', ' a ', 'é']) {
    const lido = validarPedidoDoCatalogo({ termo });
    assert.equal(lido.ok, false, termo);
    assert.ok(lido.erros.some((e) => e.includes(String(MIN_TERMO))), lido.erros.join(' | '));
  }
  assert.equal(validarPedidoDoCatalogo({ termo: 'ab' }).ok, true);
});

test('busca longa demais é recusada, e o limite exato passa', () => {
  assert.equal(validarPedidoDoCatalogo({ termo: 'a'.repeat(MAX_TERMO) }).ok, true);
  assert.equal(validarPedidoDoCatalogo({ termo: 'a'.repeat(MAX_TERMO + 1) }).ok, false);
});

test('busca vazia ou ausente não filtra nada', () => {
  const eventos = [evento(), evento()];
  for (const corpo of [{}, { termo: '' }, { termo: null }]) {
    const r = montarCatalogo(eventos, pedir(corpo));
    assert.equal(r.total, 2, JSON.stringify(corpo));
    assert.equal(r.termo, null);
  }
});

test('busca que não acha nada devolve lista vazia com total zero, não erro', () => {
  const r = montarCatalogo([evento()], pedir({ termo: 'inexistente' }));
  assert.equal(r.total, 0);
  assert.equal(r.paginas, 0);
  assert.deepEqual(r.itens, []);
});

// -------------------------------------------------------------------- ordem

test('o catálogo de ordens é fechado, e ordem inválida é recusada', () => {
  assert.deepEqual([...ORDENS], ['recentes', 'nome', 'inicio']);
  assert.equal(validarPedidoDoCatalogo({ ordem: 'alfabetica' }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ ordem: 'NOME' }).ok, false);
  for (const ordem of ORDENS) assert.equal(validarPedidoDoCatalogo({ ordem }).ok, true, ordem);
});

test('recentes é o padrão: mais novo primeiro', () => {
  const velho = evento({ name: 'Velho', createdAt: new Date(T0 - 10 * dia) });
  const novo = evento({ name: 'Novo', createdAt: new Date(T0 - dia) });
  const meio = evento({ name: 'Meio', createdAt: new Date(T0 - 5 * dia) });
  const r = montarCatalogo([velho, novo, meio], pedir({}));
  assert.equal(r.ordem, 'recentes');
  assert.deepEqual(r.itens.map((i) => i.nome), ['Novo', 'Meio', 'Velho']);
});

test('recentes desempata pelo nome, para a página não embaralhar', () => {
  // Sem desempate estável, dois eventos criados no mesmo instante trocam de
  // lugar entre páginas e a pessoa vê o mesmo item duas vezes, ou nenhuma.
  const mesmoInstante = new Date(T0 - dia);
  const bravo = evento({ name: 'Bravo', createdAt: mesmoInstante });
  const alfa = evento({ name: 'Alfa', createdAt: mesmoInstante });
  const charlie = evento({ name: 'Charlie', createdAt: mesmoInstante });

  const primeira = montarCatalogo([bravo, alfa, charlie], pedir({}));
  const outraOrdemDeEntrada = montarCatalogo([charlie, bravo, alfa], pedir({}));
  assert.deepEqual(primeira.itens.map((i) => i.nome), ['Alfa', 'Bravo', 'Charlie']);
  assert.deepEqual(
    outraOrdemDeEntrada.itens.map((i) => i.nome), primeira.itens.map((i) => i.nome),
    'a ordem do resultado não pode depender da ordem de entrada',
  );
});

test('por nome usa colação pt-BR, então acento não vai para o fim', () => {
  const eventos = [evento({ name: 'Zebra' }), evento({ name: 'Água' }), evento({ name: 'Brasil' })];
  const r = montarCatalogo(eventos, pedir({ ordem: 'nome' }));
  assert.deepEqual(r.itens.map((i) => i.nome), ['Água', 'Brasil', 'Zebra']);
});

test('por início: mais próximo primeiro, e SEM data vai para o fim', () => {
  // No começo, enterraria os próximos eventos atrás de rascunhos sem data — e
  // a ordem por início existe justamente para ver o que vem aí.
  const depois = evento({ name: 'Depois', startDate: new Date(T0 + 10 * dia) });
  const semData = evento({ name: 'Sem data', startDate: null });
  const logo = evento({ name: 'Logo', startDate: new Date(T0 + dia) });
  const r = montarCatalogo([depois, semData, logo], pedir({ ordem: 'inicio' }));
  assert.deepEqual(r.itens.map((i) => i.nome), ['Logo', 'Depois', 'Sem data']);
});

test('por início, dois sem data desempatam pelo nome', () => {
  const b = evento({ name: 'Beta', startDate: null });
  const a = evento({ name: 'Alfa', startDate: null });
  const r = montarCatalogo([b, a], pedir({ ordem: 'inicio' }));
  assert.deepEqual(r.itens.map((i) => i.nome), ['Alfa', 'Beta']);
});

// ---------------------------------------------------------------- paginação

test('o total é de quantos ATENDEM, não de quantos a página mostra', () => {
  // Um catálogo que mostra 25 e diz total 25 quando existem 300 faz quem lê
  // concluir que acabou.
  const eventos = Array.from({ length: 30 }, (_, i) => evento({ name: `E${String(i).padStart(2, '0')}` }));
  const r = montarCatalogo(eventos, pedir({ limite: 10, ordem: 'nome' }));
  assert.equal(r.itens.length, 10);
  assert.equal(r.total, 30);
  assert.equal(r.paginas, 3);
  assert.equal(r.pagina, 1);
});

test('as páginas não se sobrepõem nem perdem item', () => {
  const eventos = Array.from({ length: 25 }, (_, i) => evento({ name: `E${String(i).padStart(2, '0')}` }));
  const vistos = [];
  for (let pagina = 1; pagina <= 3; pagina += 1) {
    const r = montarCatalogo(eventos, pedir({ limite: 10, pagina, ordem: 'nome' }));
    vistos.push(...r.itens.map((i) => i.id));
  }
  assert.equal(new Set(vistos).size, 25, 'nenhum item repetido entre páginas');
  assert.equal(vistos.length, 25, 'e nenhum perdido');
});

test('página além do fim vem vazia, mas o total continua dizendo a verdade', () => {
  const eventos = Array.from({ length: 5 }, () => evento());
  const r = montarCatalogo(eventos, pedir({ limite: 10, pagina: 3 }));
  assert.deepEqual(r.itens, []);
  assert.equal(r.total, 5, 'total vazio aqui faria a tela dizer que não existe nada');
  assert.equal(r.paginas, 1);
});

test('limite e página são validados nas duas pontas', () => {
  assert.equal(pedir({}).limite, LIMITE_PADRAO);
  assert.equal(pedir({}).pagina, 1);
  assert.equal(validarPedidoDoCatalogo({ limite: 0 }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ limite: LIMITE_MAXIMO + 1 }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ limite: 10.5 }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ limite: '10' }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ pagina: 0 }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ pagina: -1 }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ limite: LIMITE_MAXIMO }).ok, true);
});

test('catálogo vazio não divide por zero nem inventa página', () => {
  const r = montarCatalogo([], pedir({}));
  assert.equal(r.total, 0);
  assert.equal(r.paginas, 0);
  assert.deepEqual(r.itens, []);
});

// --------------------------------------------------- removidos pela plataforma

test('evento removido não aparece por padrão', () => {
  const normal = evento({ name: 'Ativo' });
  const removido = evento({ name: 'Removido', removido: true });
  const r = montarCatalogo([normal, removido], pedir({}));
  assert.equal(r.total, 1);
  assert.equal(r.itens[0].nome, 'Ativo');
  assert.equal(r.mostrandoRemovidos, false);
});

test('mostrarRemovidos traz os removidos, e cada item diz se é', () => {
  // Tem de existir: não se restaura o que não se acha. Esconder sempre deixaria
  // a restauração sem caminho na interface.
  const normal = evento({ name: 'Ativo' });
  const removido = evento({ name: 'Removido', removido: true });
  const r = montarCatalogo([normal, removido], pedir({ mostrarRemovidos: true, ordem: 'nome' }));
  assert.equal(r.total, 2);
  assert.equal(r.mostrandoRemovidos, true);
  assert.deepEqual(r.itens.map((i) => [i.nome, i.removido]), [['Ativo', false], ['Removido', true]]);
});

test('mostrarRemovidos precisa ser booleano', () => {
  assert.equal(validarPedidoDoCatalogo({ mostrarRemovidos: 'sim' }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ mostrarRemovidos: 1 }).ok, false);
  assert.equal(validarPedidoDoCatalogo({ mostrarRemovidos: false }).ok, true);
});

test('campo removido ausente conta como não removido', () => {
  // Enquanto a tabela de moderação não existe, nenhum evento vem com o campo.
  // Ausente não pode esconder o evento.
  const semCampo = { ...evento(), removido: undefined };
  const r = montarCatalogo([semCampo], pedir({}));
  assert.equal(r.total, 1);
  assert.equal(r.itens[0].removido, false);
});

// ------------------------------------------------------------ forma do item

test('o item traz o que a linha mostra, com datas em ISO', () => {
  const r = montarCatalogo([evento({
    name: 'Congresso Alfa', slug: 'congresso-alfa', eventType: 'Congresso',
    organizationName: 'Instituto Beta', organizationId: 'org-aaaaaaaa',
    status: 'PUBLISHED', format: 'HYBRID', profileCode: 'SCIENTIFIC_EVENT',
    subjectAreas: ['saude', 'saude', 'educacao'],
  })], pedir({}));
  const item = r.itens[0];
  assert.equal(item.nome, 'Congresso Alfa');
  assert.equal(item.slug, 'congresso-alfa');
  assert.equal(item.tipo, 'Congresso');
  assert.equal(item.organizacao, 'Instituto Beta');
  assert.equal(item.organizationId, 'org-aaaaaaaa');
  assert.equal(item.situacao, 'PUBLISHED');
  assert.equal(item.formato, 'HYBRID');
  assert.equal(item.perfil, 'SCIENTIFIC_EVENT');
  assert.deepEqual(item.areas, ['saude', 'educacao'], 'área repetida aparece uma vez');
  assert.equal(item.criadoEm, new Date(T0 - dia).toISOString());
  assert.equal(item.inicio, new Date(T0 + dia).toISOString());
  assert.equal(item.fim, new Date(T0 + 2 * dia).toISOString());
});

test('evento sem organização e sem datas não vira texto vazio nem "null"', () => {
  const r = montarCatalogo([evento({
    organizationId: null, organizationName: null, profileCode: null,
    startDate: null, endDate: null,
  })], pedir({}));
  const item = r.itens[0];
  assert.equal(item.organizacao, null);
  assert.equal(item.organizationId, null);
  assert.equal(item.perfil, null);
  assert.equal(item.inicio, null);
  assert.equal(item.fim, null);
});

test('corpo que não é objeto é recusado de uma vez', () => {
  for (const ruim of ['texto', 42, [], [1]]) {
    const lido = validarPedidoDoCatalogo(ruim);
    assert.equal(lido.ok, false, String(ruim));
    assert.deepEqual(lido.erros, ['Pedido inválido.']);
  }
});

test('o pedido devolve o que foi pedido, para a tela não precisar lembrar', () => {
  const r = montarCatalogo([evento()], pedir({ termo: 'evento', ordem: 'nome', limite: 5, pagina: 1 }));
  assert.equal(r.termo, 'evento');
  assert.equal(r.ordem, 'nome');
  assert.equal(r.limite, 5);
  assert.equal(r.pagina, 1);
});
