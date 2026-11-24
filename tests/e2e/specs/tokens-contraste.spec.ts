import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Gate de contraste sobre os tokens — CL-06.
 *
 * Le apps/web/app/design-tokens.css e mede. Sem navegador e sem ambiente:
 *
 *     EVOLVIA_E2E_MODO=inventario npx playwright test --grep @contraste
 *
 * Por que medir o token e nao a tela: o token e a fonte. Se ele reprova, toda
 * superficie que o usa reprova, e corrigir num lugar corrige em todos. A
 * varredura em tela (support/wcag-proprio.ts e o axe) continua necessaria para
 * pegar o que nasce de composicao e de sobreposicao — sao camadas diferentes.
 *
 * Cuidado que vale registrar: o pior caso NAO e o branco. Contra
 * --color-surface-violet-soft (#f4eaff) todas as razoes caem. Uma cor de borda
 * aferida so contra #ffffff pode passar em 3,02:1 e reprovar em 2,60:1 na
 * superficie violeta. Este gate mede contra as cinco superficies claras.
 */

const RAIZ_TOKENS = join(__dirname, '..', '..', '..', 'apps', 'web', 'app', 'design-tokens.css');
const RAIZ_GLOBAIS = join(__dirname, '..', '..', '..', 'apps', 'web', 'app', 'globals.css');

/**
 * Seletores que sao inequivocamente componente de interface: campo, botao e
 * alternador. A borda deles identifica o controle, logo o criterio 1.4.11 se
 * aplica. Cartao de escolha grande, com texto dentro, fica fora de proposito:
 * ele e identificavel pelo proprio texto, e ali a borda e decorativa.
 */
const SELETORES_DE_CONTROLE = ['.input', '.select', '.btn-secondary', '.pending-toggle', '.capability-toggle'];

// Superficies claras sobre as quais texto e borda realmente assentam.
const SUPERFICIES = [
  '--color-surface',
  '--color-surface-subtle',
  '--color-canvas',
  '--color-surface-soft',
  '--color-surface-violet-soft',
] as const;

type Rgb = [number, number, number];

function lerHex(valor: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/iu.exec(valor.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminancia([r, g, b]: Rgb): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function razao(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

async function lerTokens(): Promise<Map<string, string>> {
  const fonte = await readFile(RAIZ_TOKENS, 'utf8');
  const tokens = new Map<string, string>();
  for (const [, nome, valor] of fonte.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/gu)) {
    tokens.set(nome, valor.trim());
  }
  return tokens;
}

/**
 * Resolve um token ate o hex, seguindo a cadeia de aliases de globals.css.
 *
 * Existe porque globals.css mantem um vocabulario paralelo: `--border` e
 * definido como `var(--color-border)`. Medir `--border` sem seguir o alias
 * daria "nao e hex" e passaria batido — exatamente o ponto cego que deixou
 * `.input` com borda de 1,31:1 sem ninguem notar.
 */
function resolverCor(nome: string, tokens: Map<string, string>, aliases: Map<string, string>): Rgb | null {
  const vistos = new Set<string>();
  let atual = nome;
  for (let salto = 0; salto < 10; salto += 1) {
    if (vistos.has(atual)) return null; // ciclo de alias
    vistos.add(atual);
    const valor = tokens.get(atual) ?? aliases.get(atual);
    if (!valor) return null;
    const direto = lerHex(valor);
    if (direto) return direto;
    const referencia = /^var\(\s*(--[\w-]+)\s*\)$/u.exec(valor);
    if (!referencia) return null;
    atual = referencia[1];
  }
  return null;
}

/** Aliases declarados no :root de globals.css. */
async function lerAliases(): Promise<Map<string, string>> {
  const fonte = await readFile(RAIZ_GLOBAIS, 'utf8');
  const bloco = /:root\s*\{([^}]*)\}/u.exec(fonte);
  const mapa = new Map<string, string>();
  if (!bloco) return mapa;
  for (const [, nome, valor] of bloco[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/gu)) {
    mapa.set(nome, valor.trim());
  }
  return mapa;
}

/** Token de borda usado por cada seletor de controle, como o CSS declara. */
async function bordaDosControles(): Promise<Map<string, string>> {
  const fonte = await readFile(RAIZ_GLOBAIS, 'utf8');
  const usado = new Map<string, string>();
  for (const [, seletores, corpo] of fonte.matchAll(/([^{}@]+)\{([^{}]*)\}/gu)) {
    const lista = seletores.split(',').map((s) => s.trim());
    const borda = /border(?:-\w+)?\s*:\s*[^;]*?var\(\s*(--[\w-]+)\s*\)/u.exec(corpo);
    if (!borda) continue;
    for (const alvo of SELETORES_DE_CONTROLE) {
      if (lista.includes(alvo) && !usado.has(alvo)) usado.set(alvo, borda[1]);
    }
  }
  return usado;
}

/** Menor razao da cor contra todas as superficies claras: o pior caso. */
function piorCaso(tokens: Map<string, string>, cor: Rgb): { razao: number; superficie: string } {
  let pior = { razao: Infinity, superficie: '' };
  for (const nome of SUPERFICIES) {
    const fundo = lerHex(tokens.get(nome) ?? '');
    if (!fundo) continue;
    const r = razao(cor, fundo);
    if (r < pior.razao) pior = { razao: r, superficie: nome };
  }
  return pior;
}

test.describe('Contraste dos tokens @contraste @a11y', () => {
  test('as superficies claras de referencia existem e sao hex', async () => {
    // Ancora: sem elas, nenhuma medicao abaixo significa nada.
    const tokens = await lerTokens();
    for (const nome of SUPERFICIES) {
      expect(lerHex(tokens.get(nome) ?? ''), `${nome} precisa existir como hex`).not.toBeNull();
    }
  });

  test('1.4.3 — texto comum atinge 4,5:1 em toda superficie clara', async ({}, testInfo) => {
    const tokens = await lerTokens();
    // Papel declarado de cada token de texto. --color-text-subtle esta fora
    // porque o proprio design system o trata como texto grande; ele tem teste
    // separado, com o limite de 3:1 que lhe cabe.
    const comuns = ['--color-text', '--color-text-strong', '--color-text-muted'];
    const reprovados: string[] = [];
    const medicoes: Record<string, string> = {};

    for (const nome of comuns) {
      const cor = lerHex(tokens.get(nome) ?? '');
      if (!cor) { reprovados.push(`${nome}: ausente ou nao-hex`); continue; }
      const { razao: r, superficie } = piorCaso(tokens, cor);
      medicoes[nome] = `${r.toFixed(2)}:1 (pior: ${superficie})`;
      if (r < 4.5) {
        reprovados.push(
          `${nome} = ${tokens.get(nome)} em ${r.toFixed(2)}:1 sobre ${superficie} (minimo 4,5:1)`,
        );
      }
    }
    await testInfo.attach('medicoes-texto.json', {
      body: JSON.stringify(medicoes, null, 2), contentType: 'application/json',
    });

    expect(
      reprovados,
      'Tokens de texto comum abaixo de 4,5:1:\n  ' + reprovados.join('\n  ')
      + '\n\nAtencao ao metodo: medir so contra branco esconde este defeito. '
      + '--color-text-muted passava em 4,91:1 sobre #ffffff e reprovava em 4,42:1 '
      + 'sobre --color-surface-violet-soft.',
    ).toEqual([]);
  });

  test('1.4.3 — texto grande atinge 3:1 em toda superficie clara', async () => {
    const tokens = await lerTokens();
    const cor = lerHex(tokens.get('--color-text-subtle') ?? '');
    expect(cor, '--color-text-subtle precisa existir').not.toBeNull();
    const { razao: r, superficie } = piorCaso(tokens, cor as Rgb);
    expect(
      r,
      `--color-text-subtle em ${r.toFixed(2)}:1 sobre ${superficie}. `
      + 'Atende 3:1 (texto grande: >= 18,66px negrito ou >= 24px) mas nao 4,5:1. '
      + 'Se for usado em texto comum em qualquer lugar, reprova 1.4.3 ali.',
    ).toBeGreaterThanOrEqual(3);
  });

  test('1.4.11 — a borda de cada controle atinge 3:1 @gate-permissao', async ({}, testInfo) => {
    const tokens = await lerTokens();
    const aliases = await lerAliases();
    const usado = await bordaDosControles();

    // Medicao de todos os tokens de borda, para a evidencia.
    const medicoes: Record<string, string> = {};
    for (const nome of [...tokens.keys()].filter((n) => /^--color-border/u.test(n))) {
      const cor = lerHex(tokens.get(nome) ?? '');
      if (!cor) continue; // rgba() e vidro: dependem do que esta atras
      const { razao: r, superficie } = piorCaso(tokens, cor);
      medicoes[nome] = `${r.toFixed(2)}:1 (pior: ${superficie})`;
    }

    // O que cada controle realmente usa, com o alias resolvido.
    const reprovados: string[] = [];
    const semBorda: string[] = [];
    const porControle: Record<string, string> = {};

    for (const seletor of SELETORES_DE_CONTROLE) {
      const token = usado.get(seletor);
      if (!token) { semBorda.push(seletor); continue; }
      const cor = resolverCor(token, tokens, aliases);
      if (!cor) {
        reprovados.push(`${seletor} usa ${token}, que nao resolve para uma cor opaca`);
        porControle[seletor] = `${token} -> nao resolvido`;
        continue;
      }
      const { razao: r, superficie } = piorCaso(tokens, cor);
      porControle[seletor] = `${token} -> ${r.toFixed(2)}:1 (pior: ${superficie})`;
      if (r < 3) {
        reprovados.push(`${seletor} usa ${token} em ${r.toFixed(2)}:1 sobre ${superficie} (minimo 3:1)`);
      }
    }

    await testInfo.attach('medicoes-borda.json', {
      body: JSON.stringify({ tokens: medicoes, controles: porControle, semBorda }, null, 2),
      contentType: 'application/json',
    });

    // Um seletor de controle que desapareceu do CSS invalida a medicao: o gate
    // ficaria verde por nao ter achado nada para medir. Isso nao e aprovacao.
    expect(
      semBorda,
      `Seletores de controle sem borda declarada em globals.css: ${semBorda.join(', ')}.\n`
      + 'Ou o seletor foi renomeado, ou a borda saiu. Em qualquer caso este gate '
      + 'parou de medir o que prometia medir, e silencio nao e conformidade. '
      + 'Atualize SELETORES_DE_CONTROLE junto com o CSS.',
    ).toEqual([]);

    expect(
      reprovados,
      'Bordas de controle abaixo de 3:1 (WCAG 2.2, criterio 1.4.11):\n  '
      + reprovados.join('\n  ')
      + '\n\nMedicao de todos os tokens de borda:\n'
      + Object.entries(medicoes).map(([n, m]) => `  ${n} = ${tokens.get(n)} -> ${m}`).join('\n')
      + '\n\nPor controle:\n'
      + Object.entries(porControle).map(([s, m]) => `  ${s}: ${m}`).join('\n')
      + '\n\nDivisor puramente decorativo NAO precisa de 3:1, e por isso '
      + '--color-border segue claro: a correcao adiciona '
      + '--color-border-interactive e migra apenas a borda de controle. '
      + 'Rode `python3 tools/aplicar-contraste-controles.py`. '
      + 'Ver docs/qa/contraste-tokens.md.\n\n'
      + 'Nao conserte declarando um token novo sem usa-lo: este teste mede o que '
      + 'o seletor de fato usa, com o alias de globals.css resolvido.',
    ).toEqual([]);
  });

  test('o conjunto de tokens de cor medido e o esperado', async () => {
    // Se alguem adicionar um token de cor opaco, este teste falha e obriga a
    // decidir conscientemente se ele entra nos gates acima. Um gate que nao
    // sabe o que deixou de medir nao e gate.
    const tokens = await lerTokens();
    const opacos = [...tokens.entries()]
      .filter(([n, v]) => n.startsWith('--color-') && lerHex(v))
      .map(([n]) => n).sort();
    expect(opacos).toEqual([
      '--color-accent-violet-500',
      '--color-border',
      '--color-border-interactive',
      '--color-border-strong',
      '--color-brand-blue-400',
      '--color-brand-blue-600',
      '--color-brand-blue-700',
      '--color-brand-blue-800',
      '--color-brand-navy-800',
      '--color-brand-navy-950',
      '--color-brand-sky-400',
      '--color-canvas',
      '--color-danger',
      '--color-danger-border',
      '--color-danger-surface',
      '--color-focus-on-dark',
      '--color-focus-on-light',
      '--color-on-dark',
      '--color-on-dark-muted',
      '--color-success',
      '--color-success-surface',
      '--color-surface',
      '--color-surface-soft',
      '--color-surface-subtle',
      '--color-surface-violet-soft',
      '--color-text',
      '--color-text-muted',
      '--color-text-strong',
      '--color-text-subtle',
      '--color-warning',
      '--color-warning-surface',
    ]);
  });
});
