---
snapshot_at_utc: 2026-09-04T02:10:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha: aaf954c338faa7ad52e9bf8faa5053ec7da5c10b
active_phase: "Fase 1 — Divulgação do Evento"
active_work: "Consolidação do Gate 1, WCAG humana e governança dos planejadores"
next_gate: "Evidência humana com tecnologia assistiva e HTTPS público"
next_phase: "Fase 2 — Inscrição, bloqueada pela EVO-006"
---

# Estado oficial do projeto

## Resumo executivo

- A integração ocorre em
  `develop@aaf954c338faa7ad52e9bf8faa5053ec7da5c10b`.
- `main`, produção e infraestrutura não foram alteradas nesta atualização.
- A Fase 1 continua ativa. Não há evidência suficiente para declarar o Go/No-Go:
  permanecem a homologação humana com leitor de tela e o HTTPS público da issue
  `#68`.
- A Fase 2 — Inscrição permanece bloqueada pela decisão `EVO-006`. Páginas
  locais de planejamento são material orientativo e não constituem Registration,
  Payment, Scientific ou qualquer engine funcional.
- O PR `#280` integrou a fundação compartilhada dos planejadores: shell,
  escolhas nativas e estados acessíveis, sem rede, persistência ou dados
  pessoais.
- A issue `#281` contém o contrato anti-duplicação dessa família, mas o Cursor
  recusou a execução por limite de gasto dos agentes em segundo plano.
- As issues `#274`, `#277` e `#278` registram somente aceite inicial do
  Cursor e não possuem PR ou handoff. Não devem ser reportadas como entregues ou
  em execução comprovada.
- Vários planejadores anteriores permanecem em PRs Draft. CI verde isolado não
  autoriza integração em massa; cada PR precisa adotar a fundação compartilhada,
  manter valor de produto e passar revisão visual.
- O PR `#149` permanece Draft e baseado em SHA anterior de `develop`; seus
  checks antigos não autorizam merge sem sincronização e validação do novo HEAD.

## Entregas comprovadas recentes

| Entrega | Estado verificável | Evidência |
| --- | --- | --- |
| Árvore e runtime acessíveis das rotas públicas | integrada | PRs `#162` e `#163` |
| Skip links e cabeçalho público | integrados | PRs `#165` e `#156` |
| Cleanup resiliente do Chromium | integrado | PR `#167` |
| Feedback global seguro de erro | integrado | PR `#194` |
| Taxonomia Web/API e capabilities | integradas | PRs `#209`, `#211`, `#212`, `#216` e `#218` |
| Roteador de configuração resiliente | integrado | PR `#217` |
| Espaçamento WCAG runtime e correção jurídica | integrados | PR `#172`, merge `dcac1903` |
| Fundação dos planejadores locais | integrada | PR `#280`, merge `aaf954c3` |

Os SHAs e checks terminais de cada rodada estão registrados na issue de auditoria
`#159`.

## Gate atual

Antes de declarar a Fase 1 concluída, ainda é necessário:

1. concluir a evidência humana de teclado, foco e NVDA/VoiceOver nos fluxos
   críticos;
2. comprovar HTTPS público, redirecionamento e healthcheck canônico quando a
   intervenção administrativa da issue `#68` estiver disponível;
3. revisar os PRs Draft contra o `develop` vivo, sem reaproveitar CI de HEAD
   anterior;
4. consolidar apenas páginas orientativas que reutilizem a fundação do PR
   `#280`;
5. manter a Fase 2 bloqueada até Go/No-Go explícito.

## Segurança e compatibilidade preservadas

- autorização backend `deny-by-default`;
- isolamento por `organizationId + eventId` e DTO mínimo;
- migrations expansivas, idempotência, auditoria e rollback;
- Ubuntu/ARM64 obrigatório;
- WCAG 2.2 AA, reflow a 320 px e PT-BR;
- nenhum segredo ou dado pessoal em evidência;
- nenhuma alteração de `main` ou produção sem decisão explícita.

## Capacidade do Cursor

Estado observado em 04/09/2026 02h10 UTC:

- `#274`, `#277` e `#278`: aceite inicial, sem handoff;
- `#281`: bloqueada explicitamente pelo limite de gasto do Cursor;
- retomada exige liberar o limite de agentes em segundo plano;
- até essa liberação, contratos permanecem prontos e o Codex continua apenas em
  paths independentes.

## Próximos passos elegíveis

1. concluir e integrar esta reconciliação de governança;
2. após liberação do Cursor, executar `#281` e exigir o contrato compartilhado
   nos planejadores;
3. revisar um planejador representativo contra a fundação antes de integrar a
   família;
4. concluir evidência humana WCAG;
5. resolver `#68` quando houver autoridade administrativa;
6. emitir Go/No-Go da Fase 1; só então avaliar a Fase 2.

## Como atualizar este arquivo

Atualizar após merge, mudança de Gate, decisão do Product Owner ou bloqueio
relevante. Usar fatos verificáveis, data e SHA. Não converter issue aberta,
código gerado, teste local declarado ou CI de outro HEAD em prova de conclusão.
