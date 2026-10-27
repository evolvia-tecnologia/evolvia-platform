import { loadPublicationSource } from './helpers/publication-source.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { applyFormat } = await loadPublicationSource('publication-rich-text-format');

for (const prefix of ['# ', '## ', '### ']) {
  test(`título existente com prefixo ${prefix.length - 1} preserva texto e seleção`, () => {
    const value = `Antes\n${prefix}Título\nDepois`;
    const start = value.indexOf('Título');
    const result = applyFormat(value, start, start + 2, 'heading');
    assert.equal(result.next, value);
    assert.equal(result.next.slice(result.from, result.to), 'Título');
    assert.equal(result.from, start);
  });
}
test('título novo seleciona somente o conteúdo e preserva linhas vizinhas', () => {
  const result = applyFormat('Antes\nTítulo\nDepois', 7, 9, 'heading');
  assert.equal(result.next, 'Antes\n## Título\nDepois');
  assert.equal(result.next.slice(result.from, result.to), 'Título');
});
test('título vazio oferece texto selecionado para substituir', () => {
  const result = applyFormat('', 0, 0, 'heading');
  assert.equal(result.next, '## Título');
  assert.equal(result.next.slice(result.from, result.to), 'Título');
});
test('negrito, itálico, lista e link mantêm suas seleções', () => {
  for (const mode of ['bold', 'italic', 'link']) {
    const result = applyFormat('Olá mundo', 4, 9, mode);
    assert.equal(result.next.slice(result.from, result.to), mode === 'link' ? 'https://' : 'mundo');
  }
  assert.equal(applyFormat('um\ndois', 0, 7, 'list').next, '- um\n- dois');
});
test('alinhamento e span editorial preservam seleção', () => {
  const centered = applyFormat('Linha\nTexto', 6, 11, 'alignCenter');
  assert.equal(centered.next, 'Linha\n@center Texto');
  assert.equal(centered.next.slice(centered.from, centered.to), 'Texto');
  const styled = applyFormat('Olá mundo', 4, 9, 'color:blue');
  assert.match(styled.next, /\[\[fmt sans 16 blue\]\]mundo\[\[\/fmt\]\]/u);
});

