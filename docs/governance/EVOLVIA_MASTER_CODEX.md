# Evolvia Master Codex

## Reconciliação vigente — 11/10/2026

Implementação **84,0%**; conclusão comprovada **63,3%**; **77/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte integrada e publicada `develop@7963de7770827cfaba048647076198a578774674`; CI do HEAD #517 `24c901f7bb6c54f6cf25eb513420b741ea9a5be0` [38114993838](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/38114993838) verde. O job [114401032327](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/38115506278/job/114401032327) comprovou Commit e readiness de API/PostgreSQL em 11/10/2026; o gate público falhou depois por Nginx/alias. Não há novo aceite funcional.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 87,5% | 65,6% | 21/32 |
| 5 | Submissão pelo autor | 75,0% | 56,3% | 18/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 87,5% | 65,6% | 21/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 66,7% | 50,0% | 12/24 |

Delta desde snapshot 38bfc29e: **+5,3 p.p. implementação / +4,0 p.p. conclusão**. #497/G5.6, #517/G6.7, #525/G11.5 e #522/G11.3 estão integrados, testados e publicados; F permanece pendente. Meta >85% / >65,5% ainda não atingida.

- #497: merge `041f83b4`, CI `38001809029`; job `114064573887` comprovou Commit e readiness em 09/10.
- #525: merge `db766978`, CI `38000947075`; job `114060762594` comprovou Commit e readiness em 09/10.
- #522: merge `c18fb511`, HEAD `66d82138`; CI `38005789849` verde e publicação `38111481265` comprovada antes do gate público.
- #517: merge `7963de77`, HEAD `24c901f7`; CI `38114993838` verde, sem threads abertas. Retomada transacional preserva banca/notas e expõe histórico/rubrica versionada. Publicação `38115506278` comprovada às 05:53 UTC.
- Gates seguem abertos. Nginx/alias, ensaios com duas contas/orgs/eventos, Asaas sandbox, e-mail, WCAG humana e hardware preservam pendências. `main`, produção, infra e secrets sem alteração.


Registro canônico do patrimônio intelectual, das decisões estratégicas e do estado
executivo da Evolvia. Código, testes, SHAs e evidências de ambiente são a fonte
primária de verdade; este documento conecta essas provas à direção do produto.

## Identidade e direção

- Produto: plataforma operacional inteligente para eventos, self-service e assistida pela EVA.
- Framework: IICEE — Inteligência, Integração, Confiabilidade, Experiência e Evolução.
- Escopo: organizações e eventos isolados, múltiplos países, portes e perfis de evento.
- Idioma-base: português brasileiro, com arquitetura preparada para internacionalização.
- Branches: `develop` integra; `main` e produção dependem de Go formal.

## Princípios invariáveis

1. Segurança e LGPD por padrão, com autorização backend `deny-by-default`.
2. Isolamento obrigatório por `organizationId + eventId` e DTOs mínimos.
3. EVA orienta e sugere; não publica nem executa ação sensível silenciosamente.
4. WCAG 2.2 AA, teclado, foco, reflow a 320 px e alvos de 44 px.
5. Node 22, Ubuntu/ARM64, migrations aditivas, idempotência, auditoria e rollback.
6. Gates não são encerrados por intenção, número de ciclos ou CI de outro SHA.
7. Interfaces ou textos proprietários de terceiros não são copiados.

## Sequência canônica

1. Gate 1 — Divulgação do evento.
2. Gate 2 — Inscrição.
3. Gate 3 — Área reservada do inscrito.
4. Gate 4 — Configuração científica.
5. Gate 5 — Submissão pelo autor.
6. Gate 6 — Avaliação científica.
7. Gate 7 — Decisão científica.
8. Gate 8 — Arquivo final, pôster e ePoster.
9. Gate 9 — Programação científica.
10. Gate 10 — Operação do evento.
11. Gate 11 — Pós-evento.

## Snapshot histórico — 09/10/2026

