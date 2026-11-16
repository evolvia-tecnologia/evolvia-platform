// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// O catálogo pesquisável por HTTP, contra PostgreSQL real (#665).
//
// O que este arquivo prova e o teste puro não podia provar: que **as duas
// rotas não divergem sobre o mesmo banco**. O teste puro compara
// `montarCatalogo` com `montarVisaoGeral` passando a mesma lista em memória
// para as duas — ele garante que as duas funções concordam, e não que as duas
// CONSULTAS concordam. Entre a função e a consulta existe `whereDoRecorte`,
// que é SQL, e é onde um recorte pode cair fora sem que nenhum teste puro note.
//
// Por isso o caso central aqui compara `eventIds` da visão geral com os `id`
// do catálogo, para o mesmo recorte, igualdade de CONJUNTO. É a forma mais
// próxima que eu tenho de "o número É a lista" sendo verdade no banco e não só
// no módulo.
//
// Os recortes são presos a `organizationIds: [org.id]` de propósito. O catálogo
// é global, então o banco de CI tem eventos de outros arquivos de teste dentro
// dele; afirmar total absoluto seria afirmar sobre dados que não são meus e a
// suíte ficaria dependente da ordem de execução. Preso à organização da
// fixture, o total é determinístico.
//
// **Limite conhecido desta implementação, declarado e não escondido:**
// `eventosParaCatalogo` faz `findMany` sem `take` e ordena/pagina em memória.
// Para a Área Master com alguns milhares de eventos funciona; não escala para
// centenas de milhares. Foi decisão consciente para manter UMA regra de
// ordenação e filtro fino compartilhada com a visão geral — mover a ordenação
// para SQL hoje criaria a segunda regra, que é como um painel diz 12 e a lista
// mostra 11. Quando o volume exigir, o caminho é mover as duas juntas, não só
// esta. Registro aqui porque um `findMany` sem teto é o tipo de coisa que
// ninguém encontra depois.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import {
  chamarELer, crachar, derrubarApp, evento, identidade, motivoValido,
  organizacao, pessoa, sessao, subirApp,
} from './master-fixtures.mjs';

before(async () => { await subirApp(); });
after(async () => { await derrubarApp(); });

/** Proprietário da plataforma: alcance global sem precisar de concessão. */
async function proprietarioGlobal(rotulo) {
  const quem = await pessoa(`cat-${rotulo}`);
  const ident = await identidade(quem.id, 'OWNER');
  return { quem, jwt: crachar(quem.id, quem.email), master: await sessao(ident.id) };
}

const catalogo = (jwt, master, corpo) => chamarELer('/platform/master/catalog', jwt, {
  method: 'POST', master, body: JSON.stringify(corpo),
});

const visaoGeral = (jwt, master, corpo) => chamarELer('/platform/master/overview', jwt, {
  method: 'POST', master, body: JSON.stringify(corpo),
});

test('o catálogo e a visão geral não divergem sobre o mesmo banco', { timeout: 120000 }, async () => {
  // O caso que importa mais. Dois caminhos diferentes até o banco — a visão
  // geral agrega, o catálogo lista — e eles têm de devolver EXATAMENTE os
  // mesmos eventos para o mesmo recorte. Se `whereDoRecorte` deixar de casar
  // com `selecionarEventos`, é aqui que aparece.
  const { quem, jwt, master } = await proprietarioGlobal('nao-divergem');
  const org = await organizacao('cat-nao-divergem', quem.id);

  await evento('nd-pub-1', quem.id, org.id, { status: 'PUBLISHED', format: 'ONLINE' });
  await evento('nd-pub-2', quem.id, org.id, { status: 'PUBLISHED', format: 'IN_PERSON' });
  await evento('nd-rascunho', quem.id, org.id, { status: 'DRAFT' });
  await evento('nd-config', quem.id, org.id, { status: 'SETUP', format: 'HYBRID' });

  // Vários recortes, não um: um recorte só passaria numa implementação que
  // ignora o filtro dos dois lados igualmente.
  const recortes = [
    { organizationIds: [org.id] },
    { organizationIds: [org.id], situacoes: ['PUBLISHED'] },
    { organizationIds: [org.id], situacoes: ['DRAFT'] },
    { organizationIds: [org.id], formatos: ['ONLINE'] },
    { organizationIds: [org.id], formatos: ['IN_PERSON', 'HYBRID'] },
    { organizationIds: [org.id], situacoes: ['PUBLISHED'], formatos: ['ONLINE'] },
  ];

  for (const recorte of recortes) {
    const painel = await visaoGeral(jwt, master, recorte);
    assert.equal(painel.status, 201, `visão geral falhou em ${JSON.stringify(recorte)}: ${painel.texto}`);

    const lista = await catalogo(jwt, master, { ...recorte, limite: 100 });
    assert.equal(lista.status, 201, `catálogo falhou em ${JSON.stringify(recorte)}: ${lista.texto}`);

    // A visão geral não devolve um total "do recorte" direto: ela devolve
    // baldes. A união dos ids dos baldes de SITUAÇÃO é o conjunto do recorte,
    // porque todo evento tem exatamente uma situação — ao contrário de área,
    // onde um evento aparece em várias e a união seria maior que o conjunto.
    const doPainel = new Set(painel.corpo.porSituacao.flatMap((b) => b.eventIds));
    const doCatalogo = new Set(lista.corpo.itens.map((i) => i.id));

    assert.equal(
      doCatalogo.size, lista.corpo.total,
      'a página devolvida tem de ser o total quando o total cabe numa página',
    );
    assert.deepEqual(
      [...doCatalogo].sort(), [...doPainel].sort(),
      `painel e lista divergiram em ${JSON.stringify(recorte)}: `
      + `painel ${doPainel.size}, lista ${doCatalogo.size}`,
    );
  }
});

