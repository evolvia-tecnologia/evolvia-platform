// Somente PostgreSQL descartável com migrations aplicadas (DATABASE_URL). Dados
// de fixture são únicos e preservados, nunca apagados.
//
// CL20 — o teto da cota de crachá do expositor é lido DENTRO da transação.
//
// A LACUNA, medida e não suposta
//
// `ExhibitorCompanyService.addCredential` já roda em `Serializable` e já trata
// P2034, o que me fez descartar a hipótese inicial de que faltava controle de
// concorrência: não falta. O que falta é mais estreito.
//
// Dentro da transação, o USADO é contado com `tx`:
//
//     const used = await tx.eventExhibitorCredential.count({ ... });
//
// mas o TETO vinha de `loaded.company`, lido em `bound()` com `this.prisma`,
// ANTES de a transação começar:
//
//     if (used >= quotaFor(draft.kind, loaded.company)) ...
//
// Serializable não ajuda aqui, e é importante entender por quê: a empresa
// nunca era lida dentro da transação, então não existia dependência
// leitura-escrita para o SSI detectar. Duas credenciais concorrentes, sim,
// conflitam — isso já funcionava. Mas organizador baixando a cota enquanto o
// expositor cadastra, não: a decisão usava um teto que já não valia.
//
// Cenário concreto: cota 2, uma credencial usada. O organizador baixa a cota
// para 1. Um pedido que leu a empresa antes disso compara 1 >= 2, segue, e
// grava a segunda. A empresa termina com 2 credenciais e cota 1 — acima do
// teto, sem erro nenhum e sem nada no log dizendo o que houve.
//
// A correção é reler as cotas com `tx`. Além de corrigir o teto, ela cria a
// dependência que faltava: agora o SSI enxerga a leitura e pode abortar com
// P2034, que o serviço já traduz em mensagem para o expositor tentar de novo.
//
// COMO ESTE ARQUIVO REPRODUZ A JANELA
//
// Não com duas requisições de verdade: o intervalo entre `bound()` e o início
// da transação é interno ao serviço e não dá para acertar por fora sem corrida
// de relógio, que produz teste intermitente. Em vez disso, injeto a alteração
// no instante exato, envolvendo o cliente Prisma: quando o serviço lê a
// empresa em `bound()`, a cota é alterada logo depois, antes de a transação
// abrir. É determinístico e reproduz a MESMA ordem de eventos.
//
// Declaro isso em alto e bom som: é uma reprodução dirigida da janela, não uma
// prova de concorrência real. A prova de concorrência real do estoque está em
// `kit-stock.postgres.test.mjs`, com duas conexões e `FOR UPDATE`, e não é
// disto que este arquivo trata.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Importa o serviço COMPILADO, como os outros testes deste diretório: o fonte
// em TypeScript não é importável aqui sem build.
const { ExhibitorCompanyService } = await import('../dist/exhibitor-company.service.js');

const db = new PrismaClient();
let servico;

before(() => { servico = new ExhibitorCompanyService(db); });
after(async () => { await db.$disconnect(); });

