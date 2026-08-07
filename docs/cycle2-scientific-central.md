# Ciclo 2 — Central do Evento Científico

Implementação inicial vinculada à issue #5.

## Entregue nesta branch
- rota dedicada da Central para eventos com `SCIENTIFIC_EVENT`;
- oito blocos científicos alinhados aos Gates A3–A9;
- decisões `Usar recomendação`, `Personalizar` e `Decidir depois`;
- persistência em `EventCapability` com auditoria;
- reconhecimento de capabilities já ativas em eventos científicos existentes;
- redirecionamento da configuração concluída para a Central;
- interface em português sem prometer módulos detalhados ainda não implementados;
- testes unitários da política da Central.

## Segurança
- nenhuma migration necessária: códigos novos usam `EventCapability.code` e decisões usam `config` JSON;
- alterações da Central ficam restritas aos estados mutáveis da fundação (`DRAFT` e `SETUP`);
- nenhuma publicação automática é executada pela Central;
- `main` e produção permanecem fora do escopo desta branch.