test('o catálogo devolve nome, não id', { timeout: 120000 }, async () => {
  // O motivo pelo qual a rota existe. A tela antiga mostrava `cm9x8...` para
  // uma pessoa, porque era o que a visão geral tinha a oferecer.
  const { quem, jwt, master } = await proprietarioGlobal('nomes');
  const org = await organizacao('cat-nomes', quem.id);
  const ev = await evento('nomes-1', quem.id, org.id, {
    name: 'Simpósio de Cardiologia Intervencionista', eventType: 'Simpósio',
    status: 'PUBLISHED', subjectAreas: ['Saúde', 'Cardiologia'],
  });

  const lista = await catalogo(jwt, master, { organizationIds: [org.id] });
  assert.equal(lista.status, 201, lista.texto);
  assert.equal(lista.corpo.itens.length, 1);

  const item = lista.corpo.itens[0];
  assert.equal(item.id, ev.id);
  assert.equal(item.nome, 'Simpósio de Cardiologia Intervencionista');
  assert.equal(item.tipo, 'Simpósio');
  assert.equal(item.situacao, 'PUBLISHED');
  assert.deepEqual(item.areas, ['Saúde', 'Cardiologia']);
  // O nome da organização vem por relação, e é o campo mais fácil de perder num
  // `select` aninhado errado: sem ele a lista mostra evento sem dono.
  assert.equal(item.organizacao, org.name, 'o nome da organização veio pela relação');
  assert.equal(item.removido, false);
});

test('a busca encontra por nome, por tipo e por organização, sem acento e sem caixa', { timeout: 120000 }, async () => {
  const { quem, jwt, master } = await proprietarioGlobal('busca');
  const org = await organizacao('cat-busca', quem.id);
  const alvo = await evento('busca-alvo', quem.id, org.id, {
    name: 'Encontro de Física Atômica', eventType: 'Encontro',
  });
  await evento('busca-outro', quem.id, org.id, { name: 'Jornada de Direito Tributário', eventType: 'Jornada' });

  const soDoRecorte = { organizationIds: [org.id] };

  // Sem acento e em caixa baixa: quem digita não acentua.
  const semAcento = await catalogo(jwt, master, { ...soDoRecorte, termo: 'fisica atomica' });
  assert.equal(semAcento.status, 201, semAcento.texto);
  assert.deepEqual(semAcento.corpo.itens.map((i) => i.id), [alvo.id], 'busca sem acento tem de achar');

  // Caixa alta, com acento: o mesmo resultado.
  const comAcento = await catalogo(jwt, master, { ...soDoRecorte, termo: 'FÍSICA' });
  assert.deepEqual(comAcento.corpo.itens.map((i) => i.id), [alvo.id]);

  // No meio da palavra, não só no começo: `startsWith` é um dos mutantes.
  const noMeio = await catalogo(jwt, master, { ...soDoRecorte, termo: 'tomica' });
  assert.deepEqual(noMeio.corpo.itens.map((i) => i.id), [alvo.id]);

  // Por tipo, que não é o nome.
  const porTipo = await catalogo(jwt, master, { ...soDoRecorte, termo: 'jornada' });
  assert.equal(porTipo.corpo.total, 1, 'buscar por tipo tem de funcionar');

  // Nada encontrado é total 0 e lista vazia, não erro.
  const nada = await catalogo(jwt, master, { ...soDoRecorte, termo: 'zzzznaoexistezzzz' });
  assert.equal(nada.status, 201);
  assert.equal(nada.corpo.total, 0);
  assert.deepEqual(nada.corpo.itens, []);
  assert.equal(nada.corpo.paginas, 0, 'zero resultado é zero página, não uma página vazia');
});

