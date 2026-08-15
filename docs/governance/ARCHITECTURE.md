# Arquitetura canônica — índice e invariantes

## Visão do produto

Evolvia é uma plataforma SaaS multi-organização para criação, homologação,
publicação e operação de eventos, em modelo self-service assistido pela EVA.
O organizador deve conseguir colocar um evento no ar sem conhecimento técnico,
com confirmação explícita nas ações sensíveis.

## Base técnica verificada

- Web: Next.js.
- API: NestJS.
- Persistência: PostgreSQL.
- Estado/infra auxiliar: Redis.
- Empacotamento: Docker Compose.
- Entrada/reverse proxy: Nginx.
- Ambiente obrigatório: Ubuntu/ARM64.

## Agregados e escopo

O mapa detalhado da fundação está em
`../v0.2-foundation/02-arquitetura.md`. As invariantes transversais são:

- `Organization` delimita o tenant;
- `OrganizationMembership` associa usuário, organização e papel;
- `Event` pertence a uma organização e é o registro canônico do evento;
- `EventCapability` habilita capacidades conhecidas por evento;
- `EventWizardSession` preserva o fluxo self-service e a retomada;
- autorização considera organização, evento, papel, permissão, estado e vínculo;
- atores científicos externos não herdam automaticamente identidade
  administrativa;
- interfaces públicas recebem DTOs minimizados e nunca rascunho interno.

## Princípios de mudança

- Não duplicar dados já canônicos no `Event` ou em entidades de domínio.
- Backend impõe autorização, invariantes e idempotência.
- Frontend orienta a experiência, mas não concede permissão.
- Capabilities permanecem desacopladas e ativadas conforme perfil/configuração.
- Mudança de schema é expansiva e compatível; restringir ocorre em corte posterior.
- Rollback da aplicação deve continuar possível após a expansão do banco.
- Publicação é transição explícita, autorizada, auditável e nunca ação silenciosa
  da EVA.

## Ordem funcional

1. Divulgação do Evento.
2. Inscrição.
3. Área Reservada do Inscrito.
4. Jornadas seguintes aprovadas no backlog canônico.

Capacidades científicas já construídas são preservadas, mas não autorizam furar
essa sequência para a evolução do produto.

## Documentação aprofundada

- Escopo da fundação: `../v0.2-foundation/01-escopo.md`.
- Dados e migrations: `../v0.2-foundation/03-modelo-de-dados-e-migracao.md`.
- Segurança: `../v0.2-foundation/04-seguranca-e-autorizacao.md`.
- Testes: `../v0.2-foundation/05-criterios-de-aceite-e-testes.md`.
- Entrega/rollback: `../v0.2-foundation/06-plano-de-entrega-e-rollback.md`.

Quando código e documentação divergirem, abra uma decisão de reconciliação; não
mascare a diferença atualizando apenas um resumo.
