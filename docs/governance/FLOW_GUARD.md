# Evolvia Flow Guard v1

**Status:** aprovado em 15/08/2026  
**Escopo:** governança de GitHub, revisão automática, dependências e merge  
**Não escopo:** mudança funcional, deploy de produção ou alteração de dados

## Objetivo

Reduzir risco e retrabalho sem tirar do Product Owner o controle sobre publicação,
produção e mudanças sensíveis. O Flow Guard complementa o CI; não substitui os
Gates técnicos e de negócio.

## Controles adotados

### Revisão automática

- O Codex Code Review deve revisar todo PR elegível.
- As regras de domínio ficam em `AGENTS.md`, com escopo mais específico quando
  necessário.
- Achados automáticos orientam a correção, mas não substituem testes, aprovação
  humana nem Go/No-Go.

### Dependências

- Dependabot verifica semanalmente API, Web e GitHub Actions.
- Atualizações rotineiras de versão abrem PR para `develop`.
- Atualizações major ficam fora da automação e exigem análise de impacto.
- Como o GitHub cria atualizações de segurança contra a branch padrão, um PR de
  segurança destinado a `main` deve ser retargetado/reaplicado em `develop`,
  validado pelo CI e só então seguir o fluxo de promoção.

### Merge

- `main` e produção nunca usam auto-merge.
- Auto-merge em `develop` é opt-in por PR, nunca global por categoria.
- Mesmo em `develop`, não usar auto-merge para migration, autenticação/ACL,
  pagamentos, publicação, credenciais, secrets, infraestrutura ou mudança com
  risco de perda/indisponibilidade.
- Um PR elegível exige checks integrais verdes, base atualizada, ausência de
  pendência de revisão e rollback conhecido.

### Proteção de branches

Configuração-alvo para `main` e `develop`:

- bloquear force push e exclusão;
- exigir PR;
- exigir os checks de qualidade, ARM64 e integração aplicáveis;
- exigir resolução das conversas;
- manter aprovação humana para `main`.

Em repositório privado pertencente a organização, esses controles dependem do
plano da organização. GitHub Pro da conta pessoal não substitui GitHub Team da
organização.

### Higiene de workflows

- Workflow temporário concluído deve ser desativado após preservação da evidência.
- Workflow temporário com falha não é apagado silenciosamente: registrar a causa,
  resolver ou encerrar formalmente e só então desativar.
- Workflows permanentes devem ter objetivo, gatilho, permissões mínimas, timeout e
  owner explícitos.

## Rollback

- Desativar revisão automática nas preferências do repositório.
- Reverter o commit de configuração do Dependabot/CODEOWNERS.
- Desabilitar auto-merge no repositório; nenhum PR já deve depender dele como
  aprovação de produção.
- Colocar ruleset em modo desabilitado antes de removê-lo, preservando a evidência
  da configuração anterior.
