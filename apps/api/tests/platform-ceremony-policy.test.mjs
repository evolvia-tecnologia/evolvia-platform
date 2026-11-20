import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  CerimoniaInvalida, JANELA_DO_DESAFIO_MS, MINIMO_DO_DESAFIO,
  abrirCerimonia, consumirDesafio,
} from '../src/platform-ceremony-policy.ts';

const AGORA = Date.parse('2026-11-13T14:00:00.000Z');
const ativa = (over = {}) => ({ status: 'ACTIVE', ...over });
const desafio = () => randomBytes(32).toString('base64url');            // 43 caracteres
const sessaoA = { tipo: 'SESSAO', tokenHash: 'a'.repeat(64) };
const sessaoB = { tipo: 'SESSAO', tokenHash: 'b'.repeat(64) };
const semSessao = { tipo: 'SEM_SESSAO' };

/** Aplica na linha o que a política mandou gravar, como o banco faria. */
const aplicar = (identidade, gravar) => ({ ...identidade, ...gravar });

// ------------------------------------------------------------------- abertura

test('o que vai para o banco é o digest, nunca o desafio cru', () => {
  const cru = desafio();
  const a = abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA);
  assert.notEqual(a.gravar.pendingChallenge, cru, 'guardar o cru deixaria qualquer um concluir a cerimônia');
  assert.equal(a.gravar.pendingChallenge, createHash('sha256').update(`${cru}:${sessaoA.tokenHash}`).digest('hex'));
  assert.equal(a.desafioParaOCliente, cru);
});

test('o digest muda com o vínculo, que é o que faz o vínculo existir', () => {
  const cru = desafio();
  const comA = abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar.pendingChallenge;
  const comB = abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoB, AGORA).gravar.pendingChallenge;
  assert.notEqual(comA, comB);
});

test('a abertura grava o tipo e o prazo de cinco minutos', () => {
  const a = abrirCerimonia(ativa(), 'AUTHENTICATION', desafio(), semSessao, AGORA);
  assert.equal(a.gravar.pendingChallengeKind, 'AUTHENTICATION');
  assert.equal(a.gravar.pendingChallengeExpires, new Date(AGORA + JANELA_DO_DESAFIO_MS).toISOString());
  assert.equal(JANELA_DO_DESAFIO_MS, 5 * 60 * 1000);
});

test('identidade suspensa não abre cerimônia', () => {
  assert.throws(() => abrirCerimonia({ status: 'SUSPENDED' }, 'AUTHENTICATION', desafio(), semSessao, AGORA), CerimoniaInvalida);
  assert.throws(() => abrirCerimonia({ status: 'SUSPENDED' }, 'REGISTRATION', desafio(), sessaoA, AGORA), CerimoniaInvalida);
});

test('registrar autenticador exige sessão Master aberta', () => {
  assert.throws(() => abrirCerimonia(ativa(), 'REGISTRATION', desafio(), semSessao, AGORA), CerimoniaInvalida);
  assert.doesNotThrow(() => abrirCerimonia(ativa(), 'REGISTRATION', desafio(), sessaoA, AGORA));
});

test('vínculo de sessão vazio não vincula nada e é recusado', () => {
  assert.throws(() => abrirCerimonia(ativa(), 'REGISTRATION', desafio(), { tipo: 'SESSAO', tokenHash: '' }, AGORA), CerimoniaInvalida);
});

test('desafio curto é recusado na abertura, não aceito e guardado', () => {
  assert.throws(() => abrirCerimonia(ativa(), 'AUTHENTICATION', 'curto', semSessao, AGORA), CerimoniaInvalida);
  assert.throws(() => abrirCerimonia(ativa(), 'AUTHENTICATION', 'x'.repeat(MINIMO_DO_DESAFIO - 1), semSessao, AGORA), CerimoniaInvalida);
  assert.doesNotThrow(() => abrirCerimonia(ativa(), 'AUTHENTICATION', 'x'.repeat(MINIMO_DO_DESAFIO), semSessao, AGORA));
  assert.equal(MINIMO_DO_DESAFIO, 43, 'base64url de 32 bytes tem 43 caracteres');
});

