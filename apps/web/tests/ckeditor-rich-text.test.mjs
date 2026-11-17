import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPublicationSource } from './helpers/publication-source.mjs';

const { markupToHtml, htmlToMarkup } = await loadPublicationSource('ckeditor-rich-text');
const { parsePublicRichText } = await loadPublicationSource('public-rich-text');

function same(markup) {
  const next = htmlToMarkup(markupToHtml(markup));
  assert.equal(next == null, false);
  assert.deepEqual(parsePublicRichText(next), parsePublicRichText(markup));
}

function sameFromHtml(html, markup) {
  const next = htmlToMarkup(html);
  assert.equal(next == null, false);
  assert.deepEqual(parsePublicRichText(next), parsePublicRichText(markup));
}

test('título, negrito, itálico, lista e link sobrevivem à ida e volta', () => {
  same('## Para quem é\n\n- **Associados** da área\n- Interessados\n\nVeja o [site](https://evento.example.com/pagina).');
  same('Texto com *ênfase* e **força**.');
});

test('alinhamento, fonte, tamanho e cor da paleta sobrevivem à ida e volta', () => {
  same('@center [[fmt serif 20 blue]]Título[[/fmt]]');
  same('@right [[fmt sans 14 muted]]Nota[[/fmt]]');
  same('[[fmt serif 24 navy]]Antes[[/fmt]] e depois');
});

test('html colado não entra no texto gravado', () => {
  assert.equal(htmlToMarkup('<p><script>alert(1)</script>Olá</p>'), 'Olá');
  assert.equal(htmlToMarkup('<p><a href="javascript:alert(1)">clique</a></p>'), 'clique');
  assert.equal(htmlToMarkup('<p><a href="https://localhost/mapa">local</a></p>'), 'local');
  assert.equal(htmlToMarkup('<p></p>'), '');
});

test('negrito e itálico gravados pelo editor visual voltam à marcação', () => {
  sameFromHtml('<h2>Título</h2><p>Texto <strong>forte</strong> e <i>leve</i>.</p>', '## Título\n\nTexto **forte** e *leve*.');
  sameFromHtml('<p><b>aviso</b></p>', '**aviso**');
});

test('fechamento órfão não tira o negrito do texto seguinte', () => {
  assert.equal(htmlToMarkup('<p>Antes </naoexiste><strong>Depois</strong></p>'), 'Antes **Depois**');
});

test('entidade numérica inválida não interrompe a conversão', () => {
  assert.equal(htmlToMarkup('<p>&#999999999;&#xD800;A&#233;</p>'), 'Aé');
});

test('lista numerada e parágrafos separados permanecem blocos', () => {
  same('Primeira linha\nsegunda linha\n\nOutro parágrafo');
  same('1. Um\n2. Dois');
});
