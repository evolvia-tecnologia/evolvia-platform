---
snapshot_at_utc: 2026-08-17T14:42:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
stable_version: 0.1.1
integration_branch: develop
integration_sha: 3297f357ab8483bc4c895fac52990880276e119a
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
  `develop@3297f357ab8483bc4c895fac52990880276e119a`, versão
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
  migration expansiva e adaptador Prisma transacional. O HEAD `228c2554`
  está mesclável contra o `develop` atual e permanece em rascunho enquanto seu
  CI e as dependências funcionais não forem concluídos.
- O modo economia do PR `#70` permanece ativo. Os PRs `#73`, `#74` e
  `#75` eliminaram instalações duplicadas e builds Node sob QEMU, preservando
  runners finais ARM64 e o engine Prisma específico para Alpine ARM64.
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
  rascunho e ainda não habilita endpoint, entrega ou UI. O HEAD `228c2554`
  alinha o Prisma Client a Alpine ARM64 e aguarda comprovação integral do CI
  antes de novo lote. Permanecem necessários rate limiter real, estado canônico
  de e-mail verificado, auditoria persistente, transporte real, redefinição
  atômica e smoke de entrega.
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
- O CI `#272` comprovou no PR `#75` qualidade, migration/integração, API
  ARM64 e Gate consolidado.
- O push `#273` comprovou novamente API e Web ARM64 no SHA integrado
  `3297f357`.
- O runtime final da API continua Alpine ARM64 com Prisma
  `linux-musl-arm64-openssl-3.0.x`; dependências, geração, build e testes
  executam no `BUILDPLATFORM` nativo.

## Homologação

O CI de push `#273` aprovou qualidade, migration/integração, API ARM64, Web
ARM64 e o Gate consolidado para
`3297f357ab8483bc4c895fac52990880276e119a`.

O passo SSH publicou exatamente esse SHA, concluiu a migration e confirmou
PostgreSQL, Redis e API saudáveis. A etapa posterior
`Comprovar domínio público e HTTPS` falhou após 36 timeouts sem handshake. A
issue `#68` registra a evidência e o procedimento pendente:

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

1. concluir causalmente o CI do HEAD `228c2554` do PR `#72`;
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
