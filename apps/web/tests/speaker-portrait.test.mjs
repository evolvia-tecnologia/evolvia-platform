import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('cadastro do convidado oferece foto https e não publica rede social', () => {
  const guests = read('../components/scientific-guests.tsx');
  assert.match(guests, /Foto pública/u);
  assert.match(guests, /Salvar foto/u);
  assert.match(guests, /publicPortraitUrl\(guest\.portraitUrl\)/u);
  assert.match(guests, /method: 'PATCH'/u);
  assert.doesNotMatch(guests, /websiteUrl|linkedinUrl|localStorage/);
  const css = read('../components/scientific-guests.module.css');
  assert.match(css, /\.portraitSave[\s\S]*min-height: 44px/u);
  assert.match(css, /\.portraitSave:disabled[\s\S]*cursor: not-allowed/u);
});

test('programação pública descreve a foto pelo nome e não busca o arquivo no servidor', () => {
  const program = read('../components/public-event-program.tsx');
  assert.match(program, /alt=\{`Foto de \$\{person\.name\}`\}/u);
  assert.match(program, /referrerPolicy="no-referrer"/u);
  assert.doesNotMatch(program, /websiteUrl|linkedinUrl/);
  const css = read('../components/public-event-program.module.css');
  assert.match(css, /\.portrait[\s\S]*object-fit: cover/u);
});
