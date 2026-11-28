/**
 * G6.8 — conversão do corpo do rascunho para o que chega ao destinatário.
 *
 * O QUE ESTES CASOS IMPEDEM DE VOLTAR
 * -----------------------------------
 * `deliver()` enviava `text: row.batch.body`, e `body` é o formato serializado
 * do editor. O destinatário recebia `[[fmt serif 24 blue]]` literalmente no
 * meio da mensagem. O primeiro caso é exatamente esse.
 *
 * Os casos de segurança são o resto: valor de fonte, tamanho ou cor que não
 * esteja nos conjuntos fechados NÃO pode virar atributo, e nenhum texto pode
 * chegar ao HTML sem escape. Um conversor que interpolasse a cor direto no
 * `style` passaria no primeiro caso e falharia nestes — é essa a diferença que
 * eles prendem.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { converterCorpoDaComunicacao, escaparHtml } from '../src/event-communication-content.ts';

test('O CASO DO BUG: marcador do editor nao chega ao destinatario', () => {
  const corpo = '[[fmt serif 24 blue]]Bem-vindo ao congresso[[/fmt]]\nAte sabado.';
  const r = converterCorpoDaComunicacao(corpo);
  assert.equal(r.textoSimples, 'Bem-vindo ao congresso\nAte sabado.');
  assert.equal(r.confiavel, true);
  assert.equal(r.motivo, null);
  assert.doesNotMatch(r.textoSimples, /\[\[/u, 'marcador vazou para o texto simples');
  assert.doesNotMatch(r.html, /\[\[/u, 'marcador vazou para o HTML');
});

test('o estilo permitido vira atributo, com fonte do conjunto e tamanho em px', () => {
  const r = converterCorpoDaComunicacao('[[fmt serif 24 blue]]Titulo[[/fmt]]');
  assert.equal(r.confiavel, true);
  assert.match(r.html, /font-family:serif/u);
  assert.match(r.html, /font-size:24px/u);
  assert.match(r.html, /data-evolvia-cor="blue"/u);
  assert.match(r.html, />Titulo<\/span>/u);
  assert.deepEqual(r.trechos, [{ texto: 'Titulo', estilo: { fonte: 'serif', tamanho: 24, cor: 'blue' } }]);
});

test('sans vira sans-serif, e nao o literal da entrada', () => {
  const r = converterCorpoDaComunicacao('[[fmt sans 12 muted]]x[[/fmt]]');
  assert.match(r.html, /font-family:sans-serif/u);
  assert.doesNotMatch(r.html, /font-family:sans;/u);
});

test('SEGURANCA: cor fora do conjunto nao vira atributo e o corpo fica nao confiavel', () => {
  const r = converterCorpoDaComunicacao('[[fmt sans 12 vermelho-inventado]]x[[/fmt]]');
  assert.equal(r.confiavel, false);
  assert.equal(r.motivo, 'formatacao_nao_permitida');
  assert.doesNotMatch(r.html, /vermelho-inventado/u, 'valor da entrada vazou para o HTML');
  assert.doesNotMatch(r.html, /<span/u, 'emitiu estilo para formatacao nao permitida');
  assert.equal(r.textoSimples, 'x');
});

test('SEGURANCA: tentativa de escapar do atributo nao casa a gramatica e nao emite estilo', () => {
  for (const corpo of [
    '[[fmt sans 12 blue" onload="alert(1)]]x[[/fmt]]',
    '[[fmt sans 12 blue;background:url(javascript:1)]]x[[/fmt]]',
    "[[fmt sans 12 blue' onmouseover='x]]y[[/fmt]]",
    '[[fmt sans 999 blue]]x[[/fmt]]',
    '[[fmt Sans 12 blue]]x[[/fmt]]',
  ]) {
    const r = converterCorpoDaComunicacao(corpo);
    assert.equal(r.confiavel, false, corpo);
    assert.doesNotMatch(r.html, /<span/u, `emitiu estilo para: ${corpo}`);
    assert.doesNotMatch(r.html, /onload|onmouseover|javascript:/u, `payload vazou: ${corpo}`);
  }
});

test('SEGURANCA: todo texto e escapado no HTML, inclusive o que a validacao de entrada proibiria', () => {
  const r = converterCorpoDaComunicacao('a < b & c > d "cita" \'simples\'');
  assert.equal(r.html, 'a &lt; b &amp; c &gt; d &quot;cita&quot; &#39;simples&#39;');
  // o texto simples NAO e escapado: ele vai em message.text, nao em HTML
  assert.equal(r.textoSimples, 'a < b & c > d "cita" \'simples\'');
});

test('escaparHtml cobre os cinco, e o & primeiro para nao escapar duas vezes', () => {
  assert.equal(escaparHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escaparHtml('&amp;'), '&amp;amp;');
});

test('gramatica quebrada devolve motivo proprio e nao lanca — o worker nao pode cair', () => {
  const casos = [
    ['[[fmt sans 12 blue]]a', 'formatacao_sem_fechamento'],
    ['a[[/fmt]]', 'fechamento_sem_abertura'],
    ['[[fmt sans 12 blue]]a[[fmt serif 14 navy]]b[[/fmt]]', 'formatacao_aninhada'],
  ];
  for (const [corpo, esperado] of casos) {
    const r = converterCorpoDaComunicacao(corpo);
    assert.equal(r.confiavel, false, corpo);
    assert.equal(r.motivo, esperado, corpo);
  }
});

test('o motivo nunca carrega o corpo — audit sem dado de mensagem', () => {
  const r = converterCorpoDaComunicacao('[[fmt sans 12 blue]]SEGREDO DO PARTICIPANTE');
  assert.equal(r.confiavel, false);
  assert.doesNotMatch(r.motivo, /SEGREDO/u);
});

test('entrada que nao e texto nao confia, e nao lanca', () => {
  for (const corpo of [null, undefined, 42, {}, [], true]) {
    const r = converterCorpoDaComunicacao(corpo);
    assert.equal(r.confiavel, false);
    assert.equal(r.motivo, 'corpo_nao_e_texto');
    assert.equal(r.textoSimples, '');
    assert.equal(r.html, '');
  }
});

test('varios trechos preservam a ordem e o texto fora de formatacao', () => {
  const r = converterCorpoDaComunicacao('Ola [[fmt serif 18 navy]]nome[[/fmt]], tudo bem? [[fmt sans 14 muted]]rodape[[/fmt]]');
  assert.equal(r.confiavel, true);
  assert.equal(r.textoSimples, 'Ola nome, tudo bem? rodape');
  assert.deepEqual(r.trechos.map((t) => [t.texto, t.estilo?.cor ?? null]), [
    ['Ola ', null], ['nome', 'navy'], [', tudo bem? ', null], ['rodape', 'muted'],
  ]);
});

test('CRLF e normalizado para LF, como na entrada', () => {
  const r = converterCorpoDaComunicacao('linha1\r\nlinha2');
  assert.equal(r.textoSimples, 'linha1\nlinha2');
  assert.equal(r.confiavel, true);
});

test('corpo vazio e confiavel e nao inventa conteudo', () => {
  const r = converterCorpoDaComunicacao('');
  assert.equal(r.confiavel, true);
  assert.equal(r.textoSimples, '');
  assert.equal(r.html, '');
  assert.deepEqual(r.trechos, []);
});
