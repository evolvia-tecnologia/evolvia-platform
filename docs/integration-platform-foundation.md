# Fundação da plataforma de integrações do Evolvia

Status: arquitetura candidata; implementação bloqueada pelos critérios e dependências abaixo.  
Referência: issue #112.  
Idioma canônico: Português do Brasil (`pt-BR`).

## Objetivo

Oferecer API pública, webhooks e conectores sem duplicar regras dos módulos nem romper o
isolamento por organização e evento. “Ter todas as integrações” significa permitir cobertura
ampla, observável e segura: conectores críticos mantidos pelo Evolvia e cauda longa atendida
por iPaaS, sempre com contrato explícito.

O benchmark funcional orienta capacidades, não interface, texto, payload, endpoint,
documentação ou marca de terceiros.

## Estado comprovado em 28/08/2026

A API interna NestJS atende as jornadas atuais, mas ainda não existe plataforma pública de
integrações. Não há módulo de chaves públicas, OpenAPI/portal, webhooks/outbox, runtime de
conectores, SDK ou marketplace. Redis está provisionado no Compose, porém não está consumido
pelo AppModule atual. Nenhuma dessas capacidades deve ser anunciada antes de implementação e
evidência executável.

## Princípios inegociáveis

1. Negar por padrão; papel não equivale a permissão.
2. Toda autorização considera usuário/chave, organização, evento, capability e ação.
3. Chaves, segredos e tokens nunca são armazenados em texto puro nem retornam após a criação.
4. O contrato público é versionado e não expõe IDs, campos ou regras internas desnecessárias.
5. Toda mutação é idempotente, correlacionada e auditável.
6. Webhooks são assinados e toleram reentrega, atraso e ordem diferente.
7. Conectores não executam código arbitrário e não acessam a rede interna.
8. Dados pessoais são minimizados, mascarados e retidos por prazo aprovado.
9. A EVA pode explicar, sugerir e preparar; criação de credencial, instalação, reenvio e
   publicação exigem confirmação explícita de pessoa autorizada.
10. Um conector com falha não interrompe inscrição, pagamento, acesso ou publicação.

## Arquitetura-alvo

| Componente | Responsabilidade | Controle mínimo |
|---|---|---|
| API pública `/v1` | Contratos estáveis por domínio | OpenAPI, paginação, filtros allowlist, idempotency key e versionamento |
| Serviço de credenciais | Criar, rotacionar e revogar chaves | prefixo público, segredo mostrado uma vez, hash forte, escopos, expiração |
| Outbox transacional | Registrar eventos junto à mudança de domínio | mesma transação, deduplicação e isolamento multi-tenant |
| Dispatcher de webhooks | Entregar eventos assinados | HMAC-SHA256, timestamp, retry com jitter, DLQ e replay autorizado |
| Fila | Desacoplar entrega e conectores | limites por tenant, backpressure, TTL e métricas |
| Runtime de conectores | Transformar contrato canônico em API externa | egress allowlist, cofre de segredos, timeout, circuit breaker |
| Registro/marketplace | Catálogo, instalação e permissões | versão, fornecedor, scopes, custo, saúde e desinstalação |
| Auditoria | Explicar quem fez o quê | actor/key, tenant, evento, trace, resultado e campos alterados |
| Portal/Sandbox | Documentar e testar sem dados reais | exemplos sintéticos, chaves separadas e rate limit próprio |

## Modelo canônico mínimo

- `IntegrationApplication`: identidade do aplicativo/fornecedor.
- `IntegrationInstallation`: instalação por organização e, opcionalmente, evento.
- `ApiCredential`: prefixo, hash, escopos, expiração, último uso e revogação.
- `WebhookEndpoint`: URL validada, eventos permitidos, segredo versionado e estado.
- `OutboxEvent`: tipo, versão, tenant, agregado, payload minimizado e ocorrência.
- `WebhookDelivery`: tentativa, status HTTP, latência, próxima tentativa e erro sanitizado.
- `ConnectorSecretReference`: referência ao cofre; nunca o segredo.
- `ConnectorJob`: operação assíncrona, idempotência, resultado e correlação.
- `IntegrationAuditEvent`: ação administrativa e efeito.

Todas as tabelas de execução carregam `organizationId`; as relacionadas a evento carregam
também `eventId`. Consultas sem ambos os escopos aplicáveis são proibidas.

## Contrato da API

- Base futura: `/api/public/v1`; rotas internas atuais não se tornam públicas por acidente.
- Autenticação por chave com escopos como `events:read`, `registrations:read`,
  `registrations:write`, `payments:read` e `checkin:write`.
- Chaves de escrita são separadas das de leitura.
- `Idempotency-Key` obrigatório em mutações externas.
- `X-Request-Id` aceito ou gerado e devolvido.
- Erros usam código estável, mensagem segura em `pt-BR` e trace; nunca stack ou segredo.
- Campos desconhecidos são rejeitados em escrita.
- Paginação limitada e filtros definidos em allowlist.
- Rate limits por chave, organização, rota e custo.
- Alterações incompatíveis exigem nova versão e janela de descontinuação documentada.

