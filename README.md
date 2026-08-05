# Evolvia Core

Plataforma self-service assistida pela EVA para criação, configuração,
homologação e operação de eventos.

## Estado do projeto

- produção estável: `v0.1.1`;
- desenvolvimento: `0.2.0-alpha.2`;
- ramo de integração: `develop`;
- homologação: publicada automaticamente após testes verdes.

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
`feature/*`, validadas por GitHub Actions, integradas em `develop` e somente
depois promovidas de forma controlada.

Consulte `docs/v0.2-foundation` para arquitetura, regras, critérios e histórico
das fases.
