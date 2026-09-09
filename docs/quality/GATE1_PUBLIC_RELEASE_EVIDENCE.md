# Evidência pública de liberação do Gate 1

O agregador reúne, sem copiar regras, os validadores públicos já existentes no
repositório. Ele produz um manifesto local vinculado a um SHA exato e mantém
separados:

- verificações automatizadas;
- validações humanas com NVDA e VoiceOver;
- comprovação administrativa de HTTPS/TLS público.

O resultado nunca autoriza Go/No-Go, merge, implantação ou homologação. O campo
\`decision\` permanece obrigatoriamente como \`NOT_AUTHORIZED\`.

## Uso

Execute a partir da raiz, informando todos os valores explicitamente:

\`\`\`bash
node scripts/collect-gate1-public-release-evidence.mjs \
  --base-url https://dev.evolviatecnologia.com/ \
  --sha 156ca89f82f6314bdec4bf8c737b944e8d70654d \
  --timestamp 2026-09-09T15:00:00.000Z \
  --output visual-evidence/gate1-public-release.json
\`\`\`

HTTP só é aceito para \`localhost\`, \`127.0.0.1\` ou \`::1\`. Origens remotas exigem
HTTPS. A URL não pode conter credenciais, consulta, fragmento ou caminho.

O arquivo de saída é criado sem sobrescrever evidência anterior. Use um caminho
novo para cada SHA e instante auditado.

## Validadores compostos

| Evidência | Validador canônico |
| --- | --- |
| Rotas públicas, reflow, foco e alvos | \`scripts/validate-public-accessibility-runtime.mjs\` |
| Árvore acessível | \`scripts/validate-public-accessibility-tree.mjs\` |
| Espaçamento de texto | \`scripts/validate-public-text-spacing.mjs\` |
| Matriz visual | \`scripts/capture-events-visual-evidence.mjs\` |

Cada processo recebe apenas \`EVOLVIA_WEB_URL\` e \`GITHUB_SHA\`. Saída, HTML,
cookies, cabeçalhos, tokens e dados pessoais dos validadores não são incorporados
ao manifesto. O agregador registra somente sucesso, falha ou timeout.

## Estados

- \`PASS\`: o validador automatizado terminou com código zero;
- \`FAIL\`: houve falha, exceção ou timeout;
- \`BLOCKED_HUMAN\`: exige execução humana e não pode ser inferido;
- \`BLOCKED_ADMIN\`: exige autoridade ou evidência administrativa externa.

Mesmo com todas as verificações automatizadas em \`PASS\`, os bloqueios humanos e
administrativos permanecem explícitos.

## Segurança, limites e rollback

- SHA completo e timestamp ISO UTC são obrigatórios;
- o conjunto de evidências e a ordem são fixos;
- campos extras ou sensíveis são rejeitados;
- o manifesto tem limite de 64 KiB;
- nenhuma regra dos validadores é duplicada;
- não há API, banco, migration, dependência, workflow ou descoberta de secret.

Rollback: remover os quatro arquivos da issue #294 ou reverter o commit do Draft
PR. Nenhum dado persistente ou ambiente externo é alterado.
