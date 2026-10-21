import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('inscrição e área do participante do evento usam o cabeçalho público com skip link focável', async () => {
  for (const [path, target] of [
    ['app/evento/[slug]/inscricao/page.tsx', 'registration-main'],
    ['app/evento/[slug]/participante/page.tsx', 'participant-main'],
  ]) {
    const source = await read(path);
    assert.match(source, new RegExp(`className="skip-link" href="#${target}"`, 'u'), path);
    assert.match(source, /<PublicSiteHeader current="evento" \/>/u, path);
    assert.match(source, new RegExp(`<div id="${target}" tabIndex=\\{-1\\}>`, 'u'), path);
    assert.ok(source.indexOf('skip-link') < source.indexOf('<PublicSiteHeader'), `${path}: skip link precede o cabeçalho`);
  }
});

test('área do participante do evento não é indexada e mantém o acesso sem token na rota', async () => {
  const source = await read('app/evento/[slug]/participante/page.tsx');
  assert.match(source, /robots: \{ index: false, follow: false \}/u);
  assert.match(source, /<ParticipantArea slug=\{slug\}/u);
  assert.match(source, /initialProfileCode=\{profile\.profileCode\}/u);
  assert.doesNotMatch(source, /initialAccessToken|searchParams|token/u);
});

test('formulário e área do participante já oferecem retorno ao evento nos estados sem sessão', async () => {
  const [form, area] = await Promise.all([
    read('components/public-registration-form.tsx'),
    read('components/participant-area.tsx'),
  ]);
  assert.match(form, /Inscrição indisponível[\s\S]*Voltar ao evento/u);
  assert.match(form, /← Voltar ao evento/u);
  assert.match(area, /← Voltar ao evento/u);
});
