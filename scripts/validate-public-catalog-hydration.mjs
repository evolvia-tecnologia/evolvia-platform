import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runCli } from './validate-public-accessibility-runtime.mjs';
import { runStreamingHydration } from './validate-public-streaming-hydration.mjs';

const CATALOG_PATHS = ['/eventos', '/eventos?period=CURRENT', '/eventos?period=ALL', '/eventos?period=PAST'];
const CATALOG_VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
];

process.env.EVOLVIA_A11Y_OUTPUT ??= 'visual-evidence/public-catalog-hydration-runtime.json';

async function validateCatalog() {
  await runCli({ staticPaths: CATALOG_PATHS, viewports: CATALOG_VIEWPORTS,
    includeDiscoveredEvent: false, timeoutMs: 120_000 });
  if (process.exitCode) return;
  const base = new URL(process.env.EVOLVIA_WEB_URL);
  // Prova adicional no ambiente descartável do CI; o comando remoto preserva seu contrato.
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname)) return;
  const output = resolve(process.env.EVOLVIA_A11Y_OUTPUT);
  const normal = JSON.parse(await readFile(output, 'utf8'));
  try {
    await runStreamingHydration();
  } finally {
    let streamed;
    try {
      streamed = JSON.parse(await readFile(resolve(dirname(output), 'public-streaming-hydration-runtime.json'), 'utf8'));
    } catch {
      streamed = { ok: false, incomplete: true };
      process.exitCode = 1;
    }
    // O artefato já preservado pelo CI inclui ambas as provas, inclusive falhas.
    await writeFile(output, `${JSON.stringify({ ...normal, ok: normal.ok && streamed.ok, streamed }, null, 2)}\n`);
  }
}

validateCatalog().catch(() => {
  console.error('Falha na prova de hidratação do catálogo ou do HTML fragmentado.');
  process.exitCode = 1;
});
