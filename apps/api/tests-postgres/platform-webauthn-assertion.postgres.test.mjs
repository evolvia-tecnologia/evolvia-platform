// NÃO usa banco de dados. Vive nesta pasta porque importa do `dist`:
// `platform-webauthn.ts` carrega decorators e o Node com type stripping não o
// parseia, então ele só existe depois do build — e o build acontece no job que
// roda esta pasta. Nenhuma fixture, nenhuma linha gravada.
//
// O CAMINHO DE SUCESSO DA WEBAUTHN, QUE FALTAVA
// ---------------------------------------------
// Toda PR desta frente trazia a mesma ressalva: "o caminho criptográfico de
// sucesso não está provado; produzir assertion válida exige autenticador real".
// A premissa estava errada. Não exige hardware — exige uma chave P-256, a chave
// COSE correspondente, e uma assinatura sobre
// `authenticatorData || sha256(clientDataJSON)`. Tudo isso é `node:crypto`.
//
// Por que isso importa: as 25 asserções de `platform-ceremony-policy` cobrem as
// RECUSAS — desafio trocado, reutilizado, vencido, apresentado por outra sessão
// — e todas acontecem ANTES de qualquer assinatura. Havia prova de que a porta
// fecha e nenhuma de que ela abre. Uma suíte feita só de negativas passa
// inteira mesmo com a verificação quebrada.
//
// A ÂNCORA, e o risco de falso verde deste arquivo
// ------------------------------------------------
// Se o autenticador montado aqui estiver subtilmente errado, o caso de SUCESSO
// fica vermelho e os seis negativos passam por VACUIDADE: todos esperam `null`,
// e um autenticador quebrado devolve `null` sempre.
//
// Então o caso de sucesso é a âncora. Enquanto ele estiver verde, os negativos
// medem o que dizem medir. Se ele estiver vermelho, nenhum dos outros significa
// nada — e o reparo é no autenticador, não no negativo.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const { PlatformWebAuthnService, configuracaoWebAuthn } = await import('../dist/platform-webauthn.js');

const servico = new PlatformWebAuthnService();

/**
 * A configuração REAL do serviço, não valores fixos.
 *
 * Fixar `localhost` e `http://localhost:3000` faria o teste passar no meu
 * desenho e falhar em qualquer ambiente que configure as variáveis — e, pior,
 * não provaria que o serviço aceita o que o serviço espera. A asserção é
 * montada para a configuração que o serviço diz ter.
 */
const config = configuracaoWebAuthn();

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const deB64url = (texto) => Buffer.from(texto, 'base64url');

/**
 * Autenticador em software: par P-256 e a chave pública em COSE_Key.
 *
 * A biblioteca lê a chave pública no formato COSE, que é o que o autenticador
 * entrega no registro e o que fica gravado na coluna. O mapa é fixo para
 * EC2/P-256/ES256:
 *
 *   a5                      mapa de 5 pares
 *     01 02                 1 (kty)  = 2 (EC2)
 *     03 26                 3 (alg)  = -7 (ES256)
 *     20 01                 -1 (crv) = 1 (P-256)
 *     21 58 20 <32 bytes>   -2 (x)
 *     22 58 20 <32 bytes>   -3 (y)
 */
function autenticadorDeSoftware() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = deB64url(jwk.x);
  const y = deB64url(jwk.y);
  assert.equal(x.length, 32, 'a coordenada x de P-256 tem de ter 32 bytes');
  assert.equal(y.length, 32, 'a coordenada y de P-256 tem de ter 32 bytes');
  const cose = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    x,
    Buffer.from([0x22, 0x58, 0x20]),
    y,
  ]);
  return { privateKey, cose, credentialId: b64url(randomBytes(16)) };
}

/** `rpIdHash(32) || flags(1) || signCount(4)`, nesta ordem. */
function dadosDoAutenticador(rpId, flags, contador) {
  const contadorBE = Buffer.alloc(4);
  contadorBE.writeUInt32BE(contador, 0);
  return Buffer.concat([
    createHash('sha256').update(rpId).digest(),
    Buffer.from([flags]),
    contadorBE,
  ]);
}

/** UP (presença) + UV (verificação do usuário). O serviço exige UV. */
const FLAGS_COM_VERIFICACAO = 0x05;
const FLAGS_SEM_VERIFICACAO = 0x01;

/**
 * Monta a asserção como o navegador a entregaria.
 *
 * A assinatura cobre `authenticatorData` concatenado com o sha256 do
 * `clientDataJSON` — nessa ordem, e sobre os bytes, não sobre o base64url.
 */
function montarAssercao(autenticador, {
  desafio,
  origem = config.origin,
  rpId = config.rpID,
  flags = FLAGS_COM_VERIFICACAO,
  contador = 1,
  adulterarAssinatura = false,
} = {}) {
  const authData = dadosDoAutenticador(rpId, flags, contador);
  const clientData = Buffer.from(JSON.stringify({
    type: 'webauthn.get',
    challenge: desafio,
    origin: origem,
    crossOrigin: false,
  }), 'utf8');

  const assinada = Buffer.concat([authData, createHash('sha256').update(clientData).digest()]);
  const assinatura = sign('sha256', assinada, autenticador.privateKey);
  if (adulterarAssinatura) assinatura[assinatura.length - 1] ^= 0x01;

  return {
    id: autenticador.credentialId,
    rawId: autenticador.credentialId,
    type: 'public-key',
    response: {
      clientDataJSON: b64url(clientData),
      authenticatorData: b64url(authData),
      signature: b64url(assinatura),
    },
    clientExtensionResults: {},
  };
}

