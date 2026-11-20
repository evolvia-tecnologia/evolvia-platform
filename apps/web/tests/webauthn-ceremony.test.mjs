import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CerimoniaInvalida,
  deBase64url, mensagemDoErro, opcoesDeAutenticacao, opcoesDeRegistro,
  paraBase64url, respostaDeAutenticacao, respostaDeRegistro,
} from '../lib/webauthn-ceremony.ts';

const bytes = (...valores) => new Uint8Array(valores);

/** Um `DOMException` de mentira: só o `name` importa, e é o que varia. */
const erroDoNavegador = (nome, mensagem = 'texto que varia por navegador') => {
  const erro = new Error(mensagem);
  erro.name = nome;
  return erro;
};

/** Credencial de mentira, com os buffers que o autenticador devolveria. */
function credencialDeAutenticacao({ rawId, userHandle = null, extensoes = {} } = {}) {
  return {
    rawId: (rawId ?? bytes(1, 2, 3, 4)).buffer,
    response: {
      clientDataJSON: bytes(10, 11).buffer,
      authenticatorData: bytes(20, 21, 22).buffer,
      signature: bytes(30, 31, 32, 33).buffer,
      userHandle: userHandle === null ? null : userHandle.buffer,
    },
    getClientExtensionResults: () => extensoes,
  };
}

// ------------------------------------------------------- base64url, ida e volta

test('ida e volta preserva todos os 256 valores de byte', () => {
  // O erro clássico aqui é perder bytes altos por tratar como texto. Se isso
  // acontecer, a chave pública chega corrompida e a assinatura não verifica —
  // sem erro nenhum que aponte para cá.
  const todos = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) todos[i] = i;
  assert.deepEqual(deBase64url(paraBase64url(todos)), todos);
});

