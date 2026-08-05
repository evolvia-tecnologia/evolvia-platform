# Evolvia Core v0.2 — Fase 2

## Wizard persistente, autosave e capabilities

Versão técnica: `0.2.0-alpha.2`.

## Entregas

### Jornada do organizador

- criação orientada por perfil de evento;
- seleção da organização responsável;
- pré-configurações por congresso, corporativo, feira, entretenimento e social;
- opção explícita de definir datas e local depois;
- revisão antes de concluir a fundação;
- painel com progresso, organização, status e recursos ativados;
- retomada do Wizard pelo painel e por outro dispositivo.

### Persistência e concorrência

- o evento nasce como `DRAFT` após a primeira etapa significativa;
- cada alteração é salva na `EventWizardSession` do fluxo `v2`;
- o percentual é calculado exclusivamente no backend;
- `revision` implementa controle otimista e evita sobrescrever uma edição mais recente;
- sessão concluída pode ser reaberta para revisão antes da publicação;
- o evento passa para `SETUP` ao concluir a fundação.

### Capabilities

Catálogo inicial controlado pelo código:

- inscrições;
- pagamentos;
- comunicação;
- credenciamento;
- controle de acesso;
- trabalhos científicos;
- certificados;
- área do expositor;
- materiais e kits.

A recomendação considera perfil e modelo de inscrição. `registration` permanece
obrigatória e valores desconhecidos são descartados no servidor.

### Segurança

- todas as rotas exigem autenticação;
- leitura e escrita exigem papel `OWNER`, `ADMIN` ou `MANAGER` na organização;
- organização do evento não pode ser alterada pelo JSON do Wizard;
- strings, datas e capabilities são normalizadas no backend;
- edição cruzada entre organizações retorna recurso não encontrado;
- conflitos de revisão retornam `409` e a interface recupera a versão atual.

### Qualidade

- testes unitários de recomendação, normalização, progresso e datas;
- smoke test de início, autosave, conflito, retomada, conclusão e isolamento;
- migration expansiva e idempotente;
- build da API e Web em ARM64;
- homologação automática após integração em `develop`.

## Fora desta fase

A Fase 2 não publica o evento e não implementa cobrança real, inscrições
públicas, emissão de credenciais ou operação de acesso. Ela entrega a fundação
persistente sobre a qual essas capabilities serão implementadas.
