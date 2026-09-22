---
snapshot_at_utc: 2026-09-22T16:15:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha_at_branch_start: 236f7ac4a29df6a330f93cd50b1dd358314bfbb3
delivery_mode: "Modo Lançamento — EVO-015"
active_phase: "Fase 2 — Inscrição, configuração comercial"
active_work: "PR #327 — cupons, convites e cortesias"
next_cut: "reserva de inscrição e aplicação atômica dos códigos"
---

# Estado oficial do projeto

## Resumo executivo

- O Product Owner autorizou expressamente o **Modo Lançamento**: cortes verticais
  utilizáveis com tela + API + banco + testes + homologação, mantendo segurança
  e governança incorporadas à funcionalidade.
- EVO-015 substitui o bloqueio absoluto da EVO-006 para preparação em
  `develop` e homologação. Abertura pública, `main` e produção continuam
  bloqueadas por Go/No-Go explícito.
- Categorias e lotes estão integrados em `develop@236f7ac4`: banco, API, tela,
  revisão otimista, auditoria, acessibilidade e ARM64 passaram no PR #325.
- O backend de categorias/lotes foi implantado no SHA anterior `4a377fab`.
  Não há evidência de deploy do SHA `236f7ac4`; portanto a tela não é declarada
  homologada até uma implantação exata comprovada.
- O PR #327 concentra o próximo corte completo: cupons, convites e cortesias,
  sem PR documental separado.
- Inscrição pública, reserva, consumo de código, checkout, Asaas e webhooks
  permanecem bloqueados até os cortes correspondentes.
- O residual do Gate 1 continua conhecido: versão do Nginx exposta e evidência
  humana NVDA/VoiceOver. Isso não autoriza `main` ou produção.
- Versões permanecem `0.2.0-alpha.3` em desenvolvimento/homologação e
  `0.1.1` em produção. Nenhuma release foi criada.

## Entregas verificáveis recentes

| Entrega | Estado | Evidência |
| --- | --- | --- |
| API de categorias e lotes | integrada e implantada | PR #323, `develop@4a377fab`, CI #762 |
| Tela de categorias e lotes | integrada; deploy ainda não comprovado | PR #325, `develop@236f7ac4`, CI #765 |
| Cupons, convites e cortesias | em implementação vertical | issue #326 e PR #327 |
| Governança do Modo Lançamento | incorporada ao PR funcional | EVO-015 no PR #327 |

## Contrato do corte ativo

1. migration aditiva e rollback por reversão da aplicação;
2. modelos isolados por `organizationId + eventId`;
3. API autenticada com ACL de editor, revisão otimista e transação;
4. tela PT-BR no painel, reflow a 320 px, teclado e foco visível;
5. auditoria sem registrar os códigos;
6. testes de política, arquitetura, Web, integração e ARM64;
7. merge somente do HEAD exato verde e revisado;
8. deploy do SHA integrado e verificação em homologação.

## Sequência do Modo Lançamento

1. categorias e lotes — integrado; homologação da tela pendente;
2. cupons, convites e cortesias — PR #327;
3. reserva de inscrição com aplicação atômica de categoria/lote/código;
4. checkout Asaas e webhooks idempotentes;
5. área reservada do participante.

## Limites preservados

- `main` e produção sem alteração;
- nenhuma inscrição ou cobrança liberada silenciosamente;
- deny-by-default, isolamento multi-tenant, LGPD e DTO mínimo;
- migrations aditivas, idempotência, auditoria e rollback;
- Node 22, Ubuntu/ARM64, PostgreSQL, Redis, Nginx e Docker;
- WCAG 2.2 AA e português brasileiro.

## Como atualizar este arquivo

Atualizar após merge, mudança de direção ou evidência de homologação. Não
converter CI de PR em deploy nem automação em validação humana.
