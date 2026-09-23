---
snapshot_at_utc: 2026-09-23T00:00:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha_at_branch_start: ec4e4672d3c6e32f9f2e7f7d098e63b5e25aafb3
delivery_mode: "Modo Lançamento — EVO-015"
active_phase: "Fase 2 — Checkout Asaas e confirmação de pagamento"
active_work: "Issue #330 — checkout Asaas e webhooks idempotentes"
next_cut: "área reservada do participante"
---

# Estado oficial do projeto

## Resumo executivo

- O Product Owner confirmou o **Modo Lançamento**: fatias utilizáveis com
  tela + API + banco + testes + homologação, mantendo segurança e governança
  incorporadas à funcionalidade.
- Categorias/lotes, cupons/convites/cortesias e reserva pública estão integrados
  em `develop@ec4e467`.
- O SHA `ec4e467` foi publicado em homologação: Web, API, PostgreSQL, HTTPS e
  rollback ficaram operacionais. O job externo permanece vermelho somente
  porque o proxy expõe `Server: nginx/1.24.0 (Ubuntu)`.
- A issue #330 concentra o corte completo de checkout Asaas e webhooks, sem PR
  documental separado.
- A área reservada do participante permanece bloqueada até o próximo corte.
- `main` e produção não foram alterados.

## Entregas verificáveis recentes

| Entrega | Estado | Evidência |
| --- | --- | --- |
| Categorias e lotes | integrada em develop | PRs #323/#325 |
| Cupons, convites e cortesias | integrada e implantada | PR #327, `develop@72805ff`, CI #771/#772 |
| Reserva pública | integrada e implantada | issue #328, PR #329, `develop@ec4e467` |
| Checkout Asaas e webhooks | em implementação vertical | issue #330 |
| Proxy externo | pendência de infraestrutura | versão Nginx ainda exposta |

## Contrato do corte ativo

1. migration aditiva para intenção de checkout e eventos de webhook;
2. FKs e consultas isoladas por `organizationId + eventId`;
3. criação idempotente de checkout por reserva e valor calculado no servidor;
4. token de webhook validado em tempo constante e eventos deduplicados;
5. confirmação somente por `CHECKOUT_PAID` autenticado, nunca pelo callback;
6. pagamentos tardios ou divergentes destinados à conciliação sem perda;
7. tela PT-BR acessível, retorno por protocolo e estado consultado na API;
8. auditoria sem PII, segredos somente por ambiente e respostas minimizadas;
9. testes de política, arquitetura, Web, PostgreSQL real e ARM64;
10. merge somente do HEAD exato verde, deploy e verificação em homologação.

## Sequência do Modo Lançamento

1. categorias e lotes — integrado;
2. cupons, convites e cortesias — integrado e homologado;
3. reserva pública — integrado e homologado;
4. checkout Asaas e webhooks idempotentes — issue #330;
5. área reservada do participante — próximo corte.

## Limites preservados

- `main` e produção sem alteração;
- produção e cobrança real permanecem desabilitadas por padrão;
- deny-by-default, isolamento multi-tenant, LGPD e DTO mínimo;
- migrations aditivas, idempotência, auditoria e rollback;
- Node 22, Ubuntu/ARM64, PostgreSQL, Redis, Nginx e Docker;
- WCAG 2.2 AA e português brasileiro.

## Como atualizar este arquivo

Atualizar após merge, mudança de direção ou evidência de homologação. Não
converter CI de PR em deploy nem automação em validação humana.
