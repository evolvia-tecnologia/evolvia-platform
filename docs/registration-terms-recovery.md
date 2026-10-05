# Recuperação do primeiro PDF de termos

Issue #416. Gates 1/2. Base: develop@9399f49fb63ddbd55038e32143e5d85364bfc13e.

## Resultado e decisão

O organizador autorizado pode anexar o primeiro PDF ausente em HOMOLOGATION, READY_TO_PUBLISH ou PUBLISHED pelo construtor existente da ficha. Isso recupera eventos legados cuja reserva pública está bloqueada por ausência do documento. Nenhum documento anterior, mesmo substituído, pode ser sobrescrito nesses estados. DRAFT e SETUP preservam o versionamento existente; eventos encerrados/cancelados recusam a anexação.

A autorização continua usando EVENT_EDITOR_ROLES e organização derivada do evento. O estado e a existência de documentos são revalidados sob lock da linha Event, filtrado por eventId/organizationId. Criação, versionamento e auditoria são transacionais. A tentativa recusada remove somente seu novo PDF; PDFs anteriores e aceites permanecem intactos. Sem nova rota, schema, migration ou mudança das normas científicas.

## Validação

7 testes focais de serviço real recompilado: recuperação nos três estados; substituição em configuração; autorização; encerramento; documento concorrente; mudança de estado/desaparecimento sob lock; rollback da auditoria. Mais 5 testes reais de filesystem do armazenamento: 12/12 aprovados localmente em Node24.

A interface atual já oferece Anexar PDF sem condicionar ao status. CI Node22, tipos/API/Web, PostgreSQL descartável e ARM64 permanecem obrigatórios antes da integração. O lock precisa também de ensaio com PostgreSQL real; mocks não provam concorrência do banco. Deploy e percurso autenticado de inscrição em cada perfil ainda pendentes. Nenhum Gate é encerrado por este corte.

## Pendências e rollback

O checklist de publicação ainda precisa exigir o documento antes de oferecer inscrição pública. Esse bloqueio preventivo será tratado separadamente; este corte recupera somente o primeiro documento faltante.

Rollback: reverter aplicação, mantendo banco, versões, aceites e volume. Um PDF anexado por esta correção continua legível pelo código anterior; não excluir documentos no rollback.
