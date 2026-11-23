import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  CredencialInvalida, LIMITE_CHAVE_PUBLICA, LIMITE_ID_DA_CREDENCIAL, LIMITE_ROTULO, LIMITE_TRANSPORTES,
  TRANSPORTES_CONHECIDOS,
  guardarChavePublica, guardarIdDaCredencial, guardarRotulo, guardarTransportes,
  lerChavePublica, lerTransportes,
} from '../src/platform-credential-codec.ts';

// --------------------------------------------------------------- chave pública

test('a chave pública dá a volta sem perder um byte', () => {
  // Tamanhos reais de chave COSE: ES256 fica perto de 77, RS256 perto de 294.
  for (const tamanho of [1, 16, 77, 128, 294, 512, 767]) {
    const bytes = new Uint8Array(randomBytes(tamanho));
    const volta = lerChavePublica(guardarChavePublica(bytes));
    assert.deepEqual([...volta], [...bytes], `tamanho ${tamanho}`);
  }
});

test('todo byte possível sobrevive à ida e volta', () => {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) bytes[i] = i;
  assert.deepEqual([...lerChavePublica(guardarChavePublica(bytes))], [...bytes]);
});

test('o texto gravado é base64url: atravessa URL, JSON e log sem escapar', () => {
  const texto = guardarChavePublica(new Uint8Array(randomBytes(294)));
  assert.match(texto, /^[A-Za-z0-9_-]+$/u);
  assert.ok(!texto.includes('+') && !texto.includes('/') && !texto.includes('='));
});

test('o texto gravado NÃO é a lista de bytes nem o objeto convertido', () => {
  // É este o defeito que o arquivo existe para impedir. Gravar o Uint8Array
  // direto numa coluna de texto produz uma destas duas formas, o registro
  // parece ter dado certo, e a chave está perdida.
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const texto = guardarChavePublica(bytes);
  assert.notEqual(texto, String(bytes));
  assert.notEqual(texto, '1,2,3,4,5');
  assert.notEqual(texto, '[object Uint8Array]');
  assert.deepEqual([...lerChavePublica(texto)], [1, 2, 3, 4, 5]);
});

test('chave que não caberia na coluna é recusada na gravação, não no INSERT', () => {
  const cabe = Math.floor((LIMITE_CHAVE_PUBLICA * 3) / 4);
  assert.doesNotThrow(() => guardarChavePublica(new Uint8Array(randomBytes(cabe - 1))));
  assert.throws(() => guardarChavePublica(new Uint8Array(randomBytes(LIMITE_CHAVE_PUBLICA))), CredencialInvalida);
  assert.equal(LIMITE_CHAVE_PUBLICA, 1024, 'é o VarChar(1024) do schema aplicado');
});

test('chave vazia ou de tipo errado é recusada', () => {
  assert.throws(() => guardarChavePublica(new Uint8Array(0)), CredencialInvalida);
  for (const ruim of [null, undefined, 'texto', [1, 2, 3], {}, Buffer.alloc(0)]) {
    assert.throws(() => guardarChavePublica(ruim), CredencialInvalida, String(ruim));
  }
});

test('texto gravado inválido é recusado em vez de decodificar pela metade', () => {
  // `Buffer.from` ignora caractere inválido em silêncio: sem esta guarda, uma
  // chave corrompida viraria bytes truncados e a falha apareceria só na
  // verificação da assinatura, sem dizer nada sobre a causa.
  for (const ruim of ['', null, undefined, 'tem espaço', 'com+mais', 'com/barra', 'igual=', 'acentuação']) {
    assert.throws(() => lerChavePublica(ruim), CredencialInvalida, String(ruim));
  }
});

test('Buffer aceitaria o texto inválido: a guarda é o que faz diferença', () => {
  const sujo = 'AAAA+BBBB';
  assert.ok(Buffer.from(sujo, 'base64url').length > 0, 'o Buffer não reclama');
  assert.throws(() => lerChavePublica(sujo), CredencialInvalida, 'mas nós reclamamos');
});

// ----------------------------------------------------------------- transportes

test('transportes dão a volta e são normalizados', () => {
  assert.equal(guardarTransportes(['usb', 'nfc']), 'nfc,usb');
  assert.deepEqual(lerTransportes('nfc,usb'), ['nfc', 'usb']);
  assert.equal(guardarTransportes(['USB', ' internal ']), 'internal,usb');
});

test('lista vazia grava a string vazia que é o default da coluna, não null', () => {
  for (const vazio of [[], null, undefined]) {
    assert.equal(guardarTransportes(vazio), '');
  }
  assert.deepEqual(lerTransportes(''), [], 'coluna vazia é lista vazia, nao uma lista com string vazia');
  assert.deepEqual(lerTransportes(null), []);
});

test('transporte desconhecido é descartado, não gravado', () => {
  assert.equal(guardarTransportes(['usb', 'teletransporte']), 'usb');
  assert.equal(guardarTransportes(['inventado']), '');
  assert.deepEqual(lerTransportes('usb,inventado'), ['usb']);
});

