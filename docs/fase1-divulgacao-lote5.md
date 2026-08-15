# Fase 1 — Lote 5: Go/No-Go da Divulgação

## Objetivo

Encerrar a Fase 1 com um Gate explícito, auditável e negado por padrão entre configuração, homologação, aprovação e publicação. A EVA informa pendências e orienta a pessoa usuária, mas não muda estado nem publica silenciosamente.

## Máquina de estados

```text
SETUP → HOMOLOGATION → READY_TO_PUBLISH → PUBLISHED
  ↑          │                 │
  └──────────┴─────────────────┘
```

- `SETUP → HOMOLOGATION`: OWNER, ADMIN ou MANAGER, somente com checklist obrigatório concluído.
- `HOMOLOGATION → READY_TO_PUBLISH`: somente OWNER ou ADMIN.
- `HOMOLOGATION → SETUP`: OWNER, ADMIN ou MANAGER para correções.
- `READY_TO_PUBLISH → SETUP`: somente OWNER ou ADMIN.
- `READY_TO_PUBLISH → PUBLISHED`: somente OWNER ou ADMIN e confirmação literal `PUBLICAR`.
- toda transição não declarada é recusada.

Durante HOMOLOGATION e READY_TO_PUBLISH, alterações editoriais ficam congeladas. A transição exige a revisão editorial salva, impedindo aprovação de uma versão concorrente.

## Invariantes de segurança e dados

- autorização é revalidada no backend; botões ocultos não são controle de segurança;
- consultas e locks preservam o escopo `organizationId + eventId`;
- o evento é bloqueado na transação para serializar edição e mudança de estado;
- o checklist é recalculado dentro da mesma transação;
- a publicação exige confirmação explícita e nunca é executada pela EVA;
- o DTO público permanece minimizado e não expõe `organizationId`;
- a ação gera auditoria `event.publication.status_changed` com estado anterior, destino, revisão e evidência da confirmação;
- este lote não altera schema nem exige migration.

## Experiência e acessibilidade

A interface administrativa apresenta:

- estado atual e sequência das quatro etapas;
- `aria-current="step"` na etapa ativa;
- checklist textual com rótulos, sem depender apenas de cor;
- contagem separada de bloqueios obrigatórios e recomendações;
- bloqueio de transição enquanto existirem alterações locais não salvas;
- diálogo nativo de confirmação para publicação;
- mensagens de erro e sucesso anunciadas;
- foco visível e alvos interativos mínimos de 44 px;
- ordem visual e ordem do DOM equivalentes em telas pequenas.

Validação manual mínima: teclado completo, foco do diálogo, zoom de 200%, viewport móvel, leitor de tela nos estados do Gate e contraste dos estados interativos.

## Evidência automatizada

- testes unitários da política de transições e deny-by-default;
- regressão da política editorial;
- smoke ponta a ponta: edição, preview privado, envio para homologação, congelamento, aprovação, rejeição sem confirmação, publicação confirmada e leitura pública minimizada;
- Gate de qualidade da API e Web;
- ambiente descartável com migration e idempotência;
- build e inspeção das imagens ARM64.

## Rollback

Antes de integrar, o rollback é o fechamento do PR ou a reversão dos commits da branch. Depois da integração em `develop`, usar um revert normal do squash merge; não reescrever histórico e não criar migration destrutiva. Se já houver um evento publicado em homologação, retornar o ambiente ao SHA anterior e preservar o log de auditoria para investigação.

## Não objetivos

Este lote não ativa inscrições, pagamentos, submissões científicas, certificados nem promoção para produção. A Fase 2 só começa após o Go/No-Go completo desta fase.

## Bloqueadores finais

A aprovação funcional do código não equivale a prontidão de produção. O Go/No-Go final ainda exige evidência do SHA em homologação, regressão manual WCAG 2.2 AA e HTTPS público válido com redirecionamento HTTP para HTTPS. Produção depende de autorização explícita do responsável.