test('a página não perde nem repete evento, e o total é do recorte inteiro', { timeout: 120000 }, async () => {
  // O defeito clássico de paginação é o total ser contado DEPOIS do corte: a
  // tela passa a dizer "12 de 12" em cada página. E o outro é o offset fora por
  // um, que some com um evento.
  const { quem, jwt, master } = await proprietarioGlobal('paginas');
  const org = await organizacao('cat-paginas', quem.id);

  const criados = [];
  for (let i = 0; i < 5; i += 1) {
    criados.push(await evento(`pag-${i}`, quem.id, org.id, { name: `Evento paginado ${i}` }));
  }
  const esperados = new Set(criados.map((e) => e.id));

  const vistos = new Set();
  let totalRelatado = null;
  for (let pagina = 1; pagina <= 5; pagina += 1) {
    const r = await catalogo(jwt, master, { organizationIds: [org.id], limite: 1, pagina, ordem: 'nome' });
    assert.equal(r.status, 201, r.texto);
    assert.equal(r.corpo.itens.length, 1, `página ${pagina} tem de ter exatamente um item`);
    assert.equal(r.corpo.paginas, 5, `cinco eventos com limite 1 são cinco páginas, e não ${r.corpo.paginas}`);
    assert.equal(r.corpo.pagina, pagina);

    if (totalRelatado === null) totalRelatado = r.corpo.total;
    assert.equal(r.corpo.total, 5, 'o total é do recorte inteiro, não da página');
    assert.equal(r.corpo.total, totalRelatado, 'o total não pode mudar de página para página');

    const id = r.corpo.itens[0].id;
    assert.ok(!vistos.has(id), `o evento ${id} apareceu em duas páginas`);
    vistos.add(id);
  }

  assert.deepEqual(
    [...vistos].sort(), [...esperados].sort(),
    'percorrer todas as páginas tem de devolver todos os eventos, uma vez cada',
  );

  // Página além do fim é vazia, com o total certo — não erro, e não a última.
  const alem = await catalogo(jwt, master, { organizationIds: [org.id], limite: 1, pagina: 9 });
  assert.equal(alem.status, 201, alem.texto);
  assert.deepEqual(alem.corpo.itens, [], 'página além do fim é vazia');
  assert.equal(alem.corpo.total, 5, 'e o total continua sendo do recorte');
});

test('ordenar por nome usa colação pt-BR, e não ordem de bytes', { timeout: 120000 }, async () => {
  // 'Á' vem depois de 'Z' em ordem de código, e antes em pt-BR. Com `<` em vez
  // de `localeCompare`, 'Ávila' cai no fim da lista — o que para quem procura
  // um nome acentuado parece que o evento não existe.
  const { quem, jwt, master } = await proprietarioGlobal('ordem');
  const org = await organizacao('cat-ordem', quem.id);
  await evento('ord-b', quem.id, org.id, { name: 'Zzz Congresso Final' });
  await evento('ord-a', quem.id, org.id, { name: 'Ávila Congresso' });
  await evento('ord-c', quem.id, org.id, { name: 'Azul Congresso' });

  const r = await catalogo(jwt, master, { organizationIds: [org.id], ordem: 'nome' });
  assert.equal(r.status, 201, r.texto);
  assert.deepEqual(
    r.corpo.itens.map((i) => i.nome),
    ['Ávila Congresso', 'Azul Congresso', 'Zzz Congresso Final'],
    'ordem alfabética de gente, não de tabela de caracteres',
  );
});

