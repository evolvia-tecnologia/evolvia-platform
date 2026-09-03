import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function componentSource() {
  return readFile(new URL('../components/public-events-preview.tsx', import.meta.url), 'utf8');
}

async function cssSource() {
  return readFile(new URL('../components/public-events-preview.module.css', import.meta.url), 'utf8');
}

// ── Estado: carregamento ──────────────────────────────────────────────────────

test('estado de carregamento anuncia progresso sem animação obrigatória', async () => {
  const source = await componentSource();

  assert.match(source, /aria-busy=\{state\.status === 'loading'\}/u,
    'seção deve declarar aria-busy durante carregamento');
  assert.match(source, /status === 'loading'[\s\S]{0,60}role="status"/u,
    'indicador de carregamento deve usar role="status"');
  assert.match(source, /Buscando eventos publicados/u,
    'mensagem de carregamento em PT-BR deve estar presente');
  assert.doesNotMatch(source, /animation:|@keyframes/u,
    'não deve impor animação obrigatória ao carregamento');
});

test('estado de carregamento não emite foco automático', async () => {
  const source = await componentSource();
  assert.doesNotMatch(source, /autoFocus|\.focus\(\)/u,
    'foco automático não deve ser disparado pelo componente');
});

// ── Estado: erro ─────────────────────────────────────────────────────────────

test('estado de erro exibe mensagem amigável em PT-BR sem payload técnico', async () => {
  const source = await componentSource();

  assert.match(source, /status === 'error'/u, 'ramificação de erro deve existir');
  assert.match(source, /temporariamente indisponível/ui,
    'mensagem de erro amigável em PT-BR deve estar presente');
  // garante que strings internas de erro não aparecem no markup renderizado para o usuário
  const errorBlock = source.match(/status === 'error'[\s\S]{0,600}\/\}/u)?.[0] ?? '';
  assert.doesNotMatch(errorBlock, /public-events-unavailable|public-events-invalid/u,
    'payload técnico de erro não deve vazar para o markup renderizado ao usuário');
});

