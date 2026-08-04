# Evolvia Core v0.1.1 — Fundação controlada

Primeira versão executável da Evolvia para desenvolvimento e homologação.

Inclui cadastro, login, painel, Wizard guiado, PostgreSQL, Redis, API NestJS, Web Next.js, Docker Compose e proxy Nginx.


## Alterações da Fundação v0.1.1

- dependências congeladas com package-lock.json;
- builds realizados com npm ci;
- typecheck no build;
- migration executada como etapa própria;
- healthchecks de PostgreSQL, Redis, API e Web;
- portas parametrizadas para validação isolada;
- candidata testada sem substituir a v0.1.
