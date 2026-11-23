# G5.8 — Claim persistente de avisos a autores (corte Work de 21/11)

## Defeito reproduzido
A PR #610 enviava avisos por autor/coautor com Idempotency-Key estável, mas verificava só AuditLog **antes** do POST. Duas instâncias concorrentes podiam observar ausência de aceite e disparar duas chamadas ao mesmo destinatário. Evidência: #610/7070138254.

## Contrato de estado
`ScientificAuthorNotice` continua sendo a origem da notificação por submissão/versão. `ScientificNoticeDispatch` é a reserva durável **por destinatário** com PK SHA-256, escopo e versão, sem e-mails gravados. Os leitores validam submissão CONFIRMED, organização, evento, opt-in e autor vinculado **antes** de reivindicar o registro.

- `PROCESSING`: uma instância venceu o INSERT ou CAS e é a única autorizada a tentar o POST. Nunca manter transação SQL aberta durante rede.
- `ACCEPTED`: gateway retornou 2xx; **não** indica mensagem recebida. Gravar o resultado ANTES do AuditLog; replay não reenvia.
- `FAILED`: rejeição explícita de 4xx exceto 408/429. Retry após no mínimo 60 s, CAS atômico e até três tentativas.
- `UNKNOWN`: 5xx, 408, 429, timeout, erro de rede ou `PROCESSING` vencido em que o POST pode ter acontecido. **Nunca reenviar automaticamente** sem verificação autenticada do provedor; prioridade é evitar duplicação ao destinatário.

A chave continua a mesma entre tentativas. `ScientificAuthorNotice` não é duplicado e o `AuditLog` existente preserva `delivered=false`, `received=false` sem confirmação independente.

## Verificação mínima
Build/Prisma, unitários do worker e PostgreSQL com **duas conexões** (`scientific-notice-dispatch.postgres.test.mjs`): um claim por chave; concorrência de duas instâncias; falha pós-envio que volta como UNKNOWN; limite de três tentativas após falha definitiva; recusa de scope divergente. Testes não enviam e-mails externos. A prova de recebimento em caixa autorizada é separada.

## Riscos e operação
A linha UNKNOWN precisa de reconciliação por operador/integração com o provedor antes de qualquer novo envio — o corte atual é fail-closed, não inventa recuperação segura universal. Uma falha após aceite e antes da atualização do estado também resulta em UNKNOWN após vencimento do lease. O worker só ativa com opt-in explícito por organização e evento.

**Rollback:** desabilitar `EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED` e reverter serviço. Preservar tabela/migration e registros para auditoria; não apagar claims ou forçar reenvio. A próxima fase poderá oferecer console seguro de reconciliação de UNKNOWN, após contrato do provedor e autorização explícita.

## Integração
A PR #702 foi construída sobre o código da #610 e incorpora o worker existente, o claim e seus testes. Não integrar em paralelo às duas PRs sem reconciliação; escolher a pilha ou substituir #610 por #702 após revisão independente, CI completo e teste PostgreSQL. Não creditar G5.8 nem aumentar EVO-018 antes do merge/publicação/aceite.