/** A credencial na forma que o repositório entrega ao serviço. */
const credencialDe = (autenticador, contador = 0) => ({
  id: autenticador.credentialId,
  publicKey: new Uint8Array(autenticador.cose),
  counter: contador,
  transports: [],
});

/** Desafio como o servidor o gera: 32 bytes em base64url, 43 caracteres. */
const novoDesafio = () => randomBytes(32).toString('base64url');

// ============================================================== a âncora

test('ÂNCORA: uma asserção válida é VERIFICADA, e devolve o contador novo', async () => {
  const autenticador = autenticadorDeSoftware();
  const desafio = novoDesafio();

  const resultado = await servico.verificarAutenticacao(
    montarAssercao(autenticador, { desafio, contador: 7 }),
    desafio,
    credencialDe(autenticador, 0),
  );

  assert.notEqual(
    resultado, null,
    'A verificação criptográfica recusou uma asserção que deveria passar.\n\n'
      + 'ENQUANTO ESTE CASO ESTIVER VERMELHO, OS NEGATIVOS DESTE ARQUIVO NÃO\n'
      + 'PROVAM NADA: todos esperam `null`, e um autenticador quebrado devolve\n'
      + '`null` sempre. O reparo é aqui, não neles.\n\n'
      + 'Onde olhar, em ordem de probabilidade:\n'
      + '  1. a codificação COSE da chave pública em `autenticadorDeSoftware`;\n'
      + '  2. a ordem dos bytes em `dadosDoAutenticador`\n'
      + '     (rpIdHash 32 || flags 1 || signCount 4);\n'
      + '  3. o que a assinatura cobre: authenticatorData || sha256(clientDataJSON);\n'
      + `  4. a configuração: rpID=${config.rpID}, origin=${config.origin}.`,
  );
  assert.equal(resultado.novoContador, 7, 'o contador do autenticador não foi devolvido');
});

test('o contador avança: o serviço devolve o recebido, não o gravado', async () => {
  // É este valor que `avancarContador` grava, e é a defesa contra autenticador
  // clonado. Devolver o gravado faria o contador nunca subir.
  const autenticador = autenticadorDeSoftware();
  const desafio = novoDesafio();
  const resultado = await servico.verificarAutenticacao(
    montarAssercao(autenticador, { desafio, contador: 42 }),
    desafio,
    credencialDe(autenticador, 41),
  );
  assert.notEqual(resultado, null, 'ver a ÂNCORA');
  assert.equal(resultado.novoContador, 42);
});

// ======================================================== os seis negativos
//
// Cada um muda UM campo em relação à asserção que passa na âncora. Antes deste
// arquivo, nenhum deles era medido: a recusa era presumida da reputação da
// biblioteca.

test('origem trocada é recusada', async () => {
  const autenticador = autenticadorDeSoftware();
  const desafio = novoDesafio();
  const resultado = await servico.verificarAutenticacao(
    montarAssercao(autenticador, { desafio, origem: 'https://evolvia-falso.example' }),
    desafio,
    credencialDe(autenticador),
  );
  assert.equal(resultado, null, 'asserção de outra origem foi aceita');
});

test('rpID trocado é recusado', async () => {
  const autenticador = autenticadorDeSoftware();
  const desafio = novoDesafio();
  const resultado = await servico.verificarAutenticacao(
    montarAssercao(autenticador, { desafio, rpId: `${config.rpID}.falso.example` }),
    desafio,
    credencialDe(autenticador),
  );
  assert.equal(resultado, null, 'asserção com rpIdHash de outro domínio foi aceita');
});

test('sem a flag de verificação do usuário é recusada', async () => {
  // `requireUserVerification: true` em `platform-webauthn.ts`. Presença sem
  // verificação significa que alguém tocou a chave sem provar quem é — para a
  // área que administra a plataforma inteira, não basta.
  const autenticador = autenticadorDeSoftware();
  const desafio = novoDesafio();
  const resultado = await servico.verificarAutenticacao(
    montarAssercao(autenticador, { desafio, flags: FLAGS_SEM_VERIFICACAO }),
    desafio,
    credencialDe(autenticador),
  );
  assert.equal(resultado, null, 'asserção sem verificação do usuário foi aceita');
});

test('assinatura adulterada em UM byte é recusada', async () => {
  const autenticador = autenticadorDeSoftware();
  const desafio = novoDesafio();
  const resultado = await servico.verificarAutenticacao(
    montarAssercao(autenticador, { desafio, adulterarAssinatura: true }),
    desafio,
    credencialDe(autenticador),
  );
  assert.equal(resultado, null, 'assinatura inválida foi aceita');
});

test('desafio diferente do esperado é recusado', async () => {
  // A política da cerimônia já recusa antes de chegar aqui; isto prova que a
  // camada criptográfica também recusa, em vez de depender daquela.
  const autenticador = autenticadorDeSoftware();
  const resultado = await servico.verificarAutenticacao(
    montarAssercao(autenticador, { desafio: novoDesafio() }),
    novoDesafio(),
    credencialDe(autenticador),
  );
  assert.equal(resultado, null, 'asserção assinada sobre outro desafio foi aceita');
});

test('chave pública de OUTRO par é recusada', async () => {
  // O caso do autenticador trocado: a asserção é válida, a assinatura é
  // íntegra, e a chave gravada é de outra pessoa.
  const autenticador = autenticadorDeSoftware();
  const outro = autenticadorDeSoftware();
  const desafio = novoDesafio();
  const resultado = await servico.verificarAutenticacao(
    montarAssercao(autenticador, { desafio }),
    desafio,
    // Mesmo id de credencial, chave pública do outro par.
    { ...credencialDe(autenticador), publicKey: new Uint8Array(outro.cose) },
  );
  assert.equal(resultado, null, 'asserção verificada contra a chave pública errada foi aceita');
});