test('repetido não duplica, e a ordem é estável', () => {
  assert.equal(guardarTransportes(['usb', 'usb', 'USB']), 'usb');
  assert.equal(guardarTransportes(['nfc', 'usb']), guardarTransportes(['usb', 'nfc']));
});

test('todos os transportes conhecidos juntos ainda cabem na coluna', () => {
  const texto = guardarTransportes([...TRANSPORTES_CONHECIDOS]);
  assert.ok(texto.length <= LIMITE_TRANSPORTES, `${texto.length} > ${LIMITE_TRANSPORTES}`);
  assert.deepEqual(lerTransportes(texto).sort(), [...TRANSPORTES_CONHECIDOS].sort());
  assert.equal(LIMITE_TRANSPORTES, 120, 'é o VarChar(120) do schema aplicado');
});

test('valor não-string na lista não derruba a normalização', () => {
  assert.equal(guardarTransportes(['usb', 42, null, undefined, {}]), 'usb');
});

// ------------------------------------------------------- id da credencial

test('o id da credencial passa quando é base64url e cabe', () => {
  const id = randomBytes(32).toString('base64url');
  assert.equal(guardarIdDaCredencial(id), id);
  assert.equal(LIMITE_ID_DA_CREDENCIAL, 255, 'é o VarChar(255) do schema aplicado');
});

test('id vazio, longo ou fora do alfabeto é recusado', () => {
  for (const ruim of ['', null, undefined, 'com+mais', 'com espaço', 'a'.repeat(LIMITE_ID_DA_CREDENCIAL + 1)]) {
    assert.throws(() => guardarIdDaCredencial(ruim), CredencialInvalida, String(ruim));
  }
  assert.doesNotThrow(() => guardarIdDaCredencial('a'.repeat(LIMITE_ID_DA_CREDENCIAL)));
});

// ------------------------------------------------------------------- rótulo

test('rótulo vazio recebe padrão, porque lista sem nome não ajuda a revogar', () => {
  for (const vazio of ['', '   ', null, undefined]) {
    assert.equal(guardarRotulo(vazio), 'Chave de segurança');
  }
});

test('rótulo longo corta com marca visível, no limite exato da coluna', () => {
  const r = guardarRotulo('x'.repeat(LIMITE_ROTULO + 30));
  assert.equal(r.length, LIMITE_ROTULO);
  assert.ok(r.endsWith('…'));
  assert.equal(LIMITE_ROTULO, 80, 'é o VarChar(80) do schema aplicado');
});

test('rótulo no limite exato não é cortado nem marcado', () => {
  const exato = 'y'.repeat(LIMITE_ROTULO);
  assert.equal(guardarRotulo(exato), exato);
  assert.ok(!guardarRotulo(exato).endsWith('…'));
});

test('rótulo é guardado sem espaços nas pontas', () => {
  assert.equal(guardarRotulo('  YubiKey do cofre  '), 'YubiKey do cofre');
});

// --------------------------------- lacunas encontradas pela rodada de mutação

test('chave cujo texto dá exatamente o limite da coluna ainda passa', () => {
  // 768 bytes em base64url ocupam exatamente 1024 caracteres. Sem este caso, a
  // diferença entre `>` e `>=` na conferência do limite era invisível, e o
  // limite poderia recusar a chave que cabe — ou aceitar a que não cabe.
  const exato = new Uint8Array(randomBytes(768));
  const texto = guardarChavePublica(exato);
  assert.equal(texto.length, LIMITE_CHAVE_PUBLICA);
  assert.deepEqual([...lerChavePublica(texto)], [...exato]);

  // E um byte a mais já não cabe.
  assert.throws(() => guardarChavePublica(new Uint8Array(randomBytes(769))), CredencialInvalida);
});

test('texto que decodifica para zero bytes é recusado', () => {
  // Um único caractere passa pelo filtro de alfabeto e decodifica para NADA:
  // base64 precisa de dois caracteres para formar um byte. Sem a guarda, isto
  // devolveria uma chave de zero bytes e a falha só apareceria na verificação
  // da assinatura.
  assert.equal(Buffer.from('A', 'base64url').length, 0, 'premissa do caso');
  for (const curto of ['A', 'z', '_', '-', '0']) {
    assert.throws(() => lerChavePublica(curto), CredencialInvalida, curto);
  }
  // Dois caracteres já formam um byte e devem passar.
  assert.deepEqual([...lerChavePublica('AQ')], [1]);
});

test('o pior caso de transportes caberia na coluna com folga', () => {
  // Esta é a invariante que substitui a guarda removida: com a lista branca, o
  // texto máximo possível é muito menor que a coluna. Se a especificação ganhar
  // transportes e a lista crescer, este teste falha antes de qualquer INSERT.
  const pior = guardarTransportes([...TRANSPORTES_CONHECIDOS]);
  assert.ok(pior.length < LIMITE_TRANSPORTES, `${pior.length} deveria ser menor que ${LIMITE_TRANSPORTES}`);
  assert.equal(pior.length, 44);
});