/** CPF com dígitos verificadores corretos, a partir de nove dígitos base. */
function cpfValido(nove) {
  let valor = nove;
  for (const tamanho of [9, 10]) {
    const soma = Array.from(valor.slice(0, tamanho))
      .reduce((total, item, indice) => total + Number(item) * (tamanho + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    valor += String(resto === 10 ? 0 : resto);
  }
  return valor;
}

/** CNPJ com dígitos verificadores corretos, a partir de doze dígitos base. */
function cnpjValido(doze) {
  const digito = (valor, tamanho) => {
    let soma = 0;
    let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(valor[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const com12 = doze + String(digito(doze, 12));
  return com12 + String(digito(com12, 13));
}

let sequencia = 0;
const proximoCpf = () => cpfValido(String(100000000 + (sequencia += 1)).padStart(9, '0'));

async function cenario(rotulo, { quotaExhibitor = 2 } = {}) {
  const run = randomBytes(5).toString('hex');
  const email = `caex-${rotulo}-${run}@evolvia-ci.local`;
  const dono = await db.user.create({
    data: { name: `PG ${rotulo}`, email, passwordHash: 'fixture', emailVerifiedAt: new Date() },
  });
  const organizacao = await db.organization.create({
    data: { name: `PG ${rotulo}`, slug: `caex-${rotulo}-${run}`, createdById: dono.id },
  });
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id, name: `Evento ${rotulo}`, slug: `caex-${rotulo}-${run}`,
      eventType: 'Feira', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED',
    },
  });
  await db.eventCapability.create({ data: { eventId: evento.id, code: 'exhibitor', status: 'ACTIVE' } });

  const conferida = await db.event.findUnique({
    where: { id: evento.id },
    select: { capabilities: { where: { status: 'ACTIVE' }, select: { code: true } } },
  });
  assert.deepEqual(
    conferida.capabilities.map((c) => c.code),
    ['exhibitor'],
    'sem a capacidade exhibitor ativa o serviço responde 404 e o teste mediria outra coisa',
  );

  const empresa = await db.eventExhibitorCompany.create({
    data: {
      organizationId: organizacao.id,
      eventId: evento.id,
      kind: 'EXHIBITOR',
      nationality: 'BRAZILIAN',
      document: cnpjValido(String(110000000000 + (sequencia += 1))),
      loginEmail: email,
      legalName: `Empresa ${rotulo} LTDA`,
      tradeName: `Empresa ${rotulo}`,
      segment: '',
      booth: 'A1',
      areaLabel: '9m2',
      quotaExhibitor,
      quotaAssembler: 0,
      quotaService: 0,
      contactName: 'Contato Fixture',
      contactRole: 'Gerente',
      contactEmail: email,
      postalCode: '', street: '', addressNumber: '', complement: '',
      district: '', city: '', state: '', country: '', phone: '',
    },
  });
  const formulario = await db.eventExhibitorForm.create({
    data: {
      organizationId: organizacao.id,
      eventId: evento.id,
      sortOrder: 1,
      title: 'Crachás de expositor',
      active: true,
      required: true,
      deadline: null,
      audience: 'BOTH',
      kind: 'CREDENTIAL',
      credentialKind: 'EXHIBITOR',
      pdfUrl: '',
      wordUrl: '',
    },
  });

  const credencial = (nome) => ({
    formId: formulario.id,
    kind: 'EXHIBITOR',
    nationality: 'BRAZILIAN',
    document: proximoCpf(),
    fullName: nome,
    badgeName: nome.slice(0, 20),
    role: 'Vendas',
    phone: '',
    mobile: '',
  });

  return {
    dono,
    email,
    slug: evento.slug,
    eventId: evento.id,
    organizationId: organizacao.id,
    empresa,
    credencial,
    cadastrar: (cliente, nome) => new ExhibitorCompanyService(cliente)
      .addCredential(dono.id, email, evento.slug, empresa.id, credencial(nome)),
    cota: async () => (await db.eventExhibitorCompany.findUnique({
      where: { id: empresa.id }, select: { quotaExhibitor: true },
    })).quotaExhibitor,
    emitidas: () => db.eventExhibitorCredential.count({
      where: { companyId: empresa.id, eventId: evento.id, kind: 'EXHIBITOR' },
    }),
    mudarCota: (valor) => db.eventExhibitorCompany.update({
      where: { id: empresa.id }, data: { quotaExhibitor: valor },
    }),
  };
}

/**
 * Cliente que dispara `aoLerEmpresa` logo DEPOIS de o serviço ler a empresa em
 * `bound()` — o instante exato da janela. O `tx` entregue ao callback de
 * `$transaction` continua sendo o real, não envolvido: é dentro dele que a
 * correção relê a cota, e envolvê-lo esconderia justamente o que se mede.
 */
function clienteComJanela(real, aoLerEmpresa) {
  let disparado = false;
  return new Proxy(real, {
    get(alvo, prop, receptor) {
      const valor = Reflect.get(alvo, prop, receptor);
      if (prop !== 'eventExhibitorCompany') {
        return typeof valor === 'function' ? valor.bind(alvo) : valor;
      }
      return new Proxy(valor, {
        get(modelo, nome, r) {
          const metodo = Reflect.get(modelo, nome, r);
          if (nome !== 'findFirst' || typeof metodo !== 'function') {
            return typeof metodo === 'function' ? metodo.bind(modelo) : metodo;
          }
          return async (...args) => {
            const resultado = await metodo.apply(modelo, args);
            if (!disparado) { disparado = true; await aoLerEmpresa(); }
            return resultado;
          };
        },
      });
    },
  });
}

const LIMITE = { timeout: 180000 };
const COTA_USADA = /cota deste tipo de crach/iu;

// REPROVA sem a correção: a cota baixada no meio do caminho era ignorada e a
// credencial passava do teto novo.
test('cota baixada depois da leitura e antes da transação é respeitada', LIMITE, async () => {
  const c = await cenario('janela', { quotaExhibitor: 2 });
  await c.cadastrar(db, 'Primeira Pessoa');
  assert.equal(await c.emitidas(), 1, 'a primeira cabe na cota 2');

  const cliente = clienteComJanela(db, () => c.mudarCota(1));
  await assert.rejects(
    () => c.cadastrar(cliente, 'Segunda Pessoa'),
    (erro) => COTA_USADA.test(String(erro?.message ?? erro)),
    'com a cota já em 1 e uma credencial emitida, a segunda tem de ser recusada',
  );

  assert.equal(await c.cota(), 1, 'a cota realmente foi baixada durante a janela');
  assert.equal(await c.emitidas(), 1, 'nenhuma credencial acima do teto pode ter sido gravada');
});

// Espelho do anterior: reler não pode significar negar sempre. Cota AUMENTADA
// na mesma janela tem de valer na hora, pelo mesmo motivo.
test('cota aumentada na mesma janela também vale de imediato', LIMITE, async () => {
  const c = await cenario('aumento', { quotaExhibitor: 1 });
  await c.cadastrar(db, 'Primeira Pessoa');
  assert.equal(await c.emitidas(), 1);

  const cliente = clienteComJanela(db, () => c.mudarCota(2));
  await c.cadastrar(cliente, 'Segunda Pessoa');

  assert.equal(await c.cota(), 2);
  assert.equal(await c.emitidas(), 2, 'com a cota já em 2, a segunda credencial é legítima');
});

// REGRESSÃO: sem janela nenhuma, o comportamento de hoje é preservado.
test('sem alteração concorrente, a cota continua valendo como antes', LIMITE, async () => {
  const c = await cenario('normal', { quotaExhibitor: 2 });
  await c.cadastrar(db, 'Primeira Pessoa');
  await c.cadastrar(db, 'Segunda Pessoa');
  assert.equal(await c.emitidas(), 2, 'duas credenciais cabem na cota 2');

  await assert.rejects(
    () => c.cadastrar(db, 'Terceira Pessoa'),
    (erro) => COTA_USADA.test(String(erro?.message ?? erro)),
    'a terceira estoura a cota',
  );
  assert.equal(await c.emitidas(), 2, 'a recusa não grava');
});

// REGRESSÃO: cota zero recusa a primeira, e não só a que passa do teto.
test('cota zero recusa já a primeira credencial', LIMITE, async () => {
  const c = await cenario('zero', { quotaExhibitor: 0 });
  await assert.rejects(
    () => c.cadastrar(db, 'Primeira Pessoa'),
    (erro) => COTA_USADA.test(String(erro?.message ?? erro)),
  );
  assert.equal(await c.emitidas(), 0);
});