test('o texto gravado é base64url sem padding, não base64 padrão', () => {
  // Dois caracteres e o padding são a diferença inteira entre os alfabetos. O
  // servidor decodifica como base64url; mandar '+' ou '/' quebraria lá.
  const comMaisEBarra = bytes(251, 255, 190, 255);
  const texto = paraBase64url(comMaisEBarra);
  assert.ok(!texto.includes('+'), texto);
  assert.ok(!texto.includes('/'), texto);
  assert.ok(!texto.includes('='), texto);
  assert.match(texto, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(deBase64url(texto), comMaisEBarra);
});

test('os três restos de comprimento possíveis funcionam', () => {
  // base64 cresce de 4 em 4 caracteres por 3 bytes. 1, 2 e 3 bytes dão restos
  // 2, 3 e 0 — e cada um precisa de uma quantidade diferente de padding na
  // volta. É aqui que uma implementação à mão costuma errar.
  for (const tamanho of [1, 2, 3, 4, 5, 6, 7]) {
    const original = new Uint8Array(tamanho).map((_, i) => (i * 37 + 11) % 256);
    assert.deepEqual(deBase64url(paraBase64url(original)), original, `${tamanho} bytes`);
  }
});

test('texto com caractere fora do alfabeto é recusado, não decodificado em silêncio', () => {
  // `atob` IGNORA caractere inválido em vez de reclamar. Sem esta guarda, um
  // valor corrompido viraria bytes errados sem aviso.
  for (const ruim of ['abc!', 'ab cd', 'ab+cd', 'ab/cd', 'YWJj=', 'ábc']) {
    assert.throws(() => deBase64url(ruim), CerimoniaInvalida, ruim);
  }
});

test('comprimento impossível é recusado', () => {
  // Resto 1 não representa byte nenhum.
  assert.throws(() => deBase64url('A'), CerimoniaInvalida);
  assert.throws(() => deBase64url('ABCDE'), CerimoniaInvalida);
  // E os restos possíveis passam.
  assert.equal(deBase64url('AB').length, 1);
  assert.equal(deBase64url('ABC').length, 2);
  assert.equal(deBase64url('ABCD').length, 3);
});

test('vazio e não-texto são recusados', () => {
  for (const ruim of ['', null, undefined, 42, {}, []]) {
    assert.throws(() => deBase64url(ruim), CerimoniaInvalida, String(ruim));
  }
});

test('paraBase64url aceita ArrayBuffer e Uint8Array igualmente', () => {
  const vista = bytes(1, 2, 3, 250);
  assert.equal(paraBase64url(vista), paraBase64url(vista.buffer));
});

test('chave grande não estoura o limite de argumentos', () => {
  // Uma attestation pode passar de 64 KB, e `String.fromCharCode(...bytes)` de
  // uma vez estoura o limite de argumentos. Por isso a conversão é em pedaços.
  const grande = new Uint8Array(200_000).map((_, i) => i % 256);
  const texto = paraBase64url(grande);
  assert.deepEqual(deBase64url(texto), grande);
});

// ----------------------------------------------------- opções de autenticação

test('as opções de autenticação chegam com bytes, não com texto', () => {
  const credencialId = paraBase64url(bytes(9, 8, 7));
  const opcoes = opcoesDeAutenticacao({
    challenge: paraBase64url(bytes(1, 2, 3)),
    timeout: 60000,
    rpId: 'homologacao.evolviatecnologia.com',
    allowCredentials: [{ id: credencialId, type: 'public-key', transports: ['usb', 'nfc'] }],
    userVerification: 'required',
  });

  assert.ok(opcoes.challenge instanceof Uint8Array, 'o desafio tem de virar bytes');
  assert.deepEqual(opcoes.challenge, bytes(1, 2, 3));
  assert.equal(opcoes.rpId, 'homologacao.evolviatecnologia.com');
  assert.equal(opcoes.timeout, 60000);
  assert.equal(opcoes.userVerification, 'required');
  assert.deepEqual(opcoes.allowCredentials[0].id, bytes(9, 8, 7));
  assert.equal(opcoes.allowCredentials[0].type, 'public-key');
  assert.deepEqual(opcoes.allowCredentials[0].transports, ['usb', 'nfc']);
});

test('transporte desconhecido é descartado, e lista vazia vira ausente', () => {
  // Valor novo no banco não pode derrubar a cerimônia: alguns navegadores
  // lançam com transporte que não conhecem. E `transports: []` faz navegador
  // não oferecer transporte nenhum, que é pior que não informar.
  const comLixo = opcoesDeAutenticacao({
    challenge: paraBase64url(bytes(1)),
    allowCredentials: [{ id: paraBase64url(bytes(2)), transports: ['usb', 'teletransporte'] }],
  });
  assert.deepEqual(comLixo.allowCredentials[0].transports, ['usb']);

  const soLixo = opcoesDeAutenticacao({
    challenge: paraBase64url(bytes(1)),
    allowCredentials: [{ id: paraBase64url(bytes(2)), transports: ['teletransporte'] }],
  });
  assert.equal(soLixo.allowCredentials[0].transports, undefined, 'lista vazia tem de virar ausente');

  const semCampo = opcoesDeAutenticacao({
    challenge: paraBase64url(bytes(1)),
    allowCredentials: [{ id: paraBase64url(bytes(2)) }],
  });
  assert.equal(semCampo.allowCredentials[0].transports, undefined);
});

test('allowCredentials ausente continua ausente, e não vira lista vazia', () => {
  // `allowCredentials: []` significa "qualquer credencial" para o navegador, o
  // oposto de "nenhuma informada". A diferença é observável.
  const opcoes = opcoesDeAutenticacao({ challenge: paraBase64url(bytes(1)) });
  assert.equal(opcoes.allowCredentials, undefined);
});

test('opções sem desafio são recusadas com mensagem legível', () => {
  for (const ruim of [null, undefined, {}, { challenge: 42 }, { challenge: null }]) {
    assert.throws(() => opcoesDeAutenticacao(ruim), CerimoniaInvalida, JSON.stringify(ruim));
  }
});

// --------------------------------------------------------- opções de registro

test('as opções de registro convertem desafio E identificação do titular', () => {
  // `user.id` também é base64url e também tem de virar bytes. Esquecer este
  // segundo é um erro fácil, porque o desafio funciona e o registro falha só
  // na hora da atestação.
  const opcoes = opcoesDeRegistro({
    challenge: paraBase64url(bytes(5, 6)),
    rp: { id: 'evolviatecnologia.com', name: 'Evolvia' },
    user: { id: paraBase64url(bytes(7, 8, 9)), name: 'titular@exemplo', displayName: 'Titular' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    attestation: 'none',
  });
  assert.deepEqual(opcoes.challenge, bytes(5, 6));
  assert.ok(opcoes.user.id instanceof Uint8Array, 'user.id tem de virar bytes');
  assert.deepEqual(opcoes.user.id, bytes(7, 8, 9));
  assert.equal(opcoes.user.name, 'titular@exemplo');
  assert.equal(opcoes.rp.name, 'Evolvia');
  assert.deepEqual(opcoes.pubKeyCredParams, [{ type: 'public-key', alg: -7 }]);
});

test('registro sem titular é recusado', () => {
  const base = {
    challenge: paraBase64url(bytes(1)),
    rp: { name: 'Evolvia' },
    pubKeyCredParams: [],
  };
  assert.throws(() => opcoesDeRegistro(base), CerimoniaInvalida);
  assert.throws(() => opcoesDeRegistro({ ...base, user: { name: 'x', displayName: 'x' } }), CerimoniaInvalida);
});

// ------------------------------------------------- resposta do autenticador

test('a resposta de autenticação tem a forma exata que o servidor verifica', () => {
  const credencial = credencialDeAutenticacao({ rawId: bytes(1, 2, 3, 4) });
  const corpo = respostaDeAutenticacao(credencial);

  assert.equal(corpo.type, 'public-key');
  assert.equal(corpo.id, paraBase64url(bytes(1, 2, 3, 4)));
  assert.equal(corpo.rawId, corpo.id, 'id e rawId vêm do MESMO rawId');
  assert.equal(corpo.response.clientDataJSON, paraBase64url(bytes(10, 11)));
  assert.equal(corpo.response.authenticatorData, paraBase64url(bytes(20, 21, 22)));
  assert.equal(corpo.response.signature, paraBase64url(bytes(30, 31, 32, 33)));
  assert.deepEqual(corpo.clientExtensionResults, {});
});

test('o id vem de rawId, não do campo id do navegador', () => {
  // O serviço acha a credencial por este texto antes de conferir a assinatura.
  // Derivar de `rawId` é o que garante que ele case com a coluna; confiar no
  // `id` que o navegador preencheu deixaria uma divergência possível.
  const credencial = credencialDeAutenticacao({ rawId: bytes(200, 201, 202) });
  credencial.id = 'texto-divergente-preenchido-pelo-navegador';
  assert.equal(respostaDeAutenticacao(credencial).id, paraBase64url(bytes(200, 201, 202)));
});

test('userHandle ausente sai ausente, nunca string vazia', () => {
  // String vazia faria a biblioteca tratar como handle existente e comparar
  // contra o do banco, recusando uma autenticação legítima.
  const sem = respostaDeAutenticacao(credencialDeAutenticacao({ userHandle: null }));
  assert.equal(sem.response.userHandle, undefined);

  const com = respostaDeAutenticacao(credencialDeAutenticacao({ userHandle: bytes(77, 78) }));
  assert.equal(com.response.userHandle, paraBase64url(bytes(77, 78)));
});

test('autenticador sem assinatura é recusado antes de ir ao servidor', () => {
  const credencial = credencialDeAutenticacao();
  credencial.response.signature = null;
  assert.throws(() => respostaDeAutenticacao(credencial), CerimoniaInvalida);
});

test('a resposta de registro leva a atestação e os transportes conhecidos', () => {
  const credencial = {
    rawId: bytes(40, 41).buffer,
    response: {
      clientDataJSON: bytes(50).buffer,
      attestationObject: bytes(60, 61, 62).buffer,
      getTransports: () => ['usb', 'inventado'],
    },
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
  };
  const corpo = respostaDeRegistro(credencial);
  assert.equal(corpo.id, paraBase64url(bytes(40, 41)));
  assert.equal(corpo.response.attestationObject, paraBase64url(bytes(60, 61, 62)));
  assert.deepEqual(corpo.response.transports, ['usb'], 'transporte inventado é descartado');
  assert.deepEqual(corpo.clientExtensionResults, { credProps: { rk: true } });
});

test('registro sem atestação é recusado, e sem getTransports não quebra', () => {
  const semAtestacao = {
    rawId: bytes(1).buffer,
    response: { clientDataJSON: bytes(2).buffer, attestationObject: null },
    getClientExtensionResults: () => ({}),
  };
  assert.throws(() => respostaDeRegistro(semAtestacao), CerimoniaInvalida);

  // Navegadores antigos não têm `getTransports`. Isso não pode derrubar o
  // registro: o campo é opcional para o servidor.
  const semMetodo = {
    rawId: bytes(1).buffer,
    response: { clientDataJSON: bytes(2).buffer, attestationObject: bytes(3).buffer },
    getClientExtensionResults: () => ({}),
  };
  assert.equal(respostaDeRegistro(semMetodo).response.transports, undefined);
});

test('credencial sem getClientExtensionResults não quebra', () => {
  const credencial = credencialDeAutenticacao();
  delete credencial.getClientExtensionResults;
  assert.deepEqual(respostaDeAutenticacao(credencial).clientExtensionResults, {});
});

// ----------------------------------------------------------- erros na tela

test('cada erro do navegador vira instrução, não jargão', () => {
  // A `message` do DOMException varia por navegador e às vezes é inútil. O
  // `name` é a parte estável. E cada mensagem tem de dizer o que fazer agora:
  // aviso sem próximo passo deixa a pessoa presa na mesma tela.
  const casos = {
    NotAllowedError: /cancelada ou expirou/i,
    InvalidStateError: /já está registrada/i,
    NotSupportedError: /não oferece/i,
    SecurityError: /endereço desta página/i,
    AbortError: /interrompida/i,
    ConstraintError: /PIN ou biometria/i,
    UnknownError: /Desconecte e reconecte/i,
  };
  for (const [nome, esperado] of Object.entries(casos)) {
    const mensagem = mensagemDoErro(erroDoNavegador(nome));
    assert.match(mensagem, esperado, nome);
    assert.ok(!mensagem.includes(nome), `${nome} não pode aparecer cru na tela: ${mensagem}`);
    assert.ok(!mensagem.includes('texto que varia por navegador'), `${nome} não pode usar a message do navegador`);
  }
});

test('cancelamento e tempo esgotado recebem a MESMA mensagem', () => {
  // A especificação manda os dois com o mesmo nome, de propósito, para o site
  // não distinguir. A mensagem cobre os dois sem fingir saber qual foi.
  const mensagem = mensagemDoErro(erroDoNavegador('NotAllowedError'));
  assert.match(mensagem, /cancelada ou expirou/i);
});

test('erro da própria cerimônia passa a mensagem adiante', () => {
  const nossa = new CerimoniaInvalida('Valor base64url vazio.');
  assert.equal(mensagemDoErro(nossa), 'Valor base64url vazio.');
});

test('erro desconhecido não vira texto vazio nem "undefined"', () => {
  assert.match(mensagemDoErro(erroDoNavegador('CoisaNova', 'detalhe útil')), /detalhe útil/);
  for (const estranho of [null, undefined, 'texto solto', 42, {}]) {
    const mensagem = mensagemDoErro(estranho);
    assert.ok(mensagem.length > 10, JSON.stringify(estranho));
    assert.ok(!mensagem.includes('undefined'), mensagem);
  }
});

test('toda mensagem é frase completa em português, com pontuação', () => {
  const nomes = ['NotAllowedError', 'InvalidStateError', 'NotSupportedError', 'SecurityError',
    'AbortError', 'ConstraintError', 'UnknownError', 'QualquerOutro'];
  for (const nome of nomes) {
    const mensagem = mensagemDoErro(erroDoNavegador(nome, 'Algo deu errado.'));
    assert.match(mensagem, /[.!]$/, `${nome}: ${mensagem}`);
    assert.equal(mensagem[0], mensagem[0].toUpperCase(), `${nome} começa minúsculo`);
  }
});

// --------------------------- lacunas que a rodada de mutação encontrou

test('vazio e alfabeto inválido dão diagnósticos DIFERENTES', () => {
  // A guarda de vazio é redundante em efeito com a regex de alfabeto: as duas
  // recusam string vazia. Ela fica pelo diagnóstico — um campo que não veio é
  // um problema diferente de um campo corrompido, e quem lê o log precisa
  // saber qual dos dois. Sem este teste, remover a guarda não quebrava nada.
  const vazio = (() => { try { deBase64url(''); } catch (e) { return e.message; } })();
  const corrompido = (() => { try { deBase64url('ab!cd'); } catch (e) { return e.message; } })();
  assert.match(vazio, /vazio/i);
  assert.match(corrompido, /alfabeto/i);
  assert.notEqual(vazio, corrompido, 'as duas recusas não podem contar a mesma coisa');
});

test('erro da cerimônia com mensagem vazia não vira aviso em branco', () => {
  // Defeito que a mutação encontrou. O atalho de `CerimoniaInvalida` devolvia
  // `erro.message` sem conferir, então uma mensagem vazia saía vazia na tela.
  // Aviso em branco é pior que aviso genérico: a pessoa não sabe sequer que
  // algo falhou.
  const mensagem = mensagemDoErro(new CerimoniaInvalida(''));
  assert.ok(mensagem.length > 10, `devolveu ${JSON.stringify(mensagem)}`);
  assert.match(mensagem, /[.!]$/);
});
