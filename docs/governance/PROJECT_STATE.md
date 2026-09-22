---
snapshot_at_utc: 2026-09-22T20:05:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha_at_branch_start: 72805ff56586b628589eeb9c1070d9ba531d20c6
delivery_mode: "Modo Lançamento — EVO-015"
active_phase: "Fase 2 — Inscrição, reserva pública"
active_work: "PR #329 — reserva pública completa"
next_cut: "checkout Asaas e webhooks idempotentes"
---

# Estado oficial do projeto

## Resumo executivo

- O Product Owner confirmou o **Modo Lançamento**: fatias utilizáveis com
  tela + API + banco + testes + homologação, mantendo segurança e governança
  incorporadas à funcionalidade.
- Categorias/lotes e cupons/convites/cortesias estão integrados em
  `develop@72805ff`.
- O SHA `72805ff` foi publicado em homologação: Web, API, PostgreSQL, HTTPS e
  rollback ficaram operacionais. O job externo permanece vermelho somente
  porque o proxy expõe `Server: nginx/1.24.0 (Ubuntu)`.
- O PR #329 concentra o corte completo de reserva pública, sem PR documental
  separado.
- Checkout, Asaas, webhooks e área do participante permanecem bloqueados até os
  cortes correspondentes.
- `main` e produção não foram alterados.

## Entregas verificáveis recentes

| Entrega | Estado | Evidência |
| --- | --- | --- |
| Categorias e lotes | integrada em develop | PRs #323/#325 |
| Cupons, convites e cortesias | integrada e implantada | PR #327, `develop@72805ff`, CI #771/#772 |
| Reserva pública | em implementação vertical | issue #328 e PR #329 |
| Proxy externo | pendência de infraestrutura | versão Nginx ainda exposta |

## Contrato do corte ativo

1. migration aditiva e rollback por reversão da aplicação;
2. modelos e FKs isolados por `organizationId + eventId`;
3. API pública somente para evento publicado, com DTO mínimo;
4. transação serializável, idempotência, duplicidade e estoque atômico;
5. tela PT-BR, teclado, foco, leitor de tela e reflow a 320 px;
6. auditoria sem PII, hashes para comparação e resposta pública minimizada;
7. testes de política, arquitetura, Web, PostgreSQL real e ARM64;
8. merge somente do HEAD exato verde e revisado;
9. deploy do SHA integrado e verificação em homologação.

## Sequência do Modo Lançamento

1. categorias e lotes — integrado;
2. cupons, convites e cortesias — integrado e homologado;
3. reserva pública — PR #329;
4. checkout Asaas e webhooks idempotentes;
5. área reservada do participante.

## Limites preservados

- `main` e produção sem alteração;
- cobrança real não existe neste corte;
- deny-by-default, isolamento multi-tenant, LGPD e DTO mínimo;
- migrations aditivas, idempotência, auditoria e rollback;
- Node 22, Ubuntu/ARM64, PostgreSQL, Redis, Nginx e Docker;
- WCAG 2.2 AA e português brasileiro.

## Como atualizar este arquivo

Atualizar após merge, mudança de direção ou evidência de homologação. Não
converter CI de PR em deploy nem automação em validação humana.
