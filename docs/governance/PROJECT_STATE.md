---
snapshot_at_utc: 2026-08-17T04:42:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
stable_version: 0.1.1
integration_branch: develop
integration_sha: aa0ff8662ac6c76d847e58cd9bcd8bae43510728
development_version: 0.2.0-alpha.3
active_phase: "Fase 1 — Divulgação do Evento"
active_work: "Go/No-Go da Fase 1 e validação transversal de autenticação"
active_pr: 65
next_gate: "Evidência manual WCAG 2.2 AA e HTTPS público"
next_phase: "Fase 2 — Inscrição, bloqueada pelo Gate anterior"
---

# Estado oficial do projeto

## Resumo executivo

- Produção permanece na `v0.1.1`; `main` não foi alterada pelo ciclo de
  desenvolvimento atual.
- A integração ocorre em `develop@aa0ff8662ac6c76d847e58cd9bcd8bae43510728`,
  versão `0.2.0-alpha.3`.
- Os Lotes 1 a 5 da Fase 1 — Divulgação estão integrados. O PR `#60` entregou
  a publicação explícita, auditável, idempotente e protegida por concorrência.
- O Go/No-Go da Fase 1 permanece aberto: faltam evidências manuais WCAG 2.2 AA
  dos fluxos críticos e a comprovação pública de HTTPS.
- O PR `#65` corrige a altura excessiva de Cadastro/Login. Está em rascunho,
  tecnicamente verde no CI `#260`, sem reviews pendentes e sincronizado com
  `develop`, mas não será integrado sem validação visual, responsiva, teclado,
  foco e leitor de tela.
- O primeiro corte do modo economia foi integrado pelo PR `#70`. Em PRs,
  ARM64 passa a executar apenas para imagens afetadas, mantendo um Gate
  consolidado verificável; pushes de `develop` continuam validando ambas.
- O Flow Guard v1 está versionado, mas rulesets, Dependabot alerts/security
  updates, auto-merge global e Code Review automático continuam dependentes de
  ativação administrativa comprovável na issue `#64`.

Este snapshot informa o ponto de retomada. Todo novo avanço ainda deve confirmar
SHAs, PRs, issues e checks vivos antes de agir.

## Linha ativa

| Ordem | Entrega | Estado verificável | Evidência |
| ---: | --- | --- | --- |
| 1 | Fundação e navegação da Divulgação | integrada | issue `#32` e histórico de `develop` |
| 2 | Modelo editorial e API | integrada | histórico da Fase 1 |
| 3 | Editor de Divulgação | integrada | histórico da Fase 1 |
| 4 | Página pública, preview privado e SEO | integrada | PR `#55`, merge `5bc75184` |
| 5 | Publicação explícita e auditável | integrada | PR `#60`, merge `7a1be9e4` |
| 6 | Gate final da Fase 1 | aberto | issues `#32`, `#56`, `#68` e evidência WCAG |
| 7 | Fase 2 — Inscrição | bloqueada | decisão EVO-006 |

## Frentes transversais em curso

- **Cadastro/Login — PR #65 / issue #67:** compactação de telas baixas e
  correção do indicador de senha estão implementadas. CI `#260` comprovou
  qualidade, migration/integração, Web ARM64 e Gate consolidado; API ARM64 foi
  corretamente ignorada porque a imagem não foi afetada. Faltam os testes
  manuais definidos na Definition of Done.
- **Recuperação de senha — issue #40:** deve ser fluxo real, com resposta
  anti-enumeração, token armazenado em hash, expiração, uso único, rate limit e
  auditoria minimizada. Não publicar link decorativo.
- **Confirmação de e-mail — issue #42:** deve confirmar posse do endereço no
  backend antes da ativação plena conforme regra canônica; validação sintática
  não prova existência.
- **Modo economia — issue #69:** primeiro corte integrado. Cache Buildx,
  retenção, medição antes/depois e desativação administrativa de workflows
  temporários permanecem pendentes e dependem de evidência de armazenamento ou
  permissão administrativa.
- **Flow Guard — issue #64:** código integrado; ativações administrativas ainda
  não comprovadas.

## Homologação

O CI de push `#259` aprovou qualidade, migration/integração, API ARM64, Web
ARM64 e o Gate consolidado para `aa0ff866`. O passo SSH publicou exatamente
esse SHA e confirmou migration concluída e API saudável.

A etapa posterior `Comprovar domínio público e HTTPS` falhou. A issue `#68`
registra a causa externa e o procedimento pendente:

1. liberar TCP `443` na Security List ou NSG da Oracle;
2. executar uma única vez o ativador versionado como administrador;
3. comprovar certificado, redirecionamento HTTP 308, `/api/health` público e
   `certbot renew --dry-run`.

A chave SSH de deploy permanece restrita. Não ampliar acesso, não executar
limpeza destrutiva e não tocar recursos de outros projetos.

## Gate atual

Antes de declarar a Fase 1 concluída, exigir:

- qualidade e builds Web/API;
- testes, smokes e regressão dos fluxos aplicáveis;
- migration descartável, integração e idempotência;
- compatibilidade Ubuntu/ARM64;
- ACL deny-by-default, isolamento `organizationId + eventId` e DTOs mínimos;
- publicação explícita, preview fiel, auditoria e revisão otimista;
- WCAG 2.2 AA com validação manual de teclado, foco, leitor de tela,
  contraste, zoom/reflow, desktop 1366×768, tablet e celular;
- deploy e evidência do SHA exato em homologação;
- HTTPS público, redirecionamento e healthcheck pelo domínio canônico.

## Linhas preservadas, mas não ativas

- PR `#27`: fundação de identidade externa A6/A7, rascunho.
- PR `#28`: regras de submissão A6, empilhado sobre o PR `#27`.
- PR `#23`: decisão científica A8, dependente da sequência A6/A7.

Essas linhas permanecem preservadas, mas não substituem a sequência 1→11 nem
autorizam iniciar a Fase 2 antes do Go/No-Go da Divulgação.

## Próximos passos elegíveis

1. concluir as evidências manuais do PR `#65`;
2. integrar o PR `#65` somente se o mesmo HEAD continuar verde, mesclável e
   sem review pendente;
3. avançar recuperação segura de senha e confirmação real de e-mail em cortes
   com backend, testes e rollback;
4. executar a intervenção Oracle da issue `#68` quando houver acesso
   administrativo;
5. consolidar o Go/No-Go da Fase 1; somente então avaliar a Fase 2.

## Como atualizar este arquivo

O Orquestrador atualiza este snapshot após merge, mudança de Gate, decisão do
Product Owner ou bloqueio relevante. Use fatos verificáveis; não use memória,
percentuais estimados ou CI de outro HEAD como prova.
