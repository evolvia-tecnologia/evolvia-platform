#!/usr/bin/env bash
# Verifica A SUITE, nao o produto.
#
# Sobe uma fixture local que replica o DOM de
# apps/web/components/credential-category-templates.tsx e roda a suite contra
# ela em tres variantes, conferindo que o resultado se diferencia de verdade:
#
#   A) DOM da base (sem a barra de formatacao do #614)
#        -> a capacidade e detectada como ausente
#        -> os testes dependentes saem SKIP com motivo declarado
#        -> o SKIP no gate obrigatorio @gate-etiqueta reprova a execucao
#   B) DOM com a barra do #614
#        -> a capacidade e detectada
#        -> os mesmos testes passam a asserir de verdade (e falham se o DOM
#           nao cumprir o que prometem)
#   C) DOM com transbordo horizontal proposital
#        -> o teste de reflow (WCAG 1.4.10) falha e nomeia o elemento culpado
#
# A fixture NAO e o produto: ela existe para provar que a suite distingue
# PASS, FAIL e SKIP. Verde aqui nao diz nada sobre a Evolvia.
#
# Uso: bash tools/verificar-suite.sh

set -uo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
e2e="$raiz/tests/e2e"
fixture="$e2e/fixture/servidor.cjs"

[ -f "$fixture" ] || { echo "ERRO: fixture nao encontrada em $fixture" >&2; exit 1; }
if [ ! -d "$e2e/node_modules" ]; then
  echo "node_modules ausente em tests/e2e."
  echo "Rode 'cd tests/e2e && npm ci' ou, sem rede, 'bash tools/preparar-runner-offline.sh'." >&2
  exit 1
fi

pw="$e2e/node_modules/playwright/cli.js"
[ -f "$pw" ] || pw="$e2e/node_modules/.bin/playwright"

pids=()
limpar() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap limpar EXIT

subir() { # porta, env extra
  local porta="$1"; shift
  env PORTA="$porta" "$@" node "$fixture" >/dev/null 2>&1 &
  pids+=("$!")
}
subir 4700
subir 4701 EVOLVIA_FIXTURE_FORMATACAO=1
subir 4702 EVOLVIA_FIXTURE_TRANSBORDO=1
sleep 2

rodar() { # porta
  ( cd "$e2e" && env \
      EVOLVIA_E2E_BASE_URL="http://127.0.0.1:$1" \
      EVOLVIA_E2E_EMAIL=qa@exemplo.invalido \
      EVOLVIA_E2E_SENHA=segredo-ficticio \
      EVOLVIA_E2E_EVENTO_ID=evt-1 \
      node "$pw" test --project=chromium-desktop --reporter=./support/relatorio.ts 2>&1 )
}

falhas=0
conferir() { # rotulo, saida, regex, descricao
  if printf '%s' "$2" | grep -qE "$3"; then
    echo "  ok   $4"
  else
    echo "  FALHA  $4  (esperava /$3/)"
    falhas=$((falhas + 1))
  fi
}

echo "=== A) DOM da base: sem a barra do #614 ==="
a="$(rodar 4700)"
printf '%s\n' "$a" | sed -n '/Resultado da execucao/,$p' | head -12
conferir A "$a" 'PASS  [1-9]'                      "houve caso aprovado"
conferir A "$a" 'SKIP  [1-9]+ declarados'          "houve SKIP declarado"
conferir A "$a" 'Depende de PR #614'               "o motivo do SKIP nomeia a dependencia"
conferir A "$a" 'GATE OBRIGATORIO PULADO'          "SKIP em gate obrigatorio virou falha"
conferir A "$a" 'axe-core nao instalado'           "ausencia do axe aparece como SKIP, nao como verde"

echo
echo "=== B) DOM com a barra do #614 ==="
b="$(rodar 4701)"
printf '%s\n' "$b" | sed -n '/Resultado da execucao/,$p' | head -8
conferir B "$b" 'SKIP  [0-9]+ declarados  \+  0 em gate obrigatorio' "gate obrigatorio deixou de ser pulado"
if printf '%s' "$b" | grep -q 'Depende de PR #614'; then
  echo "  FALHA  a capacidade existe no DOM mas o teste continuou pulando"
  falhas=$((falhas + 1))
else
  echo "  ok   capacidade detectada: o teste passou a asserir"
fi

echo
echo "=== C) DOM com transbordo proposital ==="
c="$(rodar 4702)"
printf '%s\n' "$c" | sed -n '/Resultado da execucao/,$p' | head -8
conferir C "$c" 'FAIL  [1-9]'           "o transbordo foi detectado"
conferir C "$c" '1\.4\.10|[Tt]ransbordo' "a falha nomeia o criterio de reflow"

echo
if [ "$falhas" -gt 0 ]; then
  echo "VERIFICACAO DA SUITE REPROVADA: $falhas conferencia(s) falhou." >&2
  exit 1
fi
echo "SUITE VERIFICADA EM CHROMIUM REAL: PASS, FAIL e SKIP se diferenciam."
echo "Isto valida a suite. NAO valida a Evolvia: para isso use um ambiente autorizado."
