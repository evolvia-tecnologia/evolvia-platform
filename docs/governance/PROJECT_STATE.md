---
snapshot_at_utc: 2026-08-15T05:53:32Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
stable_version: 0.1.1
integration_branch: develop
integration_sha: 05f26fe921e2b54383ba29b90ef000ee21af7166
development_version: 0.2.0-alpha.3
active_phase: "Fase 1 — Divulgação do Evento"
active_work: "Lote 4 — preview privado e SEO"
active_pr: 55
next_gate: "Lote 5 — Go/No-Go da Fase 1"
next_phase: "Fase 2 — Inscrição"
---

# Estado oficial do projeto

## Resumo executivo

- Produção permanece na `v0.1.1`; `main` não é alvo do trabalho atual.
- A integração ocorre em `develop`, versão `0.2.0-alpha.3`.
- A sequência funcional ativa é a Fase 1 — Divulgação do Evento, issue `#32`.
- O trabalho mais recente auditado é o PR `#55`, em rascunho, para preview
  privado e SEO final da Divulgação.
- Depois do Lote 4 vem o Lote 5, que concentra o Go/No-Go da Fase 1.
- A Fase 2 — Inscrição não deve começar antes da aprovação desse Gate.
- A comprovação pública de HTTPS foi adiada e não bloqueia o trabalho funcional
  autorizado neste momento.

Este snapshot informa o ponto de retomada, mas todo novo avanço deve confirmar
os SHAs, PRs e checks vivos antes de agir.

## Linha ativa

| Ordem | Entrega | Estado no snapshot | Evidência |
| ---: | --- | --- | --- |
| 1 | Fundação e navegação da Divulgação | integrada | histórico de `develop`/issue `#32` |
| 2 | Modelo editorial e API | integrada | documentação e histórico de `develop` |
| 3 | Editor de Divulgação | integrada | histórico da Fase 1 |
| 4 | Página pública, preview e SEO | em PR rascunho | PR `#55` |
| 5 | Go/No-Go completo da Fase 1 | próximo | critérios da issue `#32` |
| 6 | Fase 2 — Inscrição | bloqueada pelo Gate anterior | sequência canônica |

## Linhas preservadas, mas não ativas

- PR `#27`: fundação de identidade externa A6/A7, rascunho e com pendências.
- PR `#28`: regras de submissão A6, empilhado sobre o `#27`.
- PR `#23`: decisão científica A8, bloqueada até A6/A7 estarem completos e
  homologados.

Essas linhas não devem ser descartadas, porém não podem substituir a sequência
ativa nem ser mescladas por conveniência.

## Gate atual

Antes de declarar a Fase 1 concluída, exigir evidência de:

- qualidade e builds Web/API;
- testes completos, smokes e regressão;
- migration descartável, integração e idempotência;
- ARM64;
- ACL `deny-by-default`, isolamento e DTO público mínimo;
- acessibilidade WCAG 2.2 AA, incluindo validação manual nos fluxos críticos;
- preview fiel, publicação explícita e auditável;
- homologação real aplicável ao escopo, sem promover para produção.

## Próximo passo recomendado

Concluir e auditar o PR `#55`; depois abrir o corte do Lote 5 sem incluir
Registration Engine, Área Reservada, pagamentos completos ou portal AUTHOR.

## Como atualizar este arquivo

O Orquestrador atualiza este snapshot quando houver merge, mudança de Gate,
decisão do Product Owner ou bloqueio relevante. Use fatos verificáveis; não use
percentuais estimados nem declare checks como verdes sem evidência.
