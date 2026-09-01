import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = (process.env.EVOLVIA_WEB_URL ?? 'http://127.0.0.1:3000').replace(/\/$/u, '');
const outputDirectory = resolve(process.env.EVOLVIA_VISUAL_OUTPUT ?? 'visual-evidence');
const candidates = [
  process.env.CHROME_BIN,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean);

function findBrowser() {
  for (const candidate of candidates) {
    const result = spawnSync('sh', ['-c', 'command -v "$1"', 'sh', candidate], {
      encoding: 'utf8',
    });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('Chrome ou Chromium não foi encontrado no runner.');
}

function pngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(bytes.subarray(0, 8), signature, 'a evidência precisa ser um PNG válido');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', 'PNG sem bloco IHDR');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function capture(browser, name, width, height, sourcePath) {
  const path = resolve(outputDirectory, `${name}.png`);
  const result = spawnSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-sandbox',
    '--run-all-compositor-stages-before-draw',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    '--virtual-time-budget=3000',
    `--screenshot=${path}`,
    `${baseUrl}${sourcePath}`,
  ], { encoding: 'utf8' });

  assert.equal(
    result.status,
    0,
    `falha ao capturar ${name}: ${result.stderr || result.stdout}`,
  );

  const bytes = await readFile(path);
  const dimensions = pngDimensions(bytes);
  assert.deepEqual(dimensions, { width, height }, `dimensões divergentes em ${name}`);
  assert.ok(bytes.length > 10_000, `${name} parece vazio ou incompleto`);
  return { name, file: `${name}.png`, sourcePath, ...dimensions, bytes: bytes.length };
}

await mkdir(outputDirectory, { recursive: true });
const browser = findBrowser();
const catalogResponse = await fetch(`${baseUrl}/eventos`, { headers: { accept: 'text/html' } });
assert.equal(catalogResponse.status, 200, 'o catálogo precisa estar disponível para a evidência visual');
const catalogHtml = await catalogResponse.text();
const eventPath = catalogHtml.match(/href="(\/evento\/[^"#?]+)"/u)?.[1];
assert.ok(eventPath, 'a jornada de CI precisa publicar ao menos um evento antes da captura visual');

const captures = [];
captures.push(await capture(browser, 'home-desktop-1366x768', 1366, 768, '/'));
captures.push(await capture(browser, 'home-mobile-390x844', 390, 844, '/'));
captures.push(await capture(browser, 'eventos-desktop-1366x768', 1366, 768, '/eventos?profile=SCIENTIFIC_EVENT'));
captures.push(await capture(browser, 'eventos-boundary-1081x900', 1081, 900, '/eventos?profile=SCIENTIFIC_EVENT'));
captures.push(await capture(browser, 'eventos-boundary-1080x900', 1080, 900, '/eventos?profile=SCIENTIFIC_EVENT'));
captures.push(await capture(browser, 'eventos-mobile-390x844', 390, 844, '/eventos?profile=SCIENTIFIC_EVENT'));
captures.push(await capture(browser, 'eventos-mobile-320x800', 320, 800, '/eventos?profile=SCIENTIFIC_EVENT'));
captures.push(await capture(browser, 'evento-desktop-1366x900', 1366, 900, eventPath));
captures.push(await capture(browser, 'evento-eva-desktop-1366x900', 1366, 900, `${eventPath}#eva-support-title`));
captures.push(await capture(browser, 'evento-eva-mobile-390x844', 390, 844, `${eventPath}#eva-support-title`));

const manifest = {
  sourceSha: process.env.GITHUB_SHA ?? null,
  sourceUrls: [...new Set(captures.map((capture) => `${baseUrl}${capture.sourcePath}`))],
  browser,
  captures,
};
await writeFile(
  resolve(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(manifest));