// ------------------------------------------------------- caminho que funciona

test('a cerimônia aberta e apresentada pela mesma sessão é aceita', () => {
  const cru = desafio();
  const a = abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA);
  const linha = aplicar(ativa(), a.gravar);
  const c = consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + 1000);
  assert.equal(c.ok, true);
  assert.deepEqual(c.limpar, { pendingChallenge: null, pendingChallengeKind: null, pendingChallengeExpires: null });
});

test('autenticação sem sessão funciona: é antes de existir sessão', () => {
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'AUTHENTICATION', cru, semSessao, AGORA).gravar);
  assert.equal(consumirDesafio(linha, 'AUTHENTICATION', cru, semSessao, AGORA + 1000).ok, true);
});

// -------------------------------- os três casos exigidos: vencido, reusado,
// -------------------------------- apresentado em outra sessão

test('desafio VENCIDO é recusado', () => {
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);
  const c = consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + JANELA_DO_DESAFIO_MS);
  assert.equal(c.ok, false);
  assert.equal(c.recusa, 'DESAFIO_VENCIDO');
  // E um milissegundo antes ainda vale, para o limite não ser vago.
  assert.equal(consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + JANELA_DO_DESAFIO_MS - 1).ok, true);
});

test('desafio REUTILIZADO é recusado: a limpeza é o que torna o reuso impossível', () => {
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);

  const primeira = consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + 1000);
  assert.equal(primeira.ok, true);

  // O chamador grava `limpar` na mesma transação. A segunda tentativa encontra
  // a identidade sem cerimônia — e isso vale para o mesmo desafio, pelo mesmo
  // vínculo, dentro do prazo. Nada além da limpeza impediria o reuso.
  const depois = aplicar(linha, primeira.limpar);
  const segunda = consumirDesafio(depois, 'REGISTRATION', cru, sessaoA, AGORA + 2000);
  assert.equal(segunda.ok, false);
  assert.equal(segunda.recusa, 'SEM_CERIMONIA');
});

test('desafio apresentado em OUTRA SESSÃO é recusado, mesmo correto e no prazo', () => {
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);

  // A outra sessão tem o desafio cru — é o caso de quem interceptou. O que ela
  // não tem é o vínculo da sessão que abriu a cerimônia.
  const outra = consumirDesafio(linha, 'REGISTRATION', cru, sessaoB, AGORA + 1000);
  assert.equal(outra.ok, false);
  assert.equal(outra.recusa, 'DESAFIO_NAO_CONFERE');

  // E a sessão legítima continua conseguindo, para provar que a recusa é do
  // vínculo e não de algo que quebrou a cerimônia inteira.
  assert.equal(consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + 1000).ok, true);
});

// ----------------------------------------------------------- demais recusas

test('desafio trocado é recusado', () => {
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', desafio(), sessaoA, AGORA).gravar);
  const c = consumirDesafio(linha, 'REGISTRATION', desafio(), sessaoA, AGORA + 1000);
  assert.equal(c.recusa, 'DESAFIO_NAO_CONFERE');
});

test('desafio vazio é recusado sem comparar nada', () => {
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', desafio(), sessaoA, AGORA).gravar);
  for (const vazio of ['', null, undefined]) {
    assert.equal(consumirDesafio(linha, 'REGISTRATION', vazio, sessaoA, AGORA + 1000).recusa, 'DESAFIO_NAO_CONFERE');
  }
});

test('registro não autentica e autenticação não registra', () => {
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);
  assert.equal(consumirDesafio(linha, 'AUTHENTICATION', cru, sessaoA, AGORA + 1000).recusa, 'TIPO_DIVERGENTE');
});

