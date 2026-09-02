import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [profile, catalog, catalogStyles, presentation, eva] = await Promise.all([
  readFile(new URL('../lib/public-event-profile.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../components/public-event-presentation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/public-eva-support.tsx', import.meta.url), 'utf8'),
]);

test('catálogo aceita somente perfis canônicos e preserva opção ampla', () => {
  for (const code of [
    'SCIENTIFIC_EVENT',
    'CORPORATE_TRAINING',
    'FAIR_EXHIBITION',
    'ENTERTAINMENT',
    'SOCIAL_COMMUNITY',
    'OTHER',
  ]) assert.match(profile, new RegExp(code, 'u'));

  assert.match(catalog, /<select id="discovery-profile" name="profile" defaultValue=\{profile\}>/u);
  assert.match(catalog, /Todos os perfis/u);
  assert.match(catalog, /params\.set\('profile', input\.profile\)/u);
});

test('grade do catálogo reserva coluna para os quatro filtros e preserva reflow', () => {
  assert.match(
    catalogStyles,
    /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*14rem\),\s*1fr\)\)/u,
  );
  assert.match(catalogStyles, /\.field input,[\s\S]*min-width: 0;[\s\S]*width: 100%;/u);
  assert.match(catalogStyles, /@media \(min-width:\s*1100px\)[\s\S]*minmax\(0,\s*1\.5fr\)[\s\S]*minmax\(14rem,\s*1\.4fr\)/u);
  assert.match(catalogStyles, /@media \(max-width:\s*640px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u);
});

test('página pública diferencia tipo, formato e estimativa sem prometer inscrição', () => {
  assert.match(presentation, /<dt>Tipo<\/dt>/u);
  assert.match(presentation, /<dt>Formato<\/dt>/u);
  assert.match(presentation, /<dt>Público estimado<\/dt>/u);
  assert.match(presentation, /formatEstimatedAudience/u);
  assert.doesNotMatch(presentation, /Inscreva-se/u);
});

test('EVA explica somente fatos públicos e recusa inferir estimativa ausente', () => {
  assert.match(eva, /Que tipo de evento é\?/u);
  assert.match(eva, /não representa inscrição confirmada/u);
  assert.match(eva, /a EVA não deduz nem inventa esse dado/u);
  assert.doesNotMatch(eva, /organizationId|eventId|tenantId|organizationSecret/u);
});
