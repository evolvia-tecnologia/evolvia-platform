import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('documentos jurídicos permanecem minutas não vigentes até aprovação', async () => {
  const [registry, component, terms, privacy] = await Promise.all([
    source('../lib/legal-documents.ts'),
    source('../components/legal-document-page.tsx'),
    source('../app/termos-de-uso/page.tsx'),
    source('../app/privacidade/page.tsx'),
  ]);

  assert.match(registry, /status: 'REVIEW_REQUIRED'/u);
  assert.match(registry, /effectiveAt: null/u);
  assert.match(registry, /version: '0\.1-minuta'/u);
  assert.match(component, /Minuta técnica para homologação — não vigente\./u);
  assert.match(component, /não registra aceite/u);
  assert.match(terms, /title: 'Termos de Uso — minuta em homologação'/u);
  assert.match(privacy, /title: 'Política de Privacidade — minuta em homologação'/u);
  assert.doesNotMatch(terms, /\| Evolvia/u);
  assert.doesNotMatch(privacy, /\| Evolvia/u);
  assert.match(terms, /robots: \{ index: false, follow: false \}/u);
  assert.match(privacy, /robots: \{ index: false, follow: false \}/u);
});

test('cadastro não fabrica aceite antes de existir documento aprovado', async () => {
  const [page, dto] = await Promise.all([
    source('../app/cadastro/page.tsx'),
    source('../../api/src/auth/register.dto.ts'),
  ]);

  assert.doesNotMatch(page, /type="checkbox"/u);
  assert.doesNotMatch(page, /acceptedTerms|consentVersion|legalDocumentVersion/u);
  assert.doesNotMatch(dto, /acceptedTerms|consentVersion|legalDocumentVersion/u);
  assert.match(page, /JSON\.stringify\(\{[\s\S]*name: normalizedName\(name\),[\s\S]*email: email\.trim\(\)\.toLowerCase\(\),[\s\S]*password,[\s\S]*\}\)/u);
});

test('jornadas públicas e de conta apontam para as rotas canônicas', async () => {
  const [home, footer, login, cadastro] = await Promise.all([
    source('../app/page.tsx'),
    source('../components/public-site-footer.tsx'),
    source('../app/login/page.tsx'),
    source('../app/cadastro/page.tsx'),
  ]);

  assert.match(home, /from ['"].*public-site-footer['"]/u);
  assert.match(home, /<PublicSiteFooter \/>/u);
  for (const page of [footer, login, cadastro]) {
    assert.match(page, /href="\/termos-de-uso"/u);
    assert.match(page, /href="\/privacidade"/u);
    assert.match(page, /aria-label="Documentos jurídicos"/u);
  }
});

test('minutas não são indexadas nem incluídas no sitemap', async () => {
  const [robots, sitemap] = await Promise.all([
    source('../app/robots.ts'),
    source('../app/sitemap.ts'),
  ]);

  assert.match(robots, /'\/termos-de-uso'/u);
  assert.match(robots, /'\/privacidade'/u);
  assert.doesNotMatch(sitemap, /termos-de-uso|privacidade/u);
});

test('página jurídica mantém estrutura semântica e referências oficiais', async () => {
  const [registry, component] = await Promise.all([
    source('../lib/legal-documents.ts'),
    source('../components/legal-document-page.tsx'),
  ]);

  assert.match(component, /<article/u);
  assert.match(component, /role="status"/u);
  assert.match(component, /<dl/u);
  assert.match(component, /<h2/u);
  assert.match(component, /aria-label="Documentos jurídicos"/u);
  assert.match(registry, /planalto\.gov\.br/u);
  assert.match(registry, /gov\.br\/anpd/u);
});