Domínios planejados: eventos, pessoas/inscrições, pagamentos (leitura e reconciliação),
programação, submissões, empresas/expositores, página pública, credenciamento e certificados.

## Webhooks

Envelope candidato:

```json
{
  "id": "evt_publico_ulid",
  "type": "registration.confirmed",
  "version": 1,
  "occurredAt": "2026-08-28T17:00:00.000Z",
  "organization": "org_public_ref",
  "event": "event_public_ref",
  "data": {}
}
```

Cabeçalhos mínimos: identificador da entrega, timestamp, versão da assinatura e assinatura
HMAC. O cálculo inclui timestamp e corpo bruto. O consumidor recebe instrução para recusar
timestamp fora da janela e memorizar IDs processados.

Ciclo de entrega: `PENDING → DELIVERING → DELIVERED` ou `RETRY_SCHEDULED → DEAD_LETTER`.
Retentativas usam backoff exponencial com jitter e limite. O painel mostra resposta truncada
e sanitizada. Replay é ação humana auditada, não automática pela EVA.

Antes de aceitar uma URL: HTTPS obrigatório, DNS resolvido e revalidado, bloqueio de IPs
privados/link-local/metadata, limite de redirects, proteção contra DNS rebinding, timeout,
tamanho máximo e egress controlado.

## Conectores e cobertura

| Prioridade | Grupo | Candidatos |
|---|---|---|
| P0 | Pagamento/reconciliação | Asaas e provedores aprovados no Payment Engine |
| P1 | Fiscal/financeiro Brasil | Conta Azul, eNotas, Granatum, Nibo, Notazz e Omie |
| P1 | Comunicação | Slack e Twilio, respeitando consentimento e opt-out |
| P1 | CRM | HubSpot, RD Station CRM, Ploomes, Agendor e Ramper Pipeline |
| P2 | Produtividade | Airtable, Jira, Monday.com, Notion, Todoist e Trello |
| P2 | Comunidade/área de membros | MemberKit |
| P1 | iPaaS/cauda longa | Pluga, Make, Zapier ou n8n após avaliação jurídica/técnica |

A presença no benchmark não comprova parceria, qualidade ou disponibilidade. Cada conector
só entra no catálogo após due diligence, termos, limites da API, ambiente de testes, política
de dados, rate limits, custo, suporte, observabilidade e procedimento de desinstalação.

## Gates de entrega

### I0 — contrato e ameaça

- decisão arquitetural e ameaça aprovadas;
- taxonomia de eventos e escopos;
- OpenAPI inicial somente leitura;
- política de compatibilidade, retenção e incidentes.

### I1 — credenciais e API de leitura

- chave exibida uma vez e armazenada por hash;
- escopos/tenant comprovados;
- rate limit e auditoria;
- sandbox sintético e testes de isolamento.

### I2 — outbox e webhooks

- outbox na mesma transação;
- assinatura, retries, DLQ e replay;
- SSRF/DNS rebinding bloqueados;
- métricas e alertas.

### I3 — mutações idempotentes

- idempotency key;
- concorrência e replay testados;
- rollback e compensação definidos;
- nenhuma mutação de publicação automática.

### I4 — conectores e marketplace

- runtime isolado e cofre de segredos;
- instalação por evento com permissões;
- saúde, logs, custo e desinstalação;
- primeiros conectores críticos.

Nenhum Gate de integração substitui o Gate funcional do módulo de origem. Por exemplo,
`certificates:read` só pode ser publicado depois que Certificates estiver aprovado.

## Testes obrigatórios

- acesso cruzado entre duas organizações e dois eventos;
- chave revogada, expirada, rotacionada e com scope insuficiente;
- IDOR, mass assignment, paginação abusiva e enumeração;
- SSRF para localhost, rede privada, metadata, IPv6 e DNS rebinding;
- assinatura inválida, timestamp antigo, corpo alterado e segredo rotacionado;
- duplicata, ordem invertida, timeout, 429, 5xx, DLQ e replay;
- corrida da mesma idempotency key;
- indisponibilidade do Redis/conector sem afetar transação principal;
- payload sem PII desnecessária, stack, segredo ou identificador interno;
- ARM64, migration idempotente, backup e rollback.

## Observabilidade, retenção e higiene

Métricas por tenant usam cardinalidade controlada. Logs não carregam corpo completo, token,
documento, e-mail ou telefone. Payloads de entrega e respostas têm tamanho e retenção
limitados; DLQ não é arquivo permanente. Jobs concluídos, tentativas e auditoria seguem
prazos distintos aprovados por Segurança/LGPD. Limpeza nunca usa `docker system prune -a`
ou `volume prune` em ambiente persistente.

## Bloqueios antes do código

1. Gate 1 e testes humanos permanecem independentes e não podem ser mascarados.
2. Definir Product Owner dos conectores e ordem comercial.
3. Aprovar cofre de segredos e fila/Redis operacionais.
4. Aprovar taxonomia de scopes e eventos.
5. Aprovar política jurídica de desenvolvedor, privacidade e subprocessadores.
6. Criar threat model e ADR antes da primeira migration.