Implementação **78,7%**; conclusão comprovada **59,3%**; **73/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte integrada e publicada `develop@38bfc29e4576ca182f84285ba21b2b91dd6758fc`. O [run #1502](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37910142297) aprovou qualidade, PostgreSQL/migration e ARM64, publicou a homologação com rollback e comprovou readiness de API/PostgreSQL. O gate público falhou depois pela versão do Nginx exposta e pelo alias `dev`; nenhum novo aceite humano foi atribuído.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 87,5% | 65,6% | 21/32 |
| 5 | Submissão pelo autor | 62,5% | 46,9% | 15/32 |
| 6 | Avaliação científica | 75,0% | 56,3% | 18/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 87,5% | 65,6% | 21/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 33,3% | 25,0% | 6/24 |

Clone seguro #470 integrado e publicado; G11.6 agora possui I/T/D, mas segue sem F. Central administrativa do expositor integrada (#490) e refinada por #520/#527; acesso externo da empresa/prestador permanece bloqueado no #408. G10.13 fica parcial. G5.6 segue parcial: compensação da API #467 integrada, interface PDF no draft #497. #494/#498 (acessibilidade), #491 (reembolso), #471 (compra múltipla), #480 (kits) e #368 (ACL) não pontuam enquanto não integrados. Asaas sandbox, entrega real de e-mail, WCAG humana e hardware continuam pendentes. `main` e produção sem promoção.

## Entregas posteriores ao snapshot de 07/10

| PR | Entrega integrada | Efeito na matriz |
| --- | --- | --- |
| #458 | Trabalhos e programação em fluxos próprios | Refinamento da navegação; sem unidade nova |
| #459 | CPF/passaporte no autoatendimento, com códigos preservados | Evidência adicional G10.5 |
| #461 | Tipos canônicos na EVA | Evidência adicional G1.8 |
| #467 | Compensação do PDF inicial após falha | G5.6 parcial; falta UI integrada |
| #468 | Fila por lote, oferta, aceite, expiração e concorrência | G2.9 I/T/D; F pendente |
| #470 | Clone seguro da fundação do evento | G11.6 I/T/D; aceite pendente |
| #478 | Defaults de corrida no Wizard | Evidência adicional G1.1 |
| #475 | Validação por etapa e persistência antes de navegar | Evidência adicional G1.1 |
| #481/#495 | Correções de hidratação do catálogo | G1.7 mantém F histórico |
| #490 | Central administrativa segura do expositor | G10.13 parcial; falta acesso externo |
| #520 | Bloco próprio, consulta organizada e menu lateral recolhível | Refinamento de G10.13; sem unidade nova |
| #527 | Navegação progressiva, teclado e estado vazio da central | Refinamento de G10.13; sem unidade nova |



Os registros datados abaixo preservam histórico e não substituem esta reconciliação.

## Estado histórico auditado em 16/09/2026

- Integração: `develop@314dace405060ef2dd628b82ed0f9f2b930f7864`.
- Versão de desenvolvimento/homologação: `0.2.0-alpha.3`; produção permanece `0.1.1`.
- Integrados nesta janela: PRs #295, #296, #297, #312, #315, #316 e #317.
- CI #742: qualidade, tipos, segurança, smoke funcional, migrations idempotentes,
  evidência visual automatizada, runtime de acessibilidade e builds API/Web ARM64 verdes.
- Homologação no mesmo SHA: containers implantados; API e PostgreSQL prontos;
  HTTPS 200; HTTP 308; HSTS, X-Content-Type-Options, Referrer-Policy e
  X-Frame-Options conformes; X-Powered-By ausente.
- No-Go residual: o proxy público ainda responde
  `Server: nginx/1.24.0 (Ubuntu)`. A chave SSH restrita aceita somente
  `deploy $SHA`; o wrapper administrativo executado no host não promove a
  configuração Nginx versionada do repositório.
- A intervenção restante exige atualização auditável do wrapper/host por
  administrador autorizado. Secrets e privilégios não serão ampliados por CI.
- Evidência humana com NVDA/VoiceOver permanece obrigatória e ausente.
- Consequência: Gate 1 e homologação formal continuam abertos; Gate 2 permanece
  bloqueado por EVO-006.
- Gemini Developer permanece pausado e não foi acionado.
- `main` e produção permanecem protegidos.

## Registro de decisões deste marco

### MC-2026-09-16-01 — Continuidade sem Gemini

- Data: 16/09/2026.
- Responsável: Product Owner / Codex.
- Contexto: Gemini Developer permanece pausado por causa não comprovada.
- Decisão: Codex assume temporariamente o backlog programável sem acionar Gemini,
  `/plan` ou `/approve`.
- Impacto IICEE: preserva evolução e confiabilidade sem depender de integração instável.
- Módulos: governança, Web, CI/CD e homologação.
- Riscos: concentração temporária de execução e revisão; mitigada por CI e proteção por HEAD.
- Segurança/LGPD: nenhum secret alterado; paths Gemini preservados; nenhuma PII adicionada.
- Compatibilidade: Node 22, ARM64 e arquitetura atual preservados.
- Testes: CIs #722, #728, #732, #736, #741 e #742.
- Rollback: retomar Gemini apenas após prova controlada e decisão explícita.
- PRs: #295, #296, #297, #312, #315, #316 e #317.
- Commits: `5ca73ee8`, `1e78bb56`, `b7d32548`, `76871738`,
  `855c52ba`, `315c89f6` e `314dace4`.
- Ambiente: `develop` e homologação; sem `main` ou produção.

### MC-2026-09-16-02 — Critério de fechamento do Gate 1

- Data: 16/09/2026.
- Responsável: Product Owner / Codex.
- Contexto: código integrado e containers implantados não equivalem a proxy do host atualizado.
- Decisão: o Gate 1 exige HEAD integrado verde, homologação no mesmo SHA,
  cabeçalhos públicos conformes, ocultação da versão do proxy, evidência
  automatizada preservada e validação humana registrada.
- Impacto IICEE: impede promoção baseada em evidência parcial.
- Módulos: Nginx, CI/CD, Web e acessibilidade.
- Riscos: início do Gate 2 adiado até intervenção administrativa e validação humana.
- Segurança/LGPD: HSTS e cabeçalhos defensivos estão ativos; divulgação da versão
  do Nginx permanece como No-Go.
- Compatibilidade: configuração versionada e rollback estão prontos no repositório;
  o wrapper do host precisa promovê-los.
- Testes: CI #742 e prova pública de 16/09/2026.
- Rollback: script versionado restaura site canônico e link legado se `nginx -t`
  ou reload falhar.
- PRs: #315, #316 e #317.
- Commit: `develop@314dace405060ef2dd628b82ed0f9f2b930f7864`.
- Ambiente: homologação pública.
- Estado: No-Go residual; sem autorização para Gate 2, `main` ou produção.

## Como manter este Codex

Atualizar após decisão do Product Owner, mudança de Gate, merge relevante, release,
incidente, alteração arquitetural ou evidência de homologação. Cada entrada cita
data, responsável, impacto IICEE, módulos, riscos, segurança/LGPD, compatibilidade,
testes, rollback, PRs, commits, CI e ambiente.


## MC-2026-10-04-01 — Modo Lançamento e reconciliação por Gate

- Data: 04/10/2026. Responsável: Product Owner / Orquestrador Codex.
- Direção vigente: EVO-015 substitui o bloqueio rígido da EVO-006; preparação vertical em develop/homologação autorizada. As restrições registradas em 16/09 acima são históricas, não o estado atual.
- Fonte técnica/implantada: `b36829b29d5e543b3c0c7c936e9ab4a8ab52bd9a`; PR #405 integrado; #406/#407 funcionais integrados; #408 bloqueado por identidade do expositor. [Evidência do CI](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37224064537).
- Testes: API 435/435, Web 260/260, build API/Web ARM64, migration idempotente, smoke geral/A4/A5/A6 e provas públicas automatizadas aprovados.
- Deploy: fonte acima publicada em homologação às 15:29 Brasília; API/PostgreSQL prontos. CI global vermelho por Nginx; alias dev com certificado incorreto em diagnóstico informativo. Aceite público 1/4, WCAG humana ainda aberta.
- Decisão de medição, solicitada pelo Product Owner: baseline v1 de 93 unidades, marcos I/T/D/F binários, 25% por marco, média igual dos 11 Gates. Documento e JSON reproduzível em [GATES_STATUS.md](GATES_STATUS.md) e [GATES_STATUS.json](GATES_STATUS.json).
- Conclusão comprovada: **39,0%**. Implementação: **51,6%**. Nenhum Gate formalmente encerrado por este cálculo.
- Impacto IICEE: torna confiável e explicável o progresso; prioriza validar entregas já implantadas e fechar a cadeia científica, sem inventar aprovação.
- Segurança/LGPD: nenhuma PII/credencial nos registros; #408 continua bloqueado; histórico por documento requer posse verificada conforme EVO-016.
- Compatibilidade/migrations: consolidação documental, sem alterar aplicação/schema; reusa Node22/ARM64 e migrations aditivas.
- Rollback: reverter o commit documental; nenhum dado operacional modificado.
- Pendências prioritárias: Nginx/TLS/WCAG, jornadas autenticadas e hardware, coautoria, portal do avaliador, decisão científica e arquivo pós-aceite. Reaproveitar posto/totem/transmissão/configuração em vez de recriar.
- As estimativas antigas sem denominador uniforme são históricas e não comparáveis à baseline v1.

| Gate | Escopo | Implementação | Conclusão comprovada | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | **78,1%** | 25/32 |
| 2 | Inscrição | 57,1% | **42,9%** | 24/56 |
| 3 | Área reservada do inscrito | 75,0% | **56,3%** | 18/32 |
| 4 | Configuração científica | 87,5% | **65,6%** | 21/32 |
| 5 | Submissão pelo autor | 50,0% | **37,5%** | 12/32 |
| 6 | Avaliação científica | 50,0% | **37,5%** | 12/32 |
| 7 | Decisão científica | 0,0% | **0,0%** | 0/24 |
| 8 | Arquivo final, pôster e ePoster | 16,7% | **12,5%** | 3/24 |
| 9 | Programação científica | 62,5% | **46,9%** | 15/32 |
| 10 | Operação do evento | 69,2% | **51,9%** | 27/52 |
| 11 | Pós-evento | 0,0% | **0,0%** | 0/24 |


## MC-2026-10-07-01 — Integração das entregas e percentual reconciliado

- Data: 07/10/2026 UTC (noite de 06/10 em Brasília). Responsável: Product Owner / Codex.
- Solicitação: integrar entregas produzidas antes do documento para atualizar o percentual real.
- Implementação **76,5%**; conclusão comprovada **57,7%**; **71/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.
- Fonte técnica/implantada `73b10c612fb9036257807c463659141de231d22a`. Integração #457 (origens #445/#446/#447/#448/#449/#450/#452/#453/#456), após #455. [CI de integração](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37550956015): API 581/581, Web 396/396, ARM64 e migration/integração aprovados. [CI da fonte implantada](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37551815326): aplicação pronta, No-Go externo por Nginx/TLS. Aceite público 1/4 histórico; nenhum novo F funcional atribuído.
- Correções de integração: autor principal por identidade; limpeza do PDF da tentativa; hash do arquivo na versão; foco/ESC da EVA; uma EVA por tela; presença estornada não emite certificado; motivo limpa ao trocar pessoa; quórum científico somente da versão atual.
- Certificado cobre participação com presença; atividade/trabalho/papéis, lote/verso e PDF gerado ainda parciais. Cartas de aceite/recusa na área do autor não provam entrega de e-mail. Asaas sandbox, WCAG humana, impressão/câmera/catraca e carga continuam pendentes. #408 bloqueado por identidade; #368 por reconciliação de ACL. 65 PRs históricos permanecem separados; não são código entregue por constarem na fila. `main` e produção sem promoção.
- Impacto IICEE: mantém integração e evidência separadas, sem pontuar PR, intenção ou funcionalidade parcial. EVA permanece ajuda determinística contextual, sem promessa de agente externo ou automação sensível.
- Segurança/LGPD: sem secrets ou PII no registro; escopos organização/evento e identidade preservados; expositor sem posse verificada permanece bloqueado.
- Compatibilidade/migrations: Node22/ARM64, migrations aditivas de agenda, presença, arquivos e comissão e idempotência verificados no CI.
- Riscos residuais: carga/concorrência operacional, I/O de PDF com compensação, Nginx/TLS, WCAG humana, provedores e hardware.
- Rollback: rollback da aplicação no deploy restrito; preservar schema expandido e arquivos/dados; reverter commit documental para desfazer esta reconciliação.
- Método: EVO-018 e 93 critérios/11 Gates preservados; F histórico explicitado; 65 PRs antigos mantidos para reconciliação.
- Próximo passo: fechar evidências funcionais e bloqueios públicos antes de Go/No-Go de produção.


## MC-2026-10-08-01 — Sincronização da matriz com o Git

- Solicitação: Product Owner exige matriz e documentação atuais. Responsável: Codex.
- Implementação **77,2%**; conclusão comprovada **58,2%**; **72/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.
- Fonte, testes e ambiente: Fonte técnica/implantada `3c97223ee389eaff0a6a9934f1cc55ea9b2f8dc2`. [CI do SHA auditado](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37837951585): qualidade/tipos/segurança/build, PostgreSQL/migrations, fluxo funcional, hidratação isolada, acessibilidade pública e ARM64 API/Web aprovados após nova execução dos jobs afetados. Job 113550694949: aplicação publicada com rollback disponível; o gate público permaneceu vermelho exclusivamente pela versão Nginx exposta e pelo hostname mismatch do alias dev. Aceite público histórico **1/4**; nenhum novo F atribuído.
- Conflitos resolvidos: #490 entrega admin, não login externo; #467 entrega compensação, não UI inicial; #497 permanece em branch. Sem contagem duplicada por refinamento de interface.
- Limites: Central administrativa do expositor integrada (#490); acesso externo da empresa/prestador permanece bloqueado no #408. G10.13 fica parcial. Fila G2.9 integrada (#468); aviso por e-mail não incluído, reentrada limitada pela reserva histórica. G5.6 segue parcial: compensação da API #467 integrada, interface PDF no draft #497. #494/#498 (acessibilidade), #491 (reembolso), #471 (compra múltipla), #470 (clone), #480 (kits) e #368 (ACL) não pontuam enquanto não integrados. Asaas sandbox, entrega real de e-mail, WCAG humana e hardware continuam pendentes. Certificados e relatórios mantêm lacunas registradas. `main` e produção sem promoção.
- Decisão operacional: atualizar juntos JSON/Markdown, PROJECT_STATE, BACKLOG e Codex após merge, CI, deploy ou aceite; preservar snapshots e registrar SHA por marco. Orientação anterior Nginx/TLS como prioridade imediata substituída pela prioridade explícita do PO até 95%; bloqueio continua visível.
- IICEE: confiabilidade da medição, integração das fontes e evolução sem perda de histórico.
- Segurança/LGPD: sem dados pessoais ou secrets; acesso externo não liberado.
- Compatibilidade/migration: mudança documental; aplicação/schema intocados.
- Rollback: reverter commit documental, preservando histórico operacional.

## MC-2026-10-09-01 — Reutilização integrada e publicação comprovada

- Fonte funcional #470: develop@42256f46; publicação em develop@38bfc29e4576ca182f84285ba21b2b91dd6758fc, run 37910142297, job 113756729603.
- Matriz: 78,7% implementação; 59,3% conclusão comprovada; 73/93 integrados; 0/11 Gates encerrados. G11.6 possui I/T/D, com aceite funcional pendente. Baseline v1 preservada.
- Master Codex reconciliado com JSON, PROJECT_STATE e BACKLOG; corrigido deployJob antigo sem alterar marcos por critério. Validação scripts/validate-gates-status.mjs deve passar nos quatro documentos.
- Limites: readiness não comprova jornada autenticada nem teste humano. Nginx/alias permanecem No-Go público. Portal/CAEX #537 continua em correção #538; #541 trata a recorrência de hidratação do catálogo. Sem mudança em main/produção/infra/secrets.
- Impacto IICEE: confiabilidade da evidência, integração das fontes e evolução verificável. Rollback: revert documental, preservando dados e aplicação.


## Entrega verificada em 09/10/2026 — catálogo #541

- PR [#541](https://github.com/evolvia-tecnologia/evolvia-platform/pull/541) integrado em `develop@7a8d4d39657e12b7624ab6e62b5221e49e20b1be`, após reconciliação com `develop@1496df7936eed9b261ce5ac508edc5d9af97a880`. HEAD validado `da609eb1316127b0f78d4802f0e9042698d83249`.
- [CI 1518](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37966032162) verde: Node22, integração/PostgreSQL, migration idempotente, hidratação isolada do catálogo, acessibilidade runtime, espaçamento de texto, árvore acessível e ARM64 Web. API ARM64 foi ignorada por não haver mudança de imagem API. Job de integração `113941575567`. Prova local complementar: 29/29 testes Node24, harness de hooks e diagnóstico; não equivale a React DOM ou prova humana.
- Código preserva imagem no SSR, separa ciclo de montagem da verificação de mídia e descarta erro tardio do elemento substituído. Diagnóstico preserva código React e somente os enums text/HTML, sem argumentos/URLs privados e sem suprimir erros.
- Publicação comprovada do merge `7a8d4d39657e12b7624ab6e62b5221e49e20b1be`: [run 37967190612](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37967190612), job `113947839793`, passo de deploy com rollback aprovado e log Commit em 09/10/2026 às 17:45:06 UTC; readiness público API/PostgreSQL aprovado às 17:45:08 UTC. O job falhou depois pela versão `nginx/1.24.0` exposta; log do alias dev ainda registra hostname mismatch, apesar do passo terminar verde. Nenhum novo aceite funcional/humano.
- #542 foi incluído na lista de PRs reconciliados por consolidar a evidência de G11.6: merge `1496df7936eed9b261ce5ac508edc5d9af97a880`, publicação no run `37937702677` / job `113847881323`. Essa inclusão é documental, sem novo crédito por critério.
- Ensaio público nesta execução: home → catálogo com dois fixtures QA, viewport desktop 1363×936 sem overflow. Busca científica retornou 502 Bad Gateway / Connection refused antes e após uma única recarga com readiness já confirmado. Jornada filtrada não homologada; causa não atribuída ao código/infra. Sem carga, PII ou operação financeira.
- Matriz permanece 78,7% implementação / 59,3% conclusão, 73/93 e 0/11; delta 0,0/0,0 pp. Correção dentro de escopo já integrado não cria critério novo. A fonte da medição por critério continua `38bfc29e`; esta seção registra evidência posterior separadamente.
- #525 HEAD `24ddb396cc4c10b15cb9beb9d191a33769bbe96f`: CI verde e conciliação de vendas comprovada por fixtures, mas sem merge/deploy. Contrato #532 ainda exige limite de escrita pública: rota anônima executa incremento a cada pedido sem controle demonstrado na aplicação/configuração versionada. Handoff de correção no mesmo PR: `EVOLVIA_HANDOFF:525:24ddb396cc4c10b15cb9beb9d191a33769bbe96f`. Paths permanecem Cursor, sem lançamento automático de Composer. Não fazer carga no ambiente real.
- #536 integrado em `develop@5cd9392abfd88af84e0dcb57ea7661e678b4716a`, HEAD `68b2b8dd0d3f2f3840c4b5467e274df2c462462b`, base `7a8d4d39`, após [CI1522](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37967721576) verde e três threads resolvidas. Recuperação GET após gravação confirmada não repete POST; lista desatualizada bloqueia novas ações. Testes locais existentes helper/navegação: 19/19 Node24. Publicação do merge comprovada no [run 37969826699](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37969826699), job `113957185095`: Commit `5cd9392a` às 18:08:36 UTC e readiness público API/PostgreSQL às 18:08:38 UTC. O job falhou depois pela versão `nginx/1.24.0` exposta; alias dev manteve hostname mismatch. Ensaio autenticado e resultado POST ambíguo permanecem pendentes; sem novo crédito G10.13.
- #497 continua reservado e serializado com #515/#516. Sem alterações em main, produção, infra ou secrets. Rollback de #541/#536: reversão da aplicação, sem migration/destruição de dados. Revisão do diff não é auditoria total.