test('estado de erro oferece ação de recuperação (catálogo ou tentar novamente)', async () => {
  const source = await componentSource();

  const errorBlock = source.match(/status === 'error'[\s\S]{0,400}/u)?.[0] ?? '';
  const hasLink = /href=["'][^"']*eventos[^"']*["']/u.test(errorBlock)
    || /href=["'][^"']*\/eventos["']/u.test(source.slice(source.indexOf("status === 'error'"), source.indexOf("status === 'error'") + 400));
  assert.ok(hasLink, 'estado de erro deve conter link para o catálogo de eventos');
});

test('estado de erro usa role semântico adequado', async () => {
  const source = await componentSource();
  const errorRegion = source.match(/status === 'error'[\s\S]{0,300}/u)?.[0] ?? '';
  assert.match(errorRegion, /role="status"|role="alert"/u,
    'bloco de erro deve ter role="status" ou role="alert"');
});

// ── Estado: vazio ─────────────────────────────────────────────────────────────

test('estado vazio comunica ausência de eventos e sugere próxima ação', async () => {
  const source = await componentSource();

  assert.match(source, /events\.length === 0/u, 'ramificação de lista vazia deve existir');
  assert.match(source, /aparecerão aqui|forem publicados/ui,
    'mensagem de vazio deve explicar quando eventos aparecerão');
  assert.match(source, /Evolvia|organizar o seu evento|catálogo/ui,
    'estado vazio deve sugerir próxima ação ao usuário');
});

test('estado vazio não exibe botão para rota inexistente', async () => {
  const source = await componentSource();

  const emptyBlock = source.match(/events\.length === 0[\s\S]{0,500}/u)?.[0] ?? '';
  assert.doesNotMatch(emptyBlock, /href="\/criar|href="\/novo|href="\/organizar/u,
    'CTA do estado vazio não deve apontar para rotas que não existem');
});

// ── Estado: sucesso ───────────────────────────────────────────────────────────

test('estado de sucesso renderiza região nomeada com cards acessíveis', async () => {
  const source = await componentSource();

  assert.match(source, /aria-labelledby="public-events-title"/u,
    'seção deve estar associada a título via aria-labelledby');
  assert.match(source, /<article[\s\S]{0,20}className=\{styles\.card\}/u,
    'cada evento deve ser marcado como article');
  assert.match(source, /<h3>/u, 'título do card deve usar h3');
});

test('estado de sucesso exibe data legível formatada', async () => {
  const source = await componentSource();

  assert.match(source, /formatEventDate/u,
    'data do evento deve ser formatada com formatEventDate');
  assert.match(source, /dateStyle: 'medium'/u,
    'formatação de data deve usar dateStyle medium para legibilidade');
});

test('estado de sucesso apresenta link com aria-label descritivo por card', async () => {
  const source = await componentSource();

  assert.match(source, /aria-label=\{'Ver informações de '\s*\+\s*event\.name\}/u,
    'link do card deve ter aria-label que identifica o evento pelo nome');
});

test('estado de sucesso não exibe indicador de em andamento em texto oculto', async () => {
  const source = await componentSource();

  assert.match(source, /Em andamento/u,
    'badge de em-andamento deve estar presente para eventos ativos');
  assert.match(source, /isInProgress/u,
    'lógica isInProgress deve ser utilizada');
});

// ── Acessibilidade estrutural ─────────────────────────────────────────────────

test('componente usa <section> com região nomeada', async () => {
  const source = await componentSource();
  assert.match(source, /<section[^>]*aria-labelledby="public-events-title"/u,
    'elemento raiz deve ser section com aria-labelledby');
});

test('título da região está declarado como h2 com id correto', async () => {
  const source = await componentSource();
  assert.match(source, /<h2 id="public-events-title">/u,
    'heading da seção deve ser h2 com id="public-events-title"');
});

test('AbortController cancela fetch quando o componente é desmontado', async () => {
  const source = await componentSource();
  assert.match(source, /AbortController/u, 'deve criar AbortController');
  assert.match(source, /controller\.abort\(\)/u, 'deve chamar abort no cleanup do useEffect');
  assert.match(source, /AbortError/u, 'deve ignorar erros de AbortError');
});

// ── CSS: reflow e forced-colors ───────────────────────────────────────────────

test('CSS define grid responsivo para 3 e 2 colunas com breakpoints', async () => {
  const css = await cssSource();
  assert.match(css, /repeat\(3,\s*minmax\(0,\s*1fr\)\)/u,
    'grid de 3 colunas deve estar definido');
  assert.match(css, /repeat\(2,\s*minmax\(0,\s*1fr\)\)/u,
    'grid de 2 colunas para telas médias deve estar definido');
  assert.match(css, /grid-template-columns:\s*1fr/u,
    'coluna única para telas pequenas deve estar definida');
});

test('CSS inclui suporte a forced-colors para contraste alto', async () => {
  const css = await cssSource();
  assert.match(css, /forced-colors:\s*active/u,
    'media query para forced-colors deve estar presente');
  assert.match(css, /CanvasText/u,
    'forced-colors deve usar tokens de sistema CanvasText');
});

test('CSS garante alvo de toque mínimo de 44px nos links interativos', async () => {
  const css = await cssSource();
  assert.match(css, /min-height:\s*44px/u,
    'links interativos devem ter min-height de 44px');
});

test('CSS define outline visível no foco dos elementos interativos', async () => {
  const css = await cssSource();
  assert.match(css, /focus-visible[\s\S]{0,100}outline:/u,
    'foco visível deve ser definido via :focus-visible com outline');
});

test('CSS não usa display:none ou visibility:hidden no estado de carregamento', async () => {
  const css = await cssSource();
  assert.doesNotMatch(css, /\.loading\s*\{[^}]*display:\s*none/u,
    'estado de carregamento não deve ser ocultado via display:none');
});