test('eventos sem data de início vão para o fim quando se ordena por início', { timeout: 120000 }, async () => {
  // Nulo não é zero. Ordenar por início com nulo tratado como 0 joga todo
  // evento sem data para o topo, que é o oposto do que quem ordenou quer ver.
  const { quem, jwt, master } = await proprietarioGlobal('inicio');
  const org = await organizacao('cat-inicio', quem.id);
  await evento('ini-sem', quem.id, org.id, { name: 'Sem data' });
  await evento('ini-tarde', quem.id, org.id, { name: 'Mais tarde', startDate: new Date('2027-06-01T12:00:00Z') });
  await evento('ini-cedo', quem.id, org.id, { name: 'Mais cedo', startDate: new Date('2027-01-10T12:00:00Z') });

  const r = await catalogo(jwt, master, { organizationIds: [org.id], ordem: 'inicio' });
  assert.equal(r.status, 201, r.texto);
  assert.deepEqual(r.corpo.itens.map((i) => i.nome), ['Mais cedo', 'Mais tarde', 'Sem data']);
  assert.equal(r.corpo.itens[2].inicio, null, 'sem data continua sem data, e não vira texto vazio');
});

test('o limite do DTO e o limite do módulo são o mesmo número', { timeout: 120000 }, async () => {
  // Duas validações sobre o mesmo campo é como uma mensagem de erro passa a
  // mentir: o DTO recusa com uma mensagem genérica aquilo que o módulo
  // aceitaria, ou o contrário. Este caso prende os dois na mesma fronteira.
  const { quem, jwt, master } = await proprietarioGlobal('limites');
  const org = await organizacao('cat-limites', quem.id);
  await evento('lim-1', quem.id, org.id);

  const noTeto = await catalogo(jwt, master, { organizationIds: [org.id], limite: 100 });
  assert.equal(noTeto.status, 201, `limite 100 é o teto e tem de passar: ${noTeto.texto}`);

  const acimaDoTeto = await catalogo(jwt, master, { organizationIds: [org.id], limite: 101 });
  assert.equal(acimaDoTeto.status, 400, 'limite 101 tem de ser recusado');

  const zero = await catalogo(jwt, master, { organizationIds: [org.id], limite: 0 });
  assert.equal(zero.status, 400, 'limite 0 não é um pedido válido');

  const paginaZero = await catalogo(jwt, master, { organizationIds: [org.id], pagina: 0 });
  assert.equal(paginaZero.status, 400, 'página começa em 1');

  // Termo de uma letra: recusado com a lista de problemas, não aceito e
  // devolvendo meia plataforma.
  //
  // A asserção aqui estava ERRADA e passava por sorte reversa: ela afirmava
  // `corpo.erros`, uma chave que nunca existiu na resposta. O corpo da API é
  // aninhado em `error`, e o filtro global monta `{ code, message, status,
  // traceId, fields, context }`. Eu tinha escrito o teste contra um contrato
  // imaginado em vez de contra o contrato do projeto.
  const curto = await catalogo(jwt, master, { organizationIds: [org.id], termo: 'a' });
  assert.equal(curto.status, 400, 'termo de uma letra tem de ser recusado');
  assert.equal(curto.corpo?.error?.code, 'VALIDATION_ERROR', `código do contrato: ${curto.texto}`);
  assert.ok(
    Array.isArray(curto.corpo.error.fields) && curto.corpo.error.fields.length > 0,
    `a recusa tem de listar os problemas, e não devolver fields vazio: ${curto.texto}`,
  );
  assert.ok(
    curto.corpo.error.fields.some((campo) => /pelo menos/u.test(String(campo?.message ?? ''))),
    `o problema específico tem de chegar à pessoa: ${curto.texto}`,
  );

  const ordemInvalida = await catalogo(jwt, master, { organizationIds: [org.id], ordem: 'aleatoria' });
  assert.equal(ordemInvalida.status, 400, 'ordem desconhecida é recusada, não ignorada em silêncio');

  // Campo estranho no corpo: o `forbidNonWhitelisted` recusa. Vale o caso
  // porque é o que impede um recorte novo de entrar sem passar por validação.
  const campoEstranho = await catalogo(jwt, master, { organizationIds: [org.id], removido: true });
  assert.equal(campoEstranho.status, 400, 'campo não declarado no DTO é recusado');
});

