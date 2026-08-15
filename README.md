# Evolvia Core

Plataforma self-service assistida pela EVA para criação, configuração,
homologação e operação de eventos.

## Estado do projeto

- produção estável: `v0.1.1`;
- desenvolvimento: `0.2.0-alpha.3`;
- ramo de integração: `develop`;
- fase ativa: Fase 1 — Divulgação do Evento;
- estado executivo: `docs/governance/PROJECT_STATE.md`.

O arquivo `VERSION` é a fonte da versão de desenvolvimento. O snapshot de
governança deve ser confirmado contra GitHub antes de cada novo avanço.

## Fundação v0.2

A versão em desenvolvimento inclui:

- cadastro, login e organização pessoal;
- organizações, membros e papéis;
- isolamento de dados por organização;
- painel do organizador;
- Wizard persistente no servidor;
- autosave e retomada em outro dispositivo;
- controle de concorrência por revisão;
- capabilities recomendadas por perfil de evento;
- testes unitários, integração e smoke test;
- PostgreSQL, Redis, NestJS, Next.js e Docker Compose;
- publicação automática da homologação com healthcheck e rollback.

## Segurança de entrega

O ramo `main` representa a linha estável. Novas entregas são desenvolvidas em
branches isoladas, validadas por GitHub Actions, integradas em `develop` e
somente depois promovidas de forma controlada.

Leia `AGENTS.md` antes de alterar o repositório. Consulte
`docs/governance/README.md` para estado, decisões, backlog e fluxo do
Orquestrador, e `docs/v0.2-foundation` para a arquitetura detalhada da fundação.
