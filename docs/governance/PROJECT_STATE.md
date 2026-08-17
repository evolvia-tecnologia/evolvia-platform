---
snapshot_at_utc: 2026-08-17T17:14:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
stable_version: 0.1.1
integration_branch: develop
integration_sha: 7449f71f0a1f32c4921daa7a0c27022fef369a18
development_version: 0.2.0-alpha.3
active_phase: "Fase 1 — Divulgação do Evento"
active_work: "Go/No-Go da Fase 1 e validação transversal de autenticação"
active_pr: 72
next_gate: "Evidência manual WCAG 2.2 AA e HTTPS público"
next_phase: "Fase 2 — Inscrição, bloqueada pelo Gate anterior"
---

# Estado oficial do projeto

## Resumo executivo

- Produção permanece na `v0.1.1`; `main` não foi alterada pelo ciclo de
  desenvolvimento atual.
- A integração ocorre em
  `develop@7449f71f0a1f32c4921daa7a0c27022fef369a18`, versão
  `0.2.0-alpha.3`.
- Os Lotes 1 a 5 da Fase 1 — Divulgação estão integrados. O PR `#60`
  entregou a publicação explícita, auditável, idempotente e protegida por
  concorrência.
- O Go/No-Go da Fase 1 permanece aberto: faltam evidências manuais WCAG 2.2 AA
  dos fluxos críticos e a comprovação pública de HTTPS.
- O PR `#65` corrige a altura excessiva de Cadastro/Login. Está em rascunho e
  o CI `#260` comprovou seu HEAD `ce2be1b1`; como `develop` avançou, esse
  resultado não autoriza integração sem nova sincronização e sem as provas
  visuais, responsivas, de teclado, foco e leitor de tela.
- O PR `#72` contém a fundação backend ainda não exposta da recuperação de
  senha: tokens opacos armazenados em hash, anti-enumeração, portas minimizadas,
  migration expansiva e adaptador Prisma transacional. O CI `#274` aprovou
  qualidade, migration/integração, idempotência, API ARM64 e Gate consolidado no
  HEAD `228c2554`. Como `develop` avançou depois, o PR permanece em rascunho
  até uma sincronização única, nova validação e conclusão das dependências
  funcionais.
- O modo economia do PR `#70` permanece ativo. Os PRs `#73`, `#74` e
  `#75` eliminaram instalações duplicadas e builds Node sob QEMU, preservando
  runners finais ARM64 e o engine Prisma específico para Alpine ARM64.
- O PR `#77` corrigiu o alerta `GHSA-ggr8-5vv4-36mx` com override
  reproduzível de `deepmerge-ts@8.0.0`, preservando Prisma `6.19.3`. O CI
  `#276` aprovou audit, geração Prisma, testes, migration/integração,
  idempotência e API ARM64 antes da integração.
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
  correção do indicador de senha estão implementadas. O CI `#260` aprovou
  qualidade, migration/integração, Web ARM64 e Gate consolidado no HEAD
  `ce2be1b1`; faltam sincronização final e testes manuais da Definition of
  Done.
- **Recuperação de senha — PR #72 / issue #40:** a fundação segura está em
  rascunho e ainda não habilita endpoint, entrega ou UI. O CI `#274` aprovou
  integralmente o HEAD `228c2554`, inclusive migration/idempotência e API
  ARM64. Como o PR antecede a correção de dependência do PR `#77`, deve
  incorporar `develop` uma única vez e validar o novo HEAD antes de avançar.
  Permanecem necessários rate limiter real, estado canônico de e-mail
  verificado, auditoria persistente, transporte real, redefinição atômica e
  smoke de entrega.
- **Confirmação de e-mail — issue #42:** deve confirmar posse do endereço no
  backend antes da ativação plena; validação sintática não prova existência.
  O estado canônico desta frente é dependência explícita do PR `#72`.