test('concessão de UM evento não abre a lista de todos', { timeout: 120000 }, async () => {
  // Vazamento pela listagem. Quem cuida de um evento vê aquele evento; a lista
  // da plataforma inteira diria quantos eventos existem, de quem, e com que
  // nome. É o mesmo motivo pelo qual a visão geral exige alcance global — e
  // tem de ser testado separado, porque é outra rota e outra decisão.
  const dono = await proprietarioGlobal('escopo-owner');
  const org = await organizacao('cat-escopo', dono.quem.id);
  const ev = await evento('escopo-1', dono.quem.id, org.id);
  await evento('escopo-2', dono.quem.id, org.id);

  const delegado = await pessoa('cat-escopo-delegado');
  const identDel = await identidade(delegado.id, 'DELEGADO');
  const masterDel = await sessao(identDel.id);
  const jwtDel = crachar(delegado.id, delegado.email);

  const concedida = await chamarELer('/platform/master/grants', dono.jwt, {
    method: 'POST', master: dono.master,
    body: JSON.stringify({
      pessoas: [delegado.id], acoes: ['consultar'],
      escopo: { tipo: 'EVENTOS', eventIds: [ev.id] }, motivo: motivoValido,
    }),
  });
  assert.ok(concedida.ok, `concessão falhou: ${concedida.status} ${concedida.texto}`);

  // No evento concedido ele passa: sem isto, o 403 abaixo passaria numa
  // implementação que recusa tudo.
  const noEvento = await chamarELer(`/platform/master/events/${ev.id}/summary`, jwtDel, { master: masterDel });
  assert.equal(noEvento.status, 200, `no evento concedido ele tem de passar: ${noEvento.texto}`);

  const lista = await catalogo(jwtDel, masterDel, {});
  assert.equal(lista.status, 403, 'a lista da plataforma exige alcance global');
  assert.ok(!lista.texto.includes(ev.id), 'e a recusa não devolve conteúdo nenhum');

  // Nem recortando a lista para o evento que ele PODE ver. O alcance vem da
  // rota, e esta rota não tem `eventId` — aceitar o recorte como se fosse
  // escopo faria a autorização ser conferida para a plataforma e aplicada a um
  // evento, que é exatamente a confusão que separar as rotas evita.
  const recortada = await catalogo(jwtDel, masterDel, { organizationIds: [org.id] });
  assert.equal(recortada.status, 403, 'recorte no corpo não substitui alcance');
});

test('concessão de organização também não abre a lista da plataforma', { timeout: 120000 }, async () => {
  const dono = await proprietarioGlobal('escopo-org-owner');
  const org = await organizacao('cat-escopo-org', dono.quem.id);
  await evento('escopo-org-1', dono.quem.id, org.id);

  const delegado = await pessoa('cat-escopo-org-delegado');
  const identDel = await identidade(delegado.id, 'DELEGADO');
  const masterDel = await sessao(identDel.id);
  const jwtDel = crachar(delegado.id, delegado.email);

  const concedida = await chamarELer('/platform/master/grants', dono.jwt, {
    method: 'POST', master: dono.master,
    body: JSON.stringify({
      pessoas: [delegado.id], acoes: ['consultar'],
      escopo: { tipo: 'ORGANIZACAO', organizationId: org.id }, motivo: motivoValido,
    }),
  });
  assert.ok(concedida.ok, `concessão falhou: ${concedida.status} ${concedida.texto}`);

  const lista = await catalogo(jwtDel, masterDel, { organizationIds: [org.id] });
  assert.equal(lista.status, 403, 'cuidar de uma organização não é alcance de plataforma');
});

test('sem identidade Master a rota não existe: 404, e não 403', { timeout: 120000 }, async () => {
  // 403 contaria que existe uma área administrativa e que a pessoa só não tem
  // permissão. 404 não conta nada.
  const estranho = await pessoa('cat-estranho');
  const r = await catalogo(crachar(estranho.id, estranho.email), 'token-qualquer', {});
  assert.equal(r.status, 404, `para quem não é da Área Master ela não existe: deu ${r.status}`);
});

