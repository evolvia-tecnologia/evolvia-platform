# Fase 1 — Divulgação do Evento · Lote 2

## Objetivo
Definir e implementar o modelo editorial e a API administrativa/pública da Divulgação sem duplicar os dados canônicos do `Event`/Wizard, preservando isolamento por tenant, auditoria, acessibilidade e publicação explícita.

## Princípios
- `Event` permanece fonte canônica para nome, slug, perfil, formato, datas, local, registration mode, status e capabilities.
- Conteúdo editorial novo é event-scoped e organization-scoped.
- Nenhum endpoint público pode retornar rascunho, homologação, auditoria ou dados internos do Wizard.
- ACL é deny-by-default no backend; esconder menu não conta como autorização.
- Toda mutação relevante registra auditoria com `organizationId + eventId + actorUserId`.
- Estados editoriais não competem com `EventStatus`; o estado administrativo do evento continua sendo a máquina de estados canônica.
- Publicação nunca é automática pela EVA.

## Modelo proposto
### EventPublication
Um agregado editorial 1:1 por evento, apenas para dados novos de presença pública.

Campos previstos:
- `id`
- `organizationId`
- `eventId`
- `shortDescription`
- `fullDescription`
- `publicContactEmail`
- `publicContactPhone`
- `logoAssetId` (reservado para capability de upload segura)
- `coverAssetId` (reservado para capability de upload segura)
- `seoTitle`
- `seoDescription`
- `socialImageAssetId`
- `accessibilitySummary`
- `themeConfig` JSON validado, restrito a tokens permitidos e contraste AA
- `revision`
- `createdAt`
- `updatedAt`

Não copiar para esta tabela `name`, `slug`, `format`, `startDate`, `endDate`, `venue`, `profileCode`, `registrationMode` ou `status`.

### EventPublicationSection
Blocos habilitáveis/ordenáveis:
- `id`
- `organizationId`
- `eventId`
- `publicationId`
- `kind`
- `title`
- `enabled`
- `sortOrder`
- `content` JSON sanitizado/validado por `kind`
- `canonicalSourceType` opcional
- `canonicalSourceId` opcional
- `revision`
- timestamps

Tipos iniciais do Lote 2 devem ser apenas os necessários para o contrato da API; o editor visual fica no Lote 3. Blocos que apontarem para convidados/programação usam referência canônica, não cópia de pessoa/atividade.

### Revisionamento
Lote 2 usa revisão otimista (`revision`) e auditoria; snapshots editoriais completos para rollback só entram se necessários ao preview/homologação do Lote 4/5. Evitar complexidade prematura.

## ACL administrativa
Leitura administrativa do conteúdo: membros ACTIVE com acesso ao evento.

Mutação editorial: OWNER, ADMIN ou MANAGER ACTIVE da organização do evento. OPERATOR/VIEWER não alteram Divulgação por padrão neste Gate.

Toda busca deve validar o par `organizationId + eventId`; falha de tenant/IDOR responde como recurso inexistente, sem revelar existência cruzada.

## DTOs
### AdminPublicationDto
Pode retornar:
- dados editoriais;
- `Event` canônico minimizado necessário ao editor;
- revisão;
- pendências/checklist calculado;
- permissões efetivas do usuário.

Nunca retornar secrets, dados de auditoria brutos ou respostas internas do Wizard.

### PublicEventDto
Somente no Lote 4 será exposto publicamente, mas o contrato deve nascer no Lote 2:
- evento canônico publicável;
- conteúdo editorial explicitamente habilitado;
- referências canônicas que estejam liberadas para público;
- metadados SEO permitidos;
- informações de acessibilidade configuradas.

Regra: somente `EventStatus.PUBLISHED` produz DTO público final. Preview/homologação usam rota autenticada distinta e nunca o endpoint público.

## Política de estado
- `DRAFT`/`SETUP`: edição permitida conforme ACL.
- `HOMOLOGATION`: edição editorial bloqueada por padrão; correção exige retorno explícito a estado editável pelo fluxo de homologação futuro.
- `READY_TO_PUBLISH`: conteúdo congelado para publicação; alterações exigem regressão explícita do estado.
- `PUBLISHED`: nenhuma mutação silenciosa; alteração futura deve abrir nova revisão e novo ciclo de homologação.
- `SUSPENDED`, `FINISHED`, `CANCELLED`: mutação de Divulgação negada por padrão neste Gate.

O serviço deve centralizar essa regra em policy própria, sem espalhar condicionais por controllers.

## Auditoria
Ações mínimas:
- `PUBLICATION_CREATED`
- `PUBLICATION_UPDATED`
- `PUBLICATION_SECTION_CREATED`
- `PUBLICATION_SECTION_UPDATED`
- `PUBLICATION_SECTION_REORDERED`
- `PUBLICATION_SECTION_REMOVED`

Metadata não deve conter conteúdo sensível completo; registrar campos alterados, revisão anterior/nova e IDs.

## Segurança
- class-validator nos DTOs de entrada;
- limites de tamanho para textos;
- URLs apenas `https` quando externas;
- conteúdo rico não aceita HTML arbitrário no Lote 2; armazenar estrutura/texto validado;
- uploads ficam fora do Lote 2 até existir política de asset segura;
- idempotência para operações que possam ser repetidas por autosave no Lote 3;
- prevenção explícita de cross-org/cross-event;
- nenhuma rota pública neste lote expõe conteúdo privado.

## EVA
O Lote 2 prepara somente o contexto seguro consumível pela EVA:
- estado do evento;
- revisão editorial;
- pendências calculadas;
- campos/blocos presentes;
- permissões efetivas.

A EVA não recebe autorização especial. Qualquer futura mutação usa a mesma API administrativa, ACL e auditoria.

## Acessibilidade
O modelo deve suportar:
- texto alternativo para imagens quando assets entrarem;
- marcação explícita de imagem decorativa;
- resumo de acessibilidade do evento/local;
- tokens de tema com validação de contraste;
- conteúdo estruturado semanticamente pelo renderer, não HTML livre do organizador.

## Testes obrigatórios antes de Ready
- unitários da policy de estado;
- ACL OWNER/ADMIN/MANAGER vs OPERATOR/VIEWER;
- membro suspenso/removido;
- IDOR/cross-event/cross-organization;
- revisão otimista/conflito de versão;
- validação de payload e limites;
- auditoria sem vazamento de conteúdo sensível;
- migration descartável e idempotente;
- testes globais/API sem regressão;
- build API/Web ARM64;
- homologação real em `develop` após merge.

## Sequência de implementação
1. adicionar schema/migration expansivos do agregado editorial;
2. policy de mutação da Divulgação;
3. service/repository transacional;
4. controller/DTO administrativo;
5. auditoria e testes de tenant/ACL;
6. preparar contrato de DTO público, sem endpoint público final;
7. CI completo e Draft PR;
8. somente após Gate verde seguir ao Lote 3.

## Fora deste lote
- editor visual;
- upload de logo/capa;
- renderer/página pública;
- preview visual;
- SEO renderizado;
- CTA de inscrição/submissão funcional;
- publicação em produção.
