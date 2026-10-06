import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EVENT_PROFILE_GROUPS } from '../lib/event-profile-catalog.ts';

const ALLOWED_HOME_HREFS = [
  '#main-content',
  '/cadastro',
  '/eventos',
  '/termos-de-uso',
  '/privacidade',
];

const FORBIDDEN_HOME_CTA = [
  /Inscreva-se/u,
  /recuperar senha/iu,
  /redefinir senha/iu,
  /esqueci (a|minha) senha/iu,
  /href=["']\/api\//u,
  /checkout/iu,
  /pagamento/iu,
  /organizationId|eventId|tenantId|organizationSecret/u,
];

async function homeSource() {
  return readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
}

async function homeStyles() {
  return readFile(new URL('../app/home-viewport.module.css', import.meta.url), 'utf8');
}

async function profileCatalogSource() {
  return readFile(new URL('../lib/event-profile-catalog.ts', import.meta.url), 'utf8');
}

function collectHrefs(source) {
  return [...source.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
}

test('Home e Wizard compartilham um único catálogo de perfis', async () => {
  const [home, catalog] = await Promise.all([homeSource(), profileCatalogSource()]);

  assert.match(home, /EVENT_PROFILE_GROUPS, findEventProfileGroup/u);
  assert.match(home, /EVENT_PROFILE_GROUPS\.map/u);
  assert.match(home, /activeGroup\.options\.map/u);

  for (const group of [
    'Científicos e acadêmicos',
    'Corporativos e capacitação',
    'Feiras e exposições',
    'Entretenimento',
    'Comunidades, causas e esportes',
    'Outros perfis',
  ]) {
    assert.match(catalog, new RegExp(group, 'u'), group);
  }
});

test('Home revela tipos progressivamente e permite retornar aos perfis', async () => {
  const source = await homeSource();

  assert.match(source, /activeGroup \? <>/u);
  assert.match(source, /Escolha primeiro um perfil para ver somente os tipos relacionados\./u);
  assert.match(source, /← Escolher outro perfil/u);
  assert.match(source, /function returnToGroups\(\)/u);
  assert.match(source, /clearPersistedEventType\(\)/u);
});

test('Home restaura e persiste somente tipos válidos do catálogo', async () => {
  const source = await homeSource();

  assert.match(source, /findEventProfileGroup\(parsed\.eventType\)/u);
  assert.match(source, /setActiveGroupId\(findEventProfileGroup\(persistedEventType\)\?\.id \?\? ''\)/u);
  assert.match(source, /JSON\.stringify\(\{ \.\.\.previous, eventType \}\)/u);
});

test('seletores públicos mantêm nome, estado e anúncio para tecnologia assistiva', async () => {
  const source = await homeSource();

  assert.match(source, /role="group"/u);
  assert.match(source, /aria-labelledby="event-type-question"/u);
  assert.match(source, /aria-describedby="event-group-description"/u);
  assert.match(source, /aria-pressed=\{selected\}/u);
  assert.match(source, /aria-live="polite"/u);
});

test('home mantém um único main e hierarquia h1 → h2 sem pular nível', async () => {
  const source = await homeSource();

  assert.equal([...source.matchAll(/<main\b/gu)].length, 1);
  assert.match(source, /<a className="skip-link" href="#main-content">Pular para o conteúdo principal<\/a>/u);
  assert.match(source, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.match(source, /<section className="container hero" aria-labelledby="home-hero-title">/u);
  assert.match(source, /<h1 id="home-hero-title">Seu evento começa com uma conversa\.<\/h1>/u);
  assert.match(source, /<h2[\s\S]*id="event-type-question"[\s\S]*tabIndex=\{-1\}/u);
  assert.ok(
    source.indexOf('<h1 id="home-hero-title">') < source.indexOf('id="event-type-question"'),
    'h1 precisa preceder o h2 da EVA',
  );
  assert.doesNotMatch(source, /<h[3-6]\b/u);
  assert.doesNotMatch(source, /<main[\s\S]*<main\b/u);
});

test('perfis e tipos expõem nome e descrição úteis sem depender de ícone ou cor', async () => {
  const source = await homeSource();

  assert.equal(EVENT_PROFILE_GROUPS.length, 6);
  for (const group of EVENT_PROFILE_GROUPS) {
    assert.ok(group.label.trim(), group.id);
    assert.ok(group.description.trim(), group.id);
    for (const option of group.options) {
      assert.ok(option.title.trim(), option.value);
      assert.ok(option.description.trim(), option.value);
      assert.notEqual(option.title, option.icon, option.value);
    }
  }

  assert.match(source, /<strong className=\{styles\.profileName\}>\{group\.label\}<\/strong>/u);
  assert.match(source, /<span className=\{styles\.profileDescription\}>\{group\.description\}<\/span>/u);
  assert.match(source, /<strong className=\{styles\.profileName\}>\{profile\.title\}<\/strong>/u);
  assert.match(source, /<span className=\{styles\.profileDescription\}>\{profile\.description\}<\/span>/u);
  assert.match(source, /Selecionado/u);
  assert.match(source, /aria-hidden="true">Selecionado/u);
  assert.doesNotMatch(source, /profile\.icon|group\.icon/u);
  assert.doesNotMatch(source, /className="profile-icon"/u);
});

test('teclado move o foco para a pergunta e mantém alvo e foco visível', async () => {
  const [source, css] = await Promise.all([homeSource(), homeStyles()]);

  assert.match(source, /const questionRef = useRef<HTMLHeadingElement>\(null\)/u);
  assert.match(source, /shouldFocusQuestion\.current = true/u);
  assert.match(source, /questionRef\.current\?\.focus\(\)/u);
  assert.match(source, /type="button"/u);
  assert.match(source, /aria-pressed=\{selected\}/u);
  assert.match(css, /\.primaryActions :global\(a\) \{[\s\S]*min-height: 44px/u);
  assert.match(css, /\.profileOption \{[\s\S]*min-height: 44px/u);
  assert.match(css, /\.legalFooter a \{[\s\S]*min-height: 44px/u);
  assert.match(css, /\.primaryActions :global\(a\):focus-visible \{[\s\S]*outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.viewport :global\(\.option\):focus-visible \{[\s\S]*outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.question:focus-visible \{[\s\S]*outline: 3px solid var\(--color-focus-on-dark\)/u);
  assert.doesNotMatch(source, /onKeyDown|onKeyPress|tabIndex=\{0\}/u);
});

test('CTAs da home apontam só para rotas públicas existentes', async () => {
  const source = await homeSource();
  const hrefs = collectHrefs(source);

  assert.deepEqual([...new Set(hrefs)], ALLOWED_HOME_HREFS);
  assert.match(source, /href="\/cadastro">Começar meu evento<\/Link>/u);
  assert.match(source, /href="\/eventos">Explorar eventos<\/Link>/u);
  assert.match(source, /href="\/termos-de-uso">Termos de Uso<\/Link>/u);
  assert.match(source, /href="\/privacidade">Privacidade<\/Link>/u);

  for (const pattern of FORBIDDEN_HOME_CTA) {
    assert.doesNotMatch(source, pattern, String(pattern));
  }
});

test('estados da prévia permanecem no componente existente e a home não inventa vitrine paralela', async () => {
  const source = await homeSource();

  assert.match(source, /<PublicEventsPreview \/>/u);
  assert.match(source, /from '\.\.\/components\/public-events-preview'/u);
  assert.doesNotMatch(source, /Buscando eventos publicados/u);
  assert.doesNotMatch(source, /A vitrine está temporariamente indisponível/u);
  assert.doesNotMatch(source, /Novos eventos aparecerão aqui quando forem publicados/u);
  assert.doesNotMatch(source, /fetch\(['"]\/api\/public\/events/u);
  assert.doesNotMatch(source, /href=["']\/api\/public\/events/u);
});

test('reflow 1366/768/390/320 quebra texto e empilha CTA sem cortar conteúdo', async () => {
  const css = await homeStyles();

  assert.match(css, /\.intro,[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /\.profileOption \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.primaryActions \{[\s\S]*flex-wrap: wrap/u);
  assert.match(css, /@media \(max-width: 768px\) \{[\s\S]*\.viewport :global\(\.hero\) \{[\s\S]*min-height: auto/u);
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*\.viewport :global\(\.hero\) \{[\s\S]*min-height: auto[\s\S]*\.primaryActions \{[\s\S]*flex-direction: column/u);
  assert.match(css, /@media \(max-width: 390px\) \{[\s\S]*\.viewport :global\(\.hero-card\) \{[\s\S]*padding:var\(--space-16\)/u);
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*min-height: auto/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
  assert.doesNotMatch(css, /-webkit-line-clamp/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
});

test('casos negativos rejeitam segundo main, heading pulado, ícone-só e CTA de backend inexistente', async () => {
  const [source, css] = await Promise.all([homeSource(), homeStyles()]);

  assert.notEqual([...source.matchAll(/<main\b/gu)].length, 2);
  assert.doesNotMatch(source, /<h1[\s\S]*<h3\b/u);
  assert.doesNotMatch(source, /<button[^>]*>\s*\{profile\.icon\}\s*<\/button>/u);
  assert.doesNotMatch(source, /<button[^>]*>\s*\{group\.icon\}\s*<\/button>/u);
  assert.doesNotMatch(source, /aria-pressed=\{false\}/u);
  assert.doesNotMatch(source, /shouldFocusQuestion\.current = true[\s\S]*setSelectedEventType\(persistedEventType\)/u);
  assert.doesNotMatch(css, /outline:\s*none/u);
  assert.doesNotMatch(css, /min-height:\s*(?:1[0-9]|2[0-9]|3[0-9]|40|41|42|43)px/u);
  assert.doesNotMatch(source, /href=["']https?:\/\//u);
});