test('mostrarRemovidos é aceito hoje e ainda não muda nada — tripwire da moderação', { timeout: 120000 }, async () => {
  // **Este caso existe para FALHAR no futuro, e isso é o ponto.**
  //
  // `PlatformEventModeration` ainda não existe: a tabela está aguardando o lock
  // de schema do Work. Até ela chegar, `eventosParaCatalogo` não tem de onde
  // ler exclusão lógica, então `removido` é sempre false e `mostrarRemovidos`
  // não tem efeito.
  //
  // Afirmar isso aqui é melhor que não testar: no dia em que a moderação entrar
  // sem que o catálogo seja ligado a ela, este teste continua passando e avisa
  // que faltou ligar. No dia em que for ligado corretamente, ele FALHA, e a
  // falha é o lembrete de reescrevê-lo com um evento removido de verdade.
  const { quem, jwt, master } = await proprietarioGlobal('removidos');
  const org = await organizacao('cat-removidos', quem.id);
  await evento('rem-1', quem.id, org.id);
  await evento('rem-2', quem.id, org.id);

  const semRemovidos = await catalogo(jwt, master, { organizationIds: [org.id] });
  assert.equal(semRemovidos.status, 201, semRemovidos.texto);

  const comRemovidos = await catalogo(jwt, master, { organizationIds: [org.id], mostrarRemovidos: true });
  assert.equal(comRemovidos.status, 201, `mostrarRemovidos tem de ser aceito: ${comRemovidos.texto}`);

  assert.equal(
    comRemovidos.corpo.total, semRemovidos.corpo.total,
    'sem a tabela de moderação os dois pedidos veem o mesmo conjunto — '
    + 'se este assert falhar, a moderação entrou e ESTE TESTE precisa ser reescrito '
    + 'com um evento removido de verdade, não "consertado" para voltar a passar',
  );
  assert.ok(
    semRemovidos.corpo.itens.every((i) => i.removido === false),
    'nenhum evento está removido enquanto não existe tabela de moderação',
  );
});

test('o 400 da Área Master tem a mesma forma do 400 do resto da plataforma', { timeout: 120000 }, async () => {
  // Regressão do defeito que o Work encontrou. O serviço lançava
  // `BadRequestException({ erros })`, e o `GlobalExceptionFilter` procura
  // `fields` (array) ou `message` (array) — não achava nenhum dos dois e
  // respondia `fields: []` com "Não foi possível concluir a operação.". A lista
  // de problemas que os módulos puros acumulam era descartada na última camada.
  //
  // Este caso compara as DUAS origens de 400 na mesma rota: a validação de DTO,
  // que já saía no contrato certo, e a validação de domínio, que não saía. Se
  // alguém voltar a lançar uma forma própria, as duas deixam de casar aqui.
  const { quem, jwt, master } = await proprietarioGlobal('contrato-400');
  const org = await organizacao('cat-contrato', quem.id);
  await evento('contrato-1', quem.id, org.id);

  // DTO: `limite` acima do @Max(100) é recusado pelo ValidationPipe.
  const porDto = await catalogo(jwt, master, { organizationIds: [org.id], limite: 999 });
  // Domínio: `ordem` desconhecida passa o DTO (é string curta) e é recusada
  // pelo módulo puro.
  const porDominio = await catalogo(jwt, master, { organizationIds: [org.id], ordem: 'aleatoria' });

  for (const [rotulo, resposta] of [['DTO', porDto], ['domínio', porDominio]]) {
    assert.equal(resposta.status, 400, `${rotulo}: ${resposta.texto}`);
    const erro = resposta.corpo?.error;
    assert.ok(erro, `${rotulo}: o corpo tem de vir aninhado em error — ${resposta.texto}`);
    assert.equal(erro.code, 'VALIDATION_ERROR', rotulo);
    assert.equal(erro.status, 400, rotulo);
    assert.equal(typeof erro.message, 'string', rotulo);
    assert.ok(erro.message.length > 0, `${rotulo}: mensagem vazia não explica nada`);
    assert.notEqual(
      erro.message, 'Não foi possível concluir a operação.',
      `${rotulo}: esta é a frase do ramo final do filtro, e significa que o corpo `
      + 'não trouxe nem message nem fields — era o defeito',
    );
    assert.ok(Array.isArray(erro.fields), `${rotulo}: fields tem de ser lista`);
    assert.ok(erro.fields.length > 0, `${rotulo}: fields vazio era o sintoma — ${resposta.texto}`);
    for (const campo of erro.fields) {
      assert.equal(typeof campo.field, 'string', `${rotulo}: field é string`);
      assert.equal(typeof campo.message, 'string', `${rotulo}: message é string`);
      assert.ok(campo.message.length > 0, `${rotulo}: problema sem texto`);
    }
    assert.equal(typeof erro.traceId, 'string', `${rotulo}: traceId para suporte`);
  }
});
