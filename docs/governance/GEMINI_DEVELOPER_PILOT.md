# Piloto Gemini Developer

Relacionado à issue #298.

## Objetivo

Adicionar uma trilha experimental do Gemini CLI para programação assistida no
GitHub, sem substituir a revisão atual do Gemini Code Assist e sem conceder
autonomia de integração ou implantação.

## Ativação futura

O workflow de comentários só funciona depois de existir na branch padrão do
repositório. Este Draft PR prepara e valida a configuração em `develop`, mas
não autoriza levar o workflow para `main`.

Antes da ativação, um administrador deverá:

1. criar uma credencial exclusiva no Google AI Studio ou configurar autenticação
   empresarial equivalente;
2. cadastrar somente o valor em
   `Configurações > Secrets and variables > Actions > Secrets`, com o nome
   `GEMINI_API_KEY`;
3. cadastrar `GEMINI_CLI_VERSION` com uma versão estável e fixa;
4. cadastrar `GEMINI_MODEL` com o modelo aprovado e limite de consumo;
5. revisar os limites de GitHub Actions e da API;
6. comprovar que `develop` e `main` bloqueiam push direto e exigem Pull Request;
7. obter autorização explícita para integrar o workflow na branch padrão.

Nenhuma credencial deve aparecer em issue, comentário, commit, artefato ou log.
A proteção de branches não pôde ser lida pelo GitHub App conectado (HTTP 403) e
permanece um bloqueio objetivo para ativar a permissão `contents: write`.

## Uso proposto

1. criar uma issue com objetivo, base SHA, owned paths, não escopo, testes,
   stop rules e rollback;
2. um mantenedor comenta `@gemini-dev /plan`;
3. o Gemini publica um plano sem alterar o repositório;
4. o mantenedor revisa o plano e comenta `@gemini-dev /approve`;
5. o Gemini cria branch `gemini/*`, altera apenas os caminhos autorizados e
   abre Draft PR para `develop`;
6. Codex, CI e revisão humana validam o resultado.

O Gemini não pode aprovar nem integrar o próprio trabalho.

## Segurança

- eventos limitados a comentários de OWNER, MEMBER ou COLLABORATOR;
- nenhuma execução em comentários de PR;
- checkout sem credencial persistida;
- shell e ferramentas centrais do Gemini desabilitados;
- GitHub MCP limitado por allowlist;
- sem exclusão de arquivo, fork, merge, deploy ou acesso a secrets;
- sem telemetria do agente;
- action oficial fixada no SHA correspondente ao canal `v0` consultado em
  09/09/2026.

## Teste focal

`node --test scripts/gemini-developer-workflow.test.mjs`

O teste verifica acionamento autorizado, plano/aprovação, pin da action,
credenciais não persistidas, allowlist mínima e ausência das permissões
proibidas.

## Rollback

Reverter o commit/merge que introduzir o workflow e remover ou revogar
`GEMINI_API_KEY`. A remoção da credencial interrompe novas execuções mesmo
antes da reversão do arquivo.
