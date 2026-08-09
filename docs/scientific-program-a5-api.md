# Contratos funcionais A5

Rotas autenticadas sob `/scientific-events/:eventId/program`:

- `GET /` — visão consolidada da programação, espaços, pessoas, taxonomia, conflitos e próxima ação;
- `GET /conflicts` — diagnóstico de bloqueios e alertas;
- `POST /spaces` — cria espaço;
- `PATCH /spaces/:spaceId` — atualiza ou desativa espaço sem apagar histórico;
- `POST /activities` — cria atividade;
- `PATCH /activities/:activityId` — atualiza atividade e retorna o status a rascunho;
- `POST /activities/:activityId/participants` — vincula pessoa canônica da Grade científica;
- `DELETE /activities/:activityId/participants/:participantId` — remove o vínculo da atividade;
- `POST /activities/:activityId/ready-for-review` — marca como pronta apenas sem conflito bloqueante.

Todas as mutações passam pela política de estado do evento, autorização organizacional e auditoria. Referências A5 carregam escopo composto de evento e organização.