- **Modo economia — issue #69:** ARM64 seletivo em PR e Gate consolidado estão
  comprovados. Cache Buildx, retenção, medição antes/depois e desativação
  administrativa de workflows temporários permanecem pendentes.
- **Flow Guard — issue #64:** código integrado; ativações administrativas ainda
  não comprovadas.
- **Benchmark — issue #36:** permanece fonte transversal viva. Novos achados
  não alteram a ordem 1→11 nem autorizam antecipar fases.

## Dependências e compatibilidade

- Os lockfiles da API e da Web permanecem versionados no formato 3 e a versão
  de desenvolvimento continua `0.2.0-alpha.3`.
- A API preserva Prisma e `@prisma/client` em `6.19.3` e aplica override
  explícito para `deepmerge-ts@8.0.0`, correção do alerta
  `GHSA-ggr8-5vv4-36mx`. O lockfile contém versão, URL e integridade
  reproduzíveis.
- O CI `#276` comprovou no HEAD do PR `#77` audit sem vulnerabilidades
  altas, qualidade, geração Prisma, testes, migration/integração,
  idempotência, API ARM64 e Gate consolidado.
- O push `#277` repetiu qualidade, migration/integração, API e Web ARM64 e o
  Gate consolidado no SHA integrado `7449f71f`.
- O runtime final da API continua Alpine ARM64 com Prisma
  `linux-musl-arm64-openssl-3.0.x`; dependências, geração, build e testes
  executam no `BUILDPLATFORM` nativo.

## Homologação

O CI de push `#277` aprovou qualidade, audit, migration/integração,
idempotência, API ARM64, Web ARM64 e o Gate consolidado para
`7449f71f0a1f32c4921daa7a0c27022fef369a18`.

O passo SSH com rollback publicou exatamente esse SHA, concluiu a migration e
confirmou PostgreSQL, Redis e API saudáveis. O log registrou
`HOMOLOGAÇÃO PUBLICADA AUTOMATICAMENTE`, versão `0.2.0-alpha.3`. A etapa
posterior `Comprovar domínio público e HTTPS` falhou após 36 timeouts sem
handshake. O registro do status verificável encontrou ainda um erro transitório
`503` da API do GitHub; não houve rerun. A evidência direta do deploy e o
bloqueio permanecem registrados na issue `#68`.

Assim, o SHA está implantado tecnicamente em homologação, mas HTTPS público e
HTTP→HTTPS continuam não comprovados. O procedimento pendente é:

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
- WCAG 2.2 AA com validação manual de teclado, foco, leitor de tela, contraste,
  zoom/reflow, desktop 1366×768, tablet e celular;
- deploy e evidência do SHA exato em homologação;
- HTTPS público, redirecionamento e healthcheck pelo domínio canônico.

## Linhas preservadas, mas não ativas

- PR `#27`: fundação de identidade externa A6/A7, rascunho.
- PR `#28`: regras de submissão A6, empilhado sobre o PR `#27`.
- PR `#23`: decisão científica A8, dependente da sequência A6/A7.

Essas linhas permanecem preservadas, mas não substituem a sequência 1→11 nem
autorizam iniciar a Fase 2 antes do Go/No-Go da Divulgação.

## Próximos passos elegíveis

1. incorporar `develop@7449f71f` uma única vez no PR `#72`, sem reescrever
   histórico, e validar integralmente o novo HEAD;
2. avançar no mesmo PR somente os próximos contratos backend desbloqueados,
   preservando a dependência da confirmação canônica de e-mail;
3. concluir as evidências manuais do PR `#65` e sincronizá-lo apenas antes da
   decisão final;
4. executar a intervenção Oracle da issue `#68` quando houver acesso
   administrativo;
5. consolidar o Go/No-Go da Fase 1; somente então avaliar a Fase 2.

## Como atualizar este arquivo

O Orquestrador atualiza este snapshot após merge, mudança de Gate, decisão do
Product Owner ou bloqueio relevante. Use fatos verificáveis; não use memória,
percentuais estimados ou CI de outro HEAD como prova.
