# Arquitetura da Fundação v0.2

## Agregados principais

```text
User
  └── OrganizationMembership
        └── Organization
              ├── Event
              │     ├── EventCapability
              │     └── EventWizardSession
              └── AuditLog
```

## Organização

A organização representa a empresa, entidade, associação, agência ou equipe
responsável pelos eventos.

Um usuário pode participar de várias organizações e ter papel diferente em
cada uma.

## Papéis iniciais

- `OWNER`: controle integral e gestão de proprietários.
- `ADMIN`: gestão operacional, membros e eventos.
- `MANAGER`: criação e configuração de eventos.
- `OPERATOR`: operação permitida, sem gestão estrutural.
- `VIEWER`: somente leitura.

Permissões serão verificadas no backend. Ocultar botões no frontend não será
considerado mecanismo de segurança.

## Evento como registro canônico

O evento nasce com status `DRAFT`. O próprio registro `Event` é atualizado
durante o Wizard.

A publicação futura altera o estado do evento após validações de homologação.
Não será criada uma segunda cópia do evento para representar o rascunho.

## Wizard persistente

`EventWizardSession` guarda:

- evento relacionado;
- versão do roteiro;
- etapa atual;
- respostas estruturadas;
- percentual calculado;
- data do último salvamento;
- estado da sessão.

Cada salvamento deve ser idempotente e validado no servidor.

## Capabilities

`EventCapability` relaciona o evento a uma capacidade conhecida pelo catálogo
da Evolvia.

Exemplos iniciais:

- `registration`
- `payment`
- `credential`
- `access_control`
- `scientific_submission`
- `certificate`
- `exhibitor`
- `communication`
- `material_delivery`

Cada registro terá estado e configuração JSON versionada. O catálogo de
capabilities será controlado pelo código nesta etapa, evitando cadastros
arbitrários no banco.

## Compatibilidade

A v0.2 deve manter:

- cadastro e login existentes;
- listagem de eventos;
- criação básica de evento;
- healthcheck;
- PostgreSQL e Redis atuais;
- build ARM64;
- Nginx atual.