test('sem cerimônia aberta não há o que consumir', () => {
  for (const vazio of [null, undefined, '']) {
    const c = consumirDesafio(ativa({ pendingChallenge: vazio }), 'REGISTRATION', desafio(), sessaoA, AGORA);
    assert.equal(c.recusa, 'SEM_CERIMONIA');
  }
});

test('desafio sem prazo gravado não vale para sempre', () => {
  const cru = desafio();
  const base = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);
  for (const ruim of [null, undefined, '', 'nunca']) {
    const c = consumirDesafio({ ...base, pendingChallengeExpires: ruim }, 'REGISTRATION', cru, sessaoA, AGORA);
    assert.equal(c.recusa, 'DESAFIO_VENCIDO', String(ruim));
  }
});

test('abrir cerimônia nova invalida a anterior: uma em curso por vez', () => {
  const primeiro = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', primeiro, sessaoA, AGORA).gravar);
  const segundo = desafio();
  const depois = aplicar(linha, abrirCerimonia(linha, 'REGISTRATION', segundo, sessaoA, AGORA + 10).gravar);

  assert.equal(consumirDesafio(depois, 'REGISTRATION', primeiro, sessaoA, AGORA + 20).recusa, 'DESAFIO_NAO_CONFERE');
  assert.equal(consumirDesafio(depois, 'REGISTRATION', segundo, sessaoA, AGORA + 20).ok, true);
});

test('as recusas por valor não dizem qual das três situações ocorreu', () => {
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);
  const trocado = consumirDesafio(linha, 'REGISTRATION', desafio(), sessaoA, AGORA + 1000);
  const outraSessao = consumirDesafio(linha, 'REGISTRATION', cru, sessaoB, AGORA + 1000);
  // Mensagens diferentes contariam a quem tenta qual das duas ele acertou.
  assert.equal(trocado.porque, outraSessao.porque);
  assert.equal(trocado.recusa, outraSessao.recusa);
});

test('nenhuma recusa vaza o digest, o desafio ou o vínculo', () => {
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);
  const casos = [
    consumirDesafio(ativa(), 'REGISTRATION', cru, sessaoA, AGORA),
    consumirDesafio(linha, 'AUTHENTICATION', cru, sessaoA, AGORA + 1000),
    consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + JANELA_DO_DESAFIO_MS),
    consumirDesafio(linha, 'REGISTRATION', cru, sessaoB, AGORA + 1000),
  ];
  for (const c of casos) {
    assert.equal(c.ok, false);
    assert.ok(!c.porque.includes(cru), c.porque);
    assert.ok(!c.porque.includes(linha.pendingChallenge), c.porque);
    assert.ok(!c.porque.includes(sessaoA.tokenHash), c.porque);
  }
});

test('os quatro motivos de recusa são distintos entre si', () => {
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);
  const motivos = [
    consumirDesafio(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).recusa,
    consumirDesafio(linha, 'AUTHENTICATION', cru, sessaoA, AGORA + 1000).recusa,
    consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + JANELA_DO_DESAFIO_MS).recusa,
    consumirDesafio(linha, 'REGISTRATION', cru, sessaoB, AGORA + 1000).recusa,
  ];
  assert.equal(new Set(motivos).size, 4);
});

// ----------------------------- lacuna encontrada pela rodada de mutação

test('a recusa por valor é uma frase fixa, sem nada do pedido dentro', () => {
  // A versão anterior comparava duas recusas que usavam o mesmo tipo de
  // vínculo: uma mensagem que citasse o tipo ficava igual nas duas e o teste
  // passava. Prender a frase exata é o que impede qualquer vazamento novo —
  // tipo do vínculo, nome de campo, contagem de caracteres.
  const cru = desafio();
  const linha = aplicar(ativa(), abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar);
  const FRASE = 'Não foi possível concluir. Comece novamente.';

  for (const c of [
    consumirDesafio(linha, 'REGISTRATION', desafio(), sessaoA, AGORA + 1000),
    consumirDesafio(linha, 'REGISTRATION', cru, sessaoB, AGORA + 1000),
    consumirDesafio(linha, 'REGISTRATION', cru, semSessao, AGORA + 1000),
    consumirDesafio(linha, 'REGISTRATION', '', sessaoA, AGORA + 1000),
  ]) {
    assert.equal(c.recusa, 'DESAFIO_NAO_CONFERE');
    assert.equal(c.porque, FRASE, 'a frase não pode variar com o pedido');
    assert.ok(!/SESSAO|SEM_SESSAO|vínculo|digest/i.test(c.porque));
  }
});

