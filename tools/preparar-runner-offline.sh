#!/usr/bin/env bash
# Prepara tests/e2e para rodar SEM acesso ao registro npm.
#
# NAO substitui `npm ci`. O caminho correto e sempre:
#     cd tests/e2e && npm ci && npx playwright install --with-deps
#
# Este script existe para o caso em que o registro npm esta inacessivel
# (ambiente sem DNS para registry.npmjs.org) mas ja existe um Playwright
# instalado globalmente na maquina. Ele monta um atalho de resolucao para
# `@playwright/test` apontando para o pacote `playwright`, que desde a
# versao 1.x expoe o proprio executor de testes em `playwright/test`.
#
# O que ele NAO faz, de proposito:
#   - nao escreve package-lock.json (lockfile forjado nao e lockfile)
#   - nao baixa nada da rede
#   - nao instala axe-core: sem axe, os testes de axe ficam SKIP declarado e
#     as verificacoes de support/wcag-proprio.ts seguem valendo
#
# Uso:  bash tools/preparar-runner-offline.sh
#       cd tests/e2e && EVOLVIA_E2E_BASE_URL=... npx playwright test

set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
destino="$raiz/tests/e2e/node_modules"

global="$(npm root -g)"
if [ ! -d "$global/playwright" ]; then
  echo "ERRO: nao achei 'playwright' em $global." >&2
  echo "Este script so serve quando ja existe Playwright instalado globalmente." >&2
  echo "Com rede disponivel, use: cd tests/e2e && npm ci" >&2
  exit 1
fi

versao="$(node -e "console.log(require('$global/playwright/package.json').version)")"
echo "Playwright global encontrado: $versao"

mkdir -p "$destino/@playwright/test"

# playwright e playwright-core por link simbolico: nenhuma copia, nenhum download.
ln -sfn "$global/playwright" "$destino/playwright"
if [ -d "$global/playwright/node_modules/playwright-core" ]; then
  ln -sfn "$global/playwright/node_modules/playwright-core" "$destino/playwright-core"
elif [ -d "$global/playwright-core" ]; then
  ln -sfn "$global/playwright-core" "$destino/playwright-core"
fi

# Atalho @playwright/test -> playwright/test (mesmo executor, mesma instancia).
cat > "$destino/@playwright/test/package.json" <<JSON
{
  "name": "@playwright/test",
  "version": "$versao",
  "main": "./index.js",
  "types": "./index.d.ts",
  "exports": {
    ".": { "types": "./index.d.ts", "require": "./index.js", "import": "./index.mjs", "default": "./index.js" },
    "./reporter": { "types": "./reporter.d.ts", "require": "./reporter.js", "default": "./reporter.js" },
    "./package.json": "./package.json"
  }
}
JSON
echo "module.exports = require('playwright/test');" > "$destino/@playwright/test/index.js"
echo "export * from 'playwright/test'; export { default } from 'playwright/test';" > "$destino/@playwright/test/index.mjs"
echo "export * from 'playwright/types/test';" > "$destino/@playwright/test/index.d.ts"
echo "module.exports = {};" > "$destino/@playwright/test/reporter.js"
echo "export * from 'playwright/types/testReporter';" > "$destino/@playwright/test/reporter.d.ts"

echo
echo "Pronto. Atalho montado em tests/e2e/node_modules (nao versionado)."
echo "axe-core: $( [ -d "$destino/axe-core" ] && echo presente || echo "AUSENTE — testes de axe ficarao SKIP declarado" )"
echo
echo "Executar:"
echo "  cd tests/e2e"
echo "  EVOLVIA_E2E_MODO=inventario npx playwright test --list     # conferir que compila"
echo "  EVOLVIA_E2E_BASE_URL=https://homolog... npx playwright test"
