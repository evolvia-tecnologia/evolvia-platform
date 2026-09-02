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

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CHUNK_HEADER_BYTES = 8;
const PNG_CHUNK_CRC_BYTES = 4;

function inspectPng(bytes, name) {
  assert.deepEqual(
    bytes.subarray(0, PNG_SIGNATURE.length),
    PNG_SIGNATURE,
    `${name}: a evidência precisa ser um PNG válido`,
  );
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', `${name}: PNG sem bloco IHDR`);

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  let offset = PNG_SIGNATURE.length;
  let idatBytes = 0;
  let idatChunks = 0;
  let closedByIend = false;

  while (offset < bytes.length) {
    assert.ok(
      offset + PNG_CHUNK_HEADER_BYTES <= bytes.length,
      `${name}: PNG truncado no cabeçalho de um chunk`,
    );
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + PNG_CHUNK_HEADER_BYTES).toString('ascii');
    const next = offset + PNG_CHUNK_HEADER_BYTES + length + PNG_CHUNK_CRC_BYTES;
    assert.ok(
      next <= bytes.length,
      `${name}: chunk ${type || 'desconhecido'} declara dados além do fim do arquivo`,
    );

    if (type === 'IDAT') {
      idatChunks += 1;
      idatBytes += length;
    }

    if (type === 'IEND') {
      assert.equal(length, 0, `${name}: chunk IEND precisa ter comprimento zero`);
      assert.equal(next, bytes.length, `${name}: existem bytes depois do IEND`);
      closedByIend = true;
      break;
    }

    offset = next;
  }

  assert.ok(closedByIend, `${name}: PNG truncado ou sem chunk IEND terminal`);
  assert.ok(idatChunks > 0, `${name}: PNG sem nenhum chunk IDAT`);
  assert.ok(idatBytes > 0, `${name}: chunks IDAT sem dados de imagem`);

  // Os quatro bytes de CRC precisam caber no arquivo, mas seu valor matemático
  // não é recalculado nesta validação estrutural.
  return { width, height, idatChunks, idatBytes };
}

async function capture(browser, name, width, height, sourcePath) {
  const response = await fetch(`${baseUrl}${sourcePath}`, { headers: { accept: 'text/html' } });
  assert.equal(response.status, 200, `${name}: a rota precisa responder HTTP 200 antes da captura`);

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
  const png = inspectPng(bytes, name);
  assert.deepEqual(
    { width: png.width, height: png.height },
    { width, height },
    `dimensões divergentes em ${name}`,
  );
  return { name, file: `${name}.png`, sourcePath, ...png, bytes: bytes.length };
}

await mkdir(outputDirectory, { recursive: true });
const browser = findBrowser();
const catalogResponse = await fetch(`${baseUrl}/eventos`, { headers: { accept: 'text/html' } });
assert.equal(catalogResponse.status, 200, 'o catálogo precisa estar disponível para a evidência visual');
const catalogHtml = await catalogResponse.text();
const eventPath = catalogHtml.match(/href="(\/evento\/[^"#?]+)"/u)?.[1];
assert.ok(eventPath, 'a jornada de CI precisa publicar ao menos um evento antes da captura visual');

const eventResponse = await fetch(`${baseUrl}${eventPath}`, { headers: { accept: 'text/html' } });
assert.equal(eventResponse.status, 200, 'a página pública do evento precisa estar disponível para a evidência visual');
const eventHtml = await eventResponse.text();
assert.ok(eventHtml.includes('id="main-content"'), 'a página do evento precisa conter id="main-content"');
assert.ok(eventHtml.includes('id="eva-support-title"'), 'a página do evento precisa conter id="eva-support-title" antes da captura da seção EVA');
assert.ok(eventHtml.includes('Que tipo de evento é?'), 'a página do evento precisa conter o tópico esperado da EVA');
assert.ok(eventHtml.includes('Público estimado'), 'a página do evento precisa conter o público estimado');

const captures = [];
captures.push(await capture(browser, 'home-desktop-1366x768', 1366, 768, '/'));
captures.push(await capture(browser, 'home-mobile-390x844', 390, 844, '/'));
captures.push(await capture(browser, 'login-desktop-1366x768', 1366, 768, '/login'));
captures.push(await capture(browser, 'login-mobile-320x800', 320, 800, '/login'));
captures.push(await capture(browser, 'cadastro-desktop-1366x768', 1366, 768, '/cadastro'));
captures.push(await capture(browser, 'cadastro-mobile-320x800', 320, 800, '/cadastro'));
captures.push(await capture(browser, 'eventos-periodo-atual-desktop-1366x768', 1366, 768, '/eventos?period=CURRENT'));
captures.push(await capture(browser, 'eventos-periodo-atual-mobile-320x800', 320, 800, '/eventos?period=CURRENT'));
captures.push(await capture(browser, 'eventos-periodo-realizados-desktop-1366x768', 1366, 768, '/eventos?period=PAST'));
captures.push(await capture(browser, 'eventos-periodo-realizados-mobile-320x800', 320, 800, '/eventos?period=PAST'));
captures.push(await capture(browser, 'eventos-periodo-todos-desktop-1366x768', 1366, 768, '/eventos?period=ALL'));
captures.push(await capture(browser, 'eventos-periodo-todos-mobile-320x800', 320, 800, '/eventos?period=ALL'));
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