test('valor gravado curto ou truncado não pode ser aceito por prefixo', () => {
  // Achado por mutação: trocando a comparação completa por comparação de
  // prefixo, uma coluna truncada passa a ACEITAR a cerimônia. Uma coluna com
  // um caractere aceitaria qualquer desafio cujo digest comece por ele. A
  // guarda de tamanho é o que impede isso, e sem este teste nada a defendia.
  const cru = desafio();
  const inteiro = abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar.pendingChallenge;
  assert.equal(inteiro.length, 64, 'sha256 em hexadecimal: a coluna precisa caber 64 caracteres');

  for (const estragado of [inteiro.slice(0, 1), inteiro.slice(0, 32), inteiro.slice(0, 63), `${inteiro}extra`]) {
    const linha = aplicar(ativa(), {
      pendingChallenge: estragado,
      pendingChallengeKind: 'REGISTRATION',
      pendingChallengeExpires: new Date(AGORA + JANELA_DO_DESAFIO_MS).toISOString(),
    });
    const c = consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + 1000);
    assert.equal(c.ok, false, `aceitou com valor gravado de ${estragado.length} caracteres`);
    assert.equal(c.recusa, 'DESAFIO_NAO_CONFERE');
  }
});

test('valor gravado que difere apenas no ÚLTIMO caractere é recusado', () => {
  // Determinístico de propósito. Os casos com desafio aleatório só pegam uma
  // comparação parcial quando o primeiro dígito difere — cerca de quinze vezes
  // em dezesseis — e uma rodada de mutação passou por eles comparando só o
  // primeiro caractere. Aqui o valor gravado tem os 63 primeiros caracteres
  // idênticos, então só a comparação completa recusa.
  const cru = desafio();
  const correto = abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar.pendingChallenge;
  const ultimo = correto.slice(-1);
  const adulterado = correto.slice(0, -1) + (ultimo === '0' ? '1' : '0');

  assert.equal(adulterado.length, correto.length);
  assert.equal(adulterado.slice(0, 63), correto.slice(0, 63), 'difere só no último');
  assert.notEqual(adulterado, correto);

  const linha = aplicar(ativa(), {
    pendingChallenge: adulterado,
    pendingChallengeKind: 'REGISTRATION',
    pendingChallengeExpires: new Date(AGORA + JANELA_DO_DESAFIO_MS).toISOString(),
  });
  const c = consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + 1000);
  assert.equal(c.ok, false, 'comparação parcial aceitaria isto');
  assert.equal(c.recusa, 'DESAFIO_NAO_CONFERE');
});

test('e também quando difere apenas no caractere do meio', () => {
  const cru = desafio();
  const correto = abrirCerimonia(ativa(), 'REGISTRATION', cru, sessaoA, AGORA).gravar.pendingChallenge;
  const meio = correto[32];
  const adulterado = `${correto.slice(0, 32)}${meio === '0' ? '1' : '0'}${correto.slice(33)}`;
  const linha = aplicar(ativa(), {
    pendingChallenge: adulterado,
    pendingChallengeKind: 'REGISTRATION',
    pendingChallengeExpires: new Date(AGORA + JANELA_DO_DESAFIO_MS).toISOString(),
  });
  assert.equal(consumirDesafio(linha, 'REGISTRATION', cru, sessaoA, AGORA + 1000).ok, false);
});
