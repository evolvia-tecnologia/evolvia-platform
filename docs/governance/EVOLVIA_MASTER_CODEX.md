# Evolvia Master Codex

Registro canônico do patrimônio intelectual, das decisões estratégicas e do estado
executivo da Evolvia. O código, os testes e os SHAs auditados continuam sendo a
fonte primária de verdade; este documento conecta essas evidências à visão de produto.

## Identidade e direção

- Produto: plataforma operacional inteligente para eventos, self-service e assistida pela EVA.
- Framework: IICEE — Inteligência, Integração, Confiabilidade, Experiência e Evolução.
- Abrangência: organizações e eventos isolados, múltiplos países, portes e perfis de evento.
- Idioma-base: português brasileiro, com arquitetura preparada para internacionalização.
- Branches: `develop` integra; `main` e produção dependem de Go/No-Go explícito.

## Princípios invariáveis

1. Segurança e LGPD por padrão, com autorização backend `deny-by-default`.
2. Isolamento obrigatório por `organizationId + eventId` e DTOs mínimos.
3. EVA orienta e sugere; não publica nem executa ação sensível silenciosamente.
4. WCAG 2.2 AA, teclado, foco, reflow a 320 px e alvos de 44 px.
5. Ubuntu/ARM64, migrations aditivas, idempotência, auditoria e rollback.
6. Gates não são encerrados por intenção, número de ciclos ou CI de outro SHA.
7. Interfaces ou textos proprietários de terceiros não são copiados; conceitos gerais podem ser avaliados.

## Sequência canônica

1. Gate 1 — Divulgação do evento.
2. Gate 2 — Inscrição.
3. Gate 3 — Área reservada do inscrito.
4. Gate 4 — Configuração científica.
5. Gate 5 — Submissão pelo autor.
6. Gate 6 — Avaliação científica.
7. Gate 7 — Decisão científica.
8. Gate 8 — Arquivo final, pôster e ePoster.
9. Gate 9 — Programação científica.
10. Gate 10 — Operação do evento.
11. Gate 11 — Pós-evento.

## Estado auditado em 16/09/2026

- `develop@5ca73ee881484e7ea37f5d47534efea4d4c294cf` após os PRs #308 e #312.
- Gate 1 permanece tecnicamente em fechamento.
- O runtime automatizado, integração, migrations e builds ARM64 estão cobertos pelo CI.
- A homologação pública responde por HTTPS e o readiness comprova API e PostgreSQL.
- O Nginx ativo ainda precisa receber a configuração versionada que adiciona cabeçalhos defensivos e oculta a versão.
- A validação humana com NVDA/VoiceOver continua sendo evidência obrigatória, não substituível por automação.
- PRs #295, #296 e #297 foram sincronizados sem força com o `develop` e aguardam CI do novo HEAD.
- Gemini Developer permanece pausado. Por decisão do Product Owner, o Codex assume o backlog programável sem acionar `/plan` ou `/approve`.
- `main` e produção permanecem protegidos.

## Registro de decisões deste marco

### MC-2026-09-16-01 — Continuidade sem Gemini

- Contexto: executor seguro corrigido, mas chamadas do provedor não produziram plano verificável.
- Decisão: Codex assume temporariamente as atividades programáveis reservadas ao Gemini.
- Impacto IICEE: preserva evolução e confiabilidade sem reativar uma integração instável.
- Segurança: paths e workflows Gemini permanecem intocados; não há uso de secrets nem repetição cega.
- Rollback: retomar o Gemini somente após prova controlada bem-sucedida e decisão explícita.

### MC-2026-09-16-02 — Fechamento do Gate 1

- Código correto no repositório não equivale a servidor atualizado.
- O Gate 1 exige: HEAD integrado verde, homologação no mesmo SHA, cabeçalhos públicos conformes, evidência automatizada preservada e validação humana registrada.
- A Fase 2 só pode iniciar após o Go/No-Go formal previsto em EVO-006.

## Como manter este Codex

Atualizar após decisão do Product Owner, mudança de Gate, merge relevante, release,
incidente, alteração arquitetural ou evidência de homologação. Cada entrada deve citar
data, responsável, impacto IICEE, módulos, riscos, segurança/LGPD, compatibilidade,
testes, rollback, PRs, commits, CI e ambiente.
