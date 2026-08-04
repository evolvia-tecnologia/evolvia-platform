# Modelo de Dados e Estratégia de Migration

## Novas entidades propostas

### Organization

- `id`
- `name`
- `slug`
- `status`
- `createdById`
- `createdAt`
- `updatedAt`

### OrganizationMembership

- `id`
- `organizationId`
- `userId`
- `role`
- `status`
- `invitedById`
- `joinedAt`
- `createdAt`
- `updatedAt`

Restrições:

- unicidade de `organizationId + userId`;
- índices por usuário, organização, papel e estado.

### EventCapability

- `id`
- `eventId`
- `code`
- `status`
- `config`
- `schemaVersion`
- `createdAt`
- `updatedAt`

Restrição:

- unicidade de `eventId + code`.

### EventWizardSession

- `id`
- `eventId`
- `flowVersion`
- `currentStep`
- `answers`
- `completionPercent`
- `status`
- `lastSavedAt`
- `createdAt`
- `updatedAt`

Restrição:

- uma sessão ativa por evento e versão do fluxo.

### AuditLog

- `id`
- `organizationId`
- `actorUserId`
- `eventId`
- `action`
- `entityType`
- `entityId`
- `metadata`
- `createdAt`

## Alteração em Event

Adicionar inicialmente:

- `organizationId` como opcional;
- `createdById`;
- `status` com compatibilidade para registros existentes.

## Sequência obrigatória de migration

### Fase 1 — Expandir

1. Criar novas tabelas.
2. Adicionar colunas opcionais ao evento.
3. Criar índices e restrições não destrutivas.
4. Manter rotas antigas compatíveis.

### Fase 2 — Migrar dados

1. Criar organização pessoal padrão para usuários existentes.
2. Criar membership `OWNER`.
3. Relacionar eventos existentes à organização correspondente.
4. Validar contagens antes e depois.

### Fase 3 — Validar

1. Confirmar que nenhum evento ficou sem organização.
2. Confirmar unicidade dos memberships.
3. Executar testes de autorização entre organizações.
4. Registrar relatório de migration.

### Fase 4 — Restringir

Somente em uma publicação posterior:

1. tornar `organizationId` obrigatório;
2. remover caminhos legados;
3. aplicar restrições finais.

Nenhuma exclusão de coluna ocorrerá na primeira entrega da v0.2.
