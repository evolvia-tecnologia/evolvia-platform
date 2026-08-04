# Implementação — Fase 1: Organizações e escopo de eventos

## Implementado

- entidades `Organization`, `OrganizationMembership` e `AuditLog`;
- estruturas reservadas para `EventCapability` e `EventWizardSession`;
- organização pessoal criada junto com cada nova conta;
- backfill determinístico para usuários e eventos existentes;
- papéis `OWNER`, `ADMIN`, `MANAGER`, `OPERATOR` e `VIEWER`;
- inclusão, alteração de papel e remoção de membros já cadastrados;
- proteção do último proprietário;
- eventos vinculados a uma organização sem quebrar a API atual;
- consultas de eventos com escopo organizacional no backend;
- auditoria de criação de organização, membros e eventos;
- testes unitários de política e integração em banco descartável.

## Compatibilidade

A rota `POST /events` continua aceitando o formato utilizado pela Web v0.1.1.
Quando `organizationId` não é enviado, a API seleciona a primeira organização
ativa na qual o usuário pode criar eventos.

## Ainda não implementado

- interface visual para troca de organização e gestão de membros;
- convite de pessoas sem conta;
- criação do evento vazio desde o primeiro passo;
- persistência das respostas do Wizard;
- gerenciamento de capabilities pela interface.

Esses itens entram nas próximas fases, sobre esta base validada.
