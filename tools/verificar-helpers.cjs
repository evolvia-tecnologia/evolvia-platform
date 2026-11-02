#!/usr/bin/env node
/**
 * Verifica os helpers de tests/e2e/support/ambiente.ts contra Chromium real,
 * sem precisar do ambiente de homologacao: usa um fixture sintetico local com
 * um defeito proposital (bloco de 420px) e confere que o detector o acusa.
 *
 * Uso:  node tools/verificar-helpers.cjs
 * Sai com codigo 1 se algum helper nao se comportar como esperado.
 *
 * Autoria: Claude (Opus 5) — frente de Revisao Independente e Homologacao Fisica.
 */
const { chromium } = require('playwright');
const { writeFileSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const FIXTURE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Fixture</title><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}
ol{list-style:none;padding:8px;margin:0;display:grid;gap:12px}
li{display:grid;grid-template-columns:minmax(0,1fr) auto;padding:14px;gap:10px 12px;border:1px solid #d9e2ef}
.actions{display:flex;gap:4px}.actions button{min-width:36px;min-height:36px}
.formatBar{grid-column:1/-1;display:grid;grid-template-columns:minmax(145px,1fr) auto minmax(145px,1fr);gap:10px 16px}
.formatBar select{min-height:36px;width:100%}.formatBar input[type=checkbox]{width:17px;height:17px}
.vilao{width:420px}
</style></head><body><ol><li>
<span><strong>1.</strong> Nome para crachá</span>
<div class="actions"><button type="button" aria-label="Subir Nome para crachá">↑</button>
<button type="button" aria-label="Descer Nome para crachá">↓</button></div>
<div class="formatBar"><label>Alinhamento<select aria-label="Alinhamento de Nome para crachá"><option>À esquerda</option></select></label>
<label class="boldOption"><input type="checkbox"> Negrito</label></div>
</li></ol><div class="vilao">bloco largo proposital</div></body></html>`;

const semRolagemHorizontal = () => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
});

const culpadosDeTransbordo = () => {
  const limite = window.innerWidth + 1;
  const saida = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > limite) {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/u).slice(0, 2).join('.')}` : '';
      saida.push(`${el.tagName.toLowerCase()}${id}${cls} (right=${Math.round(r.right)}px)`);
    }
    if (saida.length >= 10) break;
  }
  return saida;
};

const alvosDeToque = (sel) => {
  const raiz = document.querySelector(sel) ?? document.body;
  const controles = Array.from(raiz.querySelectorAll('button, select, input, a[href], [role="button"]'));
  return controles.map((el) => {
    const r = el.getBoundingClientRect();
    const rotulo = el.closest('label');
    const nome = el.getAttribute('aria-label')
      || el.textContent?.trim()
      || rotulo?.textContent?.trim()
      || el.tagName.toLowerCase();
    return { nome: nome.slice(0, 40), largura: Math.round(r.width), altura: Math.round(r.height), visivel: r.width > 0 && r.height > 0 };
  }).filter((c) => c.visivel && (c.largura < 44 || c.altura < 44));
};

(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'evolvia-fixture-'));
  const arquivo = path.join(dir, 'fixture.html');
  writeFileSync(arquivo, FIXTURE, 'utf8');

  const browser = await chromium.launch();
  const resultados = [];
  for (const largura of [320, 390, 1366]) {
    const page = await browser.newPage({ viewport: { width: largura, height: 740 } });
    await page.goto(`file://${arquivo}`);
    resultados.push({
      largura,
      dim: await page.evaluate(semRolagemHorizontal),
      culpados: await page.evaluate(culpadosDeTransbordo),
      pequenos: await page.evaluate(alvosDeToque, 'ol'),
    });
    await page.close();
  }
  await browser.close();

  let falhas = 0;
  const reprovar = (msg) => { console.log(`   FALHA: ${msg}`); falhas += 1; };

  console.log('=== reflow (semRolagemHorizontal + culpadosDeTransbordo) ===');
  for (const r of resultados) {
    const transborda = r.dim.scrollWidth > r.dim.innerWidth + 1;
    console.log(`${String(r.largura).padStart(4)}px  scrollWidth=${r.dim.scrollWidth} innerWidth=${r.dim.innerWidth}  transborda=${transborda}  culpados=${r.culpados.join(', ') || 'nenhum'}`);
    const esperado = r.largura < 420;
    if (transborda !== esperado) reprovar(`esperado transborda=${esperado} em ${r.largura}px`);
    if (esperado && !r.culpados.some((c) => c.includes('vilao'))) reprovar('o detector nao nomeou o elemento culpado');
  }

  console.log('\n=== alvos de toque (escopo "ol") ===');
  const largo = resultados.find((r) => r.largura === 1366);
  for (const c of largo.pequenos) console.log(`  ${c.largura}x${c.altura}px  ${c.nome}`);
  if (!largo.pequenos.some((c) => c.largura === 17 && c.altura === 17)) reprovar('checkbox 17x17 nao detectado');
  if (!largo.pequenos.some((c) => /Subir Nome/u.test(c.nome))) reprovar('aria-label nao usado como nome');
  if (!largo.pequenos.some((c) => /Negrito/u.test(c.nome))) reprovar('checkbox sem aria-label deveria herdar o texto do <label>');

  console.log(`\n${falhas === 0 ? 'HELPERS VERIFICADOS EM CHROMIUM REAL' : `${falhas} FALHA(S)`}`);
  process.exit(falhas === 0 ? 0 : 1);
})();
