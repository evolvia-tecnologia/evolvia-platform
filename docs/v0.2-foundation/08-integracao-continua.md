# Integração contínua da fundação v0.2

A solicitação de pull executa automaticamente dois gates:

## Qualidade, tipos e build

- instalação reproduzível por `npm ci`;
- validação e geração do Prisma;
- verificação TypeScript da API e da Web;
- build da API e da Web;
- testes unitários da política de membros e do slug.

## Migration e integração

- construção integral por Docker Compose;
- PostgreSQL e Redis descartáveis;
- aplicação das migrations;
- verificação de health da API e da Web;
- cadastro de duas contas;
- criação automática de organizações pessoais;
- inclusão de membro como `MANAGER`;
- criação e isolamento de eventos por organização;
- bloqueio da elevação indevida de papel;
- proteção do último `OWNER`;
- segunda execução da migration sem duplicação;
- destruição automática do ambiente ao final.

Nenhuma credencial de produção é utilizada.
