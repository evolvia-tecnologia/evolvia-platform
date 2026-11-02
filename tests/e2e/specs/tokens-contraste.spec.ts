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
      + '\n\nObservacao: --color-text-muted passa sobre branco e reprova sobre '
      + '--color-surface-violet-soft. Medir so contra branco esconde isto.',
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

  test('1.4.11 — existe token de borda de controle com 3:1 @gate-permissao', async ({}, testInfo) => {
    const tokens = await lerTokens();

    const bordas = [...tokens.keys()].filter((n) => /^--color-border/u.test(n));
    const medicoes: Record<string, string> = {};
    const aprovados: string[] = [];

    for (const nome of bordas) {
      const cor = lerHex(tokens.get(nome) ?? '');
      if (!cor) continue; // rgba() e vidro: fora do escopo deste gate
      const { razao: r, superficie } = piorCaso(tokens, cor);
      medicoes[nome] = `${r.toFixed(2)}:1 (pior: ${superficie})`;
      if (r >= 3) aprovados.push(nome);
    }
    await testInfo.attach('medicoes-borda.json', {
      body: JSON.stringify(medicoes, null, 2), contentType: 'application/json',
    });

    expect(
      aprovados,
      'Nenhum token --color-border* opaco atinge 3:1 contra as superficies claras.\n'
      + Object.entries(medicoes).map(([n, m]) => `  ${n} = ${tokens.get(n)} -> ${m}`).join('\n')
      + '\n\nO criterio 1.4.11 exige 3:1 para o contorno que identifica um componente '
      + '(campo, select, caixa de marcacao). Hoje toda borda de controle do sistema '
      + 'fica entre 1,12:1 e 1,52:1: para baixa visao, o limite do campo e invisivel.\n\n'
      + 'Divisor puramente decorativo NAO precisa de 3:1, e por isso a correcao '
      + 'proposta nao escurece --color-border: ela adiciona '
      + '--color-border-interactive e migra apenas as bordas de controle. '
      + 'Ver docs/qa/contraste-tokens.md.\n\n'
      + 'Esta falha e a evidencia do defeito, nao defeito do teste.',
    ).not.toEqual([]);
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
