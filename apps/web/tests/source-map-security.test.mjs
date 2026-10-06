import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SourceMapConsumer, SourceMapGenerator } = require('source-map-js');
const leaf = { version: 3, sources: ['input.js'], names: [], mappings: 'AAAA' };
const indexed = (line, map = leaf) => ({ version: 3, sections: [{ offset: { line, column: 0 }, map }] });

test('indexed source map rejects excessive offsets before expanding mappings', () => {
  assert.throws(() => new SourceMapConsumer(indexed(10000001)), /must not exceed/);
});
test('nested section offsets cannot bypass the total bound', () => {
  assert.throws(() => new SourceMapConsumer(indexed(6000000, indexed(6000000))), /including offsets of nested sections/);
});
test('malformed offsets cannot enter indexed mappings', () => {
  for (const line of [-1, 0.5, Infinity, NaN, '5']) {
    assert.throws(() => new SourceMapConsumer(indexed(line)), /non-negative integers/);
  }
});
test('legitimate indexed maps retain original positions and generated mappings', () => {
  const consumer = new SourceMapConsumer(indexed(2));
  const mappings = [];
  const generator = new SourceMapGenerator();
  consumer.eachMapping((mapping) => {
    mappings.push(mapping);
    generator.addMapping({ generated: { line: mapping.generatedLine, column: mapping.generatedColumn }, original: { line: mapping.originalLine, column: mapping.originalColumn }, source: mapping.source });
  });
  assert.deepEqual(mappings, [{ source: 'input.js', generatedLine: 3, generatedColumn: 0, originalLine: 1, originalColumn: 0, name: null }]);
  const generated = generator.toJSON();
  assert.equal(generated.mappings, ';;AAAA');
  assert.deepEqual(new SourceMapConsumer(generated).originalPositionFor({ line: 3, column: 0 }), { source: 'input.js', line: 1, column: 0, name: null });
});
