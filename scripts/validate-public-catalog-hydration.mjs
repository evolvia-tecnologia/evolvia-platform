import { runCli } from './validate-public-accessibility-runtime.mjs';

const CATALOG_PATHS = ['/eventos', '/eventos?period=ALL'];
const CATALOG_VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
];

process.env.EVOLVIA_A11Y_OUTPUT ??= 'visual-evidence/public-catalog-hydration-runtime.json';

runCli({
  staticPaths: CATALOG_PATHS,
  viewports: CATALOG_VIEWPORTS,
  includeDiscoveredEvent: false,
  timeoutMs: 90_000,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha na prova isolada de hidratação do catálogo.');
  process.exitCode = 1;
});
