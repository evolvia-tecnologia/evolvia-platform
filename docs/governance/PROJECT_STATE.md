---
snapshot_at_utc: 2026-10-22T13:10:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha_at_snapshot: 2f6087bc99c99a256248a0b7343fc8b63fbbd017
delivery_mode: "Modo Lançamento — EVO-015"
active_phase: "Operação de inscrição e aceitação pública em homologação"
---

# Estado oficial do projeto

## Reconciliação vigente — 22/10/2026, 10h10 (São Paulo)

Implementação **89,6%**; conclusão comprovada **67,5%**; **82/93** unidades integradas; **0/11 Gates encerrados**. Baseline de 93 critérios, pesos iguais entre os 11 Gates e fórmula I/T/D/F preservadas.

Fonte integrada e publicada `develop@2f6087bc99c99a256248a0b7343fc8b63fbbd017`, árvore `a552c794db6026a6489ca965d0ffd53f1c879183`. Certificados [#548](https://github.com/evolvia-tecnologia/evolvia-platform/pull/548) já tinham I/T no corte de 21/10; o [pós-merge 39707553563](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39707553563) / job `119594505568` comprovou Commit às 02:01:06 UTC e readiness público API/PostgreSQL/HTTPS200 às 02:01:08 UTC em 22/10. **G11.1 recebe D; F permanece sem crédito.** G11.2 continua parcial (verso/pacotes). O gate público falhou depois por versão Nginx exposta e TLS/redirecionamento do alias `dev`.

[#578](https://github.com/evolvia-tecnologia/evolvia-platform/pull/578) e [#584](https://github.com/evolvia-tecnologia/evolvia-platform/pull/584) refinam critérios já integrados, sem unidade extra: hidratação do catálogo sem React 418 em `/eventos` CURRENT/PAST/ALL × 1366/768/390/320; CTA/ingresso por perfil (`isPublicTicketEvent`/`isPublicTicketOffer`); isolamento Asaas (`isAsaasStubMode` nunca em production); editor de mídia aguarda `onChanged`. A publicação anterior `c92853d6` permanece evidência de D em G5.7.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 100,0% | 75,0% | 24/32 |
| 5 | Submissão pelo autor | 87,5% | 65,6% | 21/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 92,3% | 69,2% | 36/52 |
| 11 | Pós-evento | 83,3% | 62,5% | 15/24 |

Delta sobre o snapshot de 21/10: **+0,0 p.p. implementação / +0,4 p.p. comprovado**, somente D de G11.1. CI de PR e rascunho não pontuam. Nenhum novo aceite humano ou encerramento de Gate.

### Fila de integração e bloqueios de lançamento

- Este PR documental (#586) sucede o #585. Fila #587 rebaseada e MERGEABLE, sem unidade nova. UX #582 pronta e BEHIND. #579–#581/#583 continuam Draft; Composer #568 permanece DIRTY. Sem crédito por rascunho.
- #579: aceite HTTP do provedor não comprova recebimento do e-mail/credencial; G2.13 permanece pendente. #568: concluir reconciliação e provas concorrentes/FIFO/identidade antes de revisão final.
- Permanecem Nginx/alias, ensaios autenticados com duas organizações/eventos, Asaas sandbox, e-mail real, WCAG humana e hardware. Também há critérios funcionais pendentes: compra múltipla, reembolso, troca de categoria paga, NFS-e, recuperação de histórico com prova de identidade, avisos científicos, carta/comunicação ao autor, ACL granular do operador e pacotes/verso de certificados.
- `main` e produção sem promoção; Go/No-Go de lançamento pendente. Não apagar fixtures antes do aceite.

### Primeiro evento de cada família — jornadas ainda sem aceite completo

As seis famílias seguem o catálogo canônico `apps/web/lib/event-profile-catalog.ts`. Todos os fluxos exigem criação/configuração/publicação, inscrição, área reservada, operação e pós-evento, conforme capacidades habilitadas.

| Família | Jornada específica pendente de prova e aceite |
| --- | --- |
| Científicos e acadêmicos | Congresso: até 3 trabalhos/autor, até 10 coautores com instituição, título180/resumo2800, oral/pôster, avaliação, decisão, arquivo final/ePoster, programação e certificados por papel. |
| Corporativos e capacitação | Evento pago: checkout e confirmação Asaas sandbox, e-mail/credencial recebido, presença em atividade, material e certificado. |
| Feiras e exposições | Feira: portal/representante com e-mail confirmado, isolamento de empresa/org/evento, CAEX, cotas/prazos, serviços e credenciais. |
| Entretenimento | Show: compra paga do #584 no ambiente, retorno/webhook, ingresso, operador restrito, check-in/reentrada e repetição sem duplicar. |
| Comunidades, causas e esportes | Evento comunitário ou corrida: inscrição, campos/categorias, material/kit, capacidade, presença e encerramento conforme habilitado. |
| Outros perfis | Evento flexível: capacidades configuradas persistem, navegação oferece só fluxos habilitados e jornada inscrição→operação→pós-evento funciona. |

Provas compartilhadas pendentes: desktop/mobile320/390, teclado/leitor de tela, expiração/repetição/falha parcial, negativas entre organizações/eventos, impressão/câmera/catraca quando utilizadas. Nenhuma linha é declarada homologada por CI ou commit.

## Snapshot histórico — 21/10/2026, 22h47 (São Paulo)

Implementação **89,6%**; conclusão comprovada **67,1%**; **82/93** unidades integradas; **0/11 Gates encerrados**. Baseline de 93 critérios, pesos iguais entre os 11 Gates e fórmula I/T/D/F preservadas.

Fonte integrada `develop@2f6087bc99c99a256248a0b7343fc8b63fbbd017`. **G11.1 tinha somente I/T**; a publicação do merge ainda executava. **G5.7 já tinha D** pelo descendente `c92853d6`. #578 e #584 constavam como refinamentos, sem unidade extra.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 100,0% | 75,0% | 24/32 |
| 5 | Submissão pelo autor | 87,5% | 65,6% | 21/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 92,3% | 69,2% | 36/52 |
| 11 | Pós-evento | 83,3% | 58,3% | 14/24 |

Delta sobre o snapshot de 20/10: **+1,5 p.p. implementação / +1,0 p.p. comprovado**, G11.1 I/T e G5.7 D. Sem aceite humano.

## Snapshot histórico — 20/10/2026

Implementação **88,1%**; conclusão comprovada **66,1%**; **81/93** unidades integradas; **0/11 Gates encerrados**. Baseline v1 preservada.

Portal externo do expositor/prestador e CAEX #537 integrados em `develop@badd9ff097c7b3856a2f4141d39a5fccc19065d5`, candidato `ab4c0b7ae990cea4c99a32f15e0a873c28408204`. [CI #1670](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39373910161) aprovado: qualidade, API/Web, ARM64 API/Web, PostgreSQL/fluxo funcional e migration idempotente. 13/13 threads resolvidas; Gemini sem novos bloqueios no candidato. **G10.13 recebe I/T/D; G4.8 também recebe D pelo mesmo SHA publicado**. [Run #1671](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39375902865) do merge concluiu a implantação: job `118476843359`, Commit às 05:51:56 UTC e readiness público API/PostgreSQL/HTTPS200 às 05:51:58 UTC. O gate público falhou depois por versão do Nginx exposta e certificado divergente do alias `dev`. Jornadas autenticadas e aceite funcional pendentes.


Científico #567 integrado em `develop@fb8f991e5775de5e7810414f4484f4331cc28cbf`, candidato `c45f4a7a3b902b5bb31754682b62a9aa9ff3a062`. [CI #1678](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39418005077) aprovado em qualidade, API/Web, PostgreSQL/fluxo funcional, migration idempotente, hidratação/acessibilidade runtime e ARM64 API/Web. **G5.7 recebe somente I/T**: rascunhos persistentes, retomada/exclusão escopada, snapshots de autoria e versões. Publicação do merge e jornada autenticada ainda pendentes; D/F permanecem sem crédito.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 100,0% | 75,0% | 24/32 |
| 5 | Submissão pelo autor | 87,5% | 62,5% | 20/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 92,3% | 69,2% | 36/52 |
| 11 | Pós-evento | 66,7% | 50,0% | 12/24 |

Delta desde 11/10: **+1,8 p.p. implementação / +1,4 p.p. conclusão**; #567 acrescenta +1,1/+0,6 p.p. ao snapshot anterior do expositor. Não atribuir deploy/aceite por CI de PR. Portal: `/evento/{slug}/expositor`; CAEX: `/eventos/{id}/painel/caex`. Validar duas organizações/eventos, conta/representante/e-mail não confirmado, cotas/prazos, mobile/desktop, teclado/leitor e impressão real. Rollback: revert do squash, preservando tabela de visitas e dados.

Coordenação: Composer local #568 (reconciliar com a base nova e fechar CI/threads); Cursor Cloud #169/#578 (sucessor candidato de #174, sete rotas × quatro viewports); Codex acompanha publicação e homologação de #567; #576 permanece dependente. CI1674 falhou em React 418/HTML no catálogo 390×844; o CI1678 subsequente passou, sem comprovar aceite humano. O billing do Actions foi liberado após ajuste do usuário. Sem Go/No-Go de produção; Gates, e-mail real, Asaas sandbox, acessibilidade humana e hardware continuam pendentes. Listagem histórica de PRs abaixo não representa inventário vivo.


## Snapshot histórico — 11/10/2026

Implementação **86,3%**; conclusão comprovada **64,7%**; **79/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte integrada `develop@f1a91f093d2bbb8fdbbf2b999c3d52feab627748`; HEAD #565 `77fdcfad5b7c982f0124d7bf06dc8a669a7b60d7`, [CI 38150531939](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/38150531939) integralmente verde e revisão Gemini sem achados abertos. A publicação desse merge ainda não foi comprovada; a última fonte publicada comprovada permanece `3c8a625e` no run `38118548732`/job `114410043257`. Não há novo aceite funcional.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 100,0% | 71,9% | 23/32 |
| 5 | Submissão pelo autor | 75,0% | 56,3% | 18/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 66,7% | 50,0% | 12/24 |

Delta desde snapshot `38bfc29e`: **+7,6 p.p. implementação / +5,4 p.p. conclusão**. #565/G4.8 acrescenta somente I/T neste estado: janelas e blocos por modalidade, round-trip de correção, validação unit-aware e preservação do PDF. D depende do SHA exato publicado; F depende de ensaio autenticado. A meta de implementação foi superada; a meta >65,5% de conclusão comprovada ainda não foi atingida.

- #565: merge `f1a91f09`, HEAD `77fdcfad`, CI `38150531939`; publicação do merge pendente de evidência.
- Gates seguem abertos. Nginx/alias, ensaios com duas contas/orgs/eventos, Asaas sandbox, e-mail, WCAG humana e hardware preservam pendências. `main`, produção, infra e secrets sem alteração.

## Snapshot integrado anterior — 11/10/2026

Implementação **85,1%**; conclusão comprovada **64,1%**; **78/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte integrada e publicada `develop@3c8a625e95415b99b615c681caffb5754c52178d`; CI do HEAD #521 `6c2edc471e360db063cf898095fda659a6900ed1` [38117629140](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/38117629140) verde. O job [114410043257](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/38118548732/job/114410043257) comprovou Commit e readiness de API/PostgreSQL em 11/10/2026; o gate público falhou depois por Nginx/alias. Não há novo aceite funcional.

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
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 66,7% | 50,0% | 12/24 |

Delta desde snapshot 38bfc29e: **+6,4 p.p. implementação / +4,8 p.p. conclusão**. #497/G5.6, #517/G6.7, #521/G9.7, #525/G11.5 e #522/G11.3 estão integrados, testados e publicados; F permanece pendente. A meta de implementação foi superada; a meta >65,5% de conclusão comprovada ainda não foi atingida.

- #497: merge `041f83b4`, CI `38001809029`; job `114064573887` comprovou Commit e readiness em 09/10.
- #525: merge `db766978`, CI `38000947075`; job `114060762594` comprovou Commit e readiness em 09/10.
- #522: merge `c18fb511`, HEAD `66d82138`; CI `38005789849` verde e publicação `38111481265` comprovada antes do gate público.
- #517: merge `7963de77`, HEAD `24c901f7`; CI `38114993838` verde, sem threads abertas. Retomada transacional preserva banca/notas e expõe histórico/rubrica versionada. Publicação `38115506278` comprovada às 05:53 UTC.
- #521: merge `3c8a625e`, HEAD `6c2edc47`; CI `38117629140` verde, incluindo PostgreSQL/migration, hidratação, acessibilidade runtime e ARM64. Vínculo transacional de trabalho aceito à sessão, auditoria e projeção pública sem PII; publicação `38118548732` comprovada às 06:49 UTC.
- Gates seguem abertos. Nginx/alias, ensaios com duas contas/orgs/eventos, Asaas sandbox, e-mail, WCAG humana e hardware preservam pendências. `main`, produção, infra e secrets sem alteração.


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
| #478 | Defaults de corrida no Wizard | Evidência adicional G1.1 |
| #475 | Validação por etapa e persistência antes de navegar | Evidência adicional G1.1 |
| #470 | Clone seguro da fundação do evento | G11.6 I/T/D; aceite pendente |
| #481/#495 | Correções de hidratação do catálogo | G1.7 mantém F histórico |
| #490 | Central administrativa segura do expositor | G10.13 parcial; falta acesso externo |
| #520 | Bloco próprio, consulta organizada e menu lateral recolhível | Refinamento de G10.13; sem unidade nova |
| #527 | Navegação progressiva, teclado e estado vazio da central | Refinamento de G10.13; sem unidade nova |


## Snapshot histórico — 07/10/2026 UTC

Implementação **76,5%**; conclusão comprovada **57,7%**; **71/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte técnica/implantada `73b10c612fb9036257807c463659141de231d22a`. Integração #457 (origens #445/#446/#447/#448/#449/#450/#452/#453/#456), após #455. [CI de integração](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37550956015): API 581/581, Web 396/396, ARM64 e migration/integração aprovados. [CI da fonte implantada](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37551815326): aplicação pronta, No-Go externo por Nginx/TLS. Aceite público 1/4 histórico; nenhum novo F funcional atribuído.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 57,1% | 42,9% | 24/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 87,5% | 65,6% | 21/32 |
| 5 | Submissão pelo autor | 62,5% | 46,9% | 15/32 |
| 6 | Avaliação científica | 75,0% | 56,3% | 18/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 87,5% | 65,6% | 21/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 33,3% | 20,8% | 5/24 |

Certificado cobre participação com presença; atividade/trabalho/papéis, lote/verso e PDF gerado ainda parciais. Cartas de aceite/recusa na área do autor não provam entrega de e-mail. Asaas sandbox, WCAG humana, impressão/câmera/catraca e carga continuam pendentes. #408 bloqueado por identidade; #368 por reconciliação de ACL. 65 PRs históricos permanecem separados; não são código entregue por constarem na fila. `main` e produção sem promoção.

Os blocos seguintes são snapshots históricos; o controle atual está em [GATES_STATUS.md](GATES_STATUS.md) e [GATES_STATUS.json](GATES_STATUS.json).

## Snapshot histórico — reconciliação de 04/10/2026



Fonte técnica e de deploy: `b36829b29d5e543b3c0c7c936e9ab4a8ab52bd9a`. Conclusão comprovada **39,0%**; implementação **51,6%**; 0/11 Gates formalmente encerrados. O novo denominador v1 reúne 93 unidades funcionais e quatro marcos I/T/D/F por unidade. A fórmula e todas as evidências estão em [GATES_STATUS.md](GATES_STATUS.md), com dados em [GATES_STATUS.json](GATES_STATUS.json).

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

Run integrado 37224064537: API 435/435, Web 260/260, migrations/smokes e ARM64 aprovados. Deploy funcional de `b36829b` concluído às 18:29 UTC; bloqueio externo por versão Nginx e alias/TLS permanece. Critério público mantém 1/4 = 25%; ensaios privados/hardware/WCAG humana pendentes. #405/#406/#407 integrados; #408 e #409 não pontuados. Percentuais anteriores não aferidos/estimados são preservados abaixo como snapshots históricos, substituídos por esta baseline para o controle atual.

## Snapshot anterior — 04/10/2026 18:06 UTC

## Atualização verificável — 04/10/2026

Base desta consolidação: `86ed34a66bc9408672a80a5236d6b473c4f285c0`.
O Product Owner autorizou revisão, merge em `develop` e publicação de homologação
dos avanços do Cursor/Gemini. `main` e produção continuam sem promoção.

### Integração da leva original

Os PRs #392 e #395–#404 estão integrados: **11 de 11 (100%)**.
Este percentual mede somente integração dessa leva, não os Gates globais.

| PR | Resultado integrado | CI aprovado antes do merge |
| --- | --- | --- |
| #392 | Painel único, etapa atual, isolamento ao mudar evento e moldura do operador | 1112 |
| #395 | Posto, totem, etiquetas e baixa operacional | 1134 |
| #396 | Termo PDF e comprovante de categoria, revisão por checksum e proteção de concorrência | 1190 |
| #397 | API, webhooks com DNS validado e fixado, presença em sites | 1172 |
| #398 | Correções do organizador, busca sensível por POST e benefícios | 1185 |
| #399 | Painel global de acessibilidade e contenção de foco | 1120 |
| #400 | Acessos de equipe e catracas, relatório e chaves com validade | 1179 |
| #401 | Filtros de presença e ações nas inscrições | 1148 |
| #402 | Ações públicas por perfil, trajeto e telefone | 1125 |
| #403 | Vitrine pública, catálogo, áreas e ajuda | 1142 |
| #404 | Proteção de acesso, rate limit e validação de sessão/JWT | 1139 |

Novos PRs: #405 consolida a direção operacional; #406 foi integrado em `86ed34a` após CI 1202 completo, reunindo configuração
científica e correções de identidade/nota/prazo; #407 foi integrado em
`9d9e213` após CI 1198 completo, com transmissão e complemento do credenciamento.
#408 permanece em rascunho por autenticação sem prova de posse do e-mail;
as correções de agregação, CSV, estado entre eventos e pedido concorrente já estão
na branch. Comentário do Gemini não equivale a aprovação.

### PRs antigos e concorrentes

- #394: comportamento de timing do login já integrado no #404; testes de serviço
  podem ser reaproveitados, sem substituir o AuthService atual pelo HEAD antigo.
- #85: snapshot documental de agosto; a consolidação do #405 preserva esse
  histórico e registra os avanços de outubro. Não integrar o snapshot antigo
  por cima do estado corrente.
- #368: evolução de permissões/atribuição do operador continua separada;
  posto/totem integrados não provam que toda a ACL granular foi concluída.
- Demais PRs antigos exigem comparação com o HEAD vivo, revisão e CI atual;
  CI antigo verde isoladamente não os torna elegíveis.

### Homologação e Gates

No deploy de `1fae7fa` (run 37219428971), migrations e containers foram iniciados,
API/PostgreSQL passaram no readiness público, e o domínio principal respondeu por
HTTPS. A publicação terminou vermelha por exposição de
`Server: nginx/1.24.0 (Ubuntu)` e por certificado/redirecionamento incorretos no
alias `dev`. Novos merges disparam novos deploys; um merge não comprova a
conclusão da publicação.

O ensaio no navegador confirmou a vitrine, abertura/fechamento do painel de
acessibilidade, catálogo e URL curta do evento de teste da feira. Ainda faltam
ensaio autenticado, leitor de tela, impressão física/leitor e aceite humano.
O ensaio público parcial não encerra WCAG nem comprova fluxos operacionais privados.

- Recorte central de inscrição já integrado: 5/5 (100% de implementação daquele recorte).
- Aceitação pública de homologação: 1/4 (25%) no denominador previamente definido;
  Nginx, alias e evidência humana continuam pendentes.
- Gates funcionais 1–11: percentual global **não apurado**. Reconciliar critérios
  e evidências da issue #114 antes de informar um total.

A chave SSH do CI executa somente `deploy <SHA>`; o wrapper não aplica a
configuração Nginx versionada. Ajuste administrativo necessário no host de
homologação, preservando o certificado existente e validando/recarregando Nginx:

```bash
sudo env CERTBOT_SKIP_DRY_RUN=1 bash /opt/evolvia/staging/current/infra/certbot/bootstrap-staging-tls.sh
```

Procedimento e rollback: [operação SSL de homologação](../operacao-ssl-homologacao.md).
Não contornar a chave restrita, desabilitar checks ou declarar produção liberada.

## Snapshot histórico — 26/09/2026

## Resumo executivo

O Modo Lançamento entrega fatias verticais utilizáveis com tela, API, banco,
testes e homologação. As cinco fatias centrais de inscrição estão integradas em
`develop`: categorias/lotes, benefícios, reserva pública, checkout Asaas e área
reservada do participante. Isso mede o escopo **de implementação desse recorte**,
não a conclusão de todo o Evolvia nem a autorização de produção.

A homologação do SHA `1d7049d` recebeu Web, API e PostgreSQL; readiness
público, HTTPS e redirecionamento do domínio principal passaram no CI #977.
O Gate público ficou vermelho porque `Server: nginx/1.24.0 (Ubuntu)` expõe a
versão do proxy. O alias `dev.evolviatecnologia.com` também apresenta certificado
sem esse hostname e não redireciona corretamente. A evidência humana de teclado,
foco e NVDA/VoiceOver ainda não foi registrada. `main` e produção permanecem
sem promoção.

## Percentuais verificáveis do Modo Lançamento

| Medida | Resultado | Critério e evidência |
| --- | ---: | --- |
| Fatias centrais de inscrição integradas | **5/5 = 100%** | Categorias/lotes #323/#325; benefícios #327; reserva #329; checkout Asaas #331; área do participante #335, todos com PR integrado em `develop`. |
| Aceitação pública da homologação | **1/4 = 25%** | Passou: domínio principal com HTTPS e readiness no CI #977. Pendem: ocultar versão do Nginx; corrigir certificado/redirecionamento do alias `dev`; registrar ensaio humano WCAG. |
| Evolvia completo e Gates 1–11 | **não aferido** | O mapa canônico e critérios dos 11 Gates seguem em reconciliação na issue #114; atribuir porcentagem geral agora confundiria escopos diferentes. |

Os percentuais contam critérios concluídos com peso igual **apenas dentro das
linhas acima**. Não somar as duas linhas nem usar 100% das cinco fatias como
Go/No-Go de lançamento. O Gate técnico do CI #977 permanece vermelho.

## Entregas e pendências atuais

| Frente | Estado verificável | Próxima condição |
| --- | --- | --- |
| Inscrição comercial e reserva | Integradas em `develop` (#323/#325/#327/#329) | Teste de jornada em homologação |
| Checkout Asaas e webhooks | Integrados (#331), confirmação por `CHECKOUT_PAID` | Validação operacional em ambiente configurado; cobrança real bloqueada por padrão |
| Área reservada do participante | Integrada (#335) | Ensaio funcional em homologação |
| Credenciamento e check-in | Rota e operação por QR existentes; evolução do operador no draft #368 | CI, revisão e teste de câmera/leitor reais antes de declarar o fluxo completo |
| Integrações | Catálogo informativo integrado pelo PR #149 neste SHA | Conectores efetivos, inclusive NFS-e municipal/nacional, exigem contratos, credenciais e homologação próprios; nenhuma emissão fiscal é prometida |
| Painel do evento | Revisão de texto, hierarquia e acessos rápidos integrada pelo PR #370 | Verificar publicação do SHA em homologação |
| Infraestrutura pública | Aplicação no domínio principal; CI #977 falha em headers e alias | Corrigir Nginx e TLS sem relaxar a validação |

## Critérios de atualização

Atualizar os numeradores somente após evidência do HEAD integrado e
verificação correspondente. Não converter CI de PR em deploy nem automação em
validação humana. O mapa de 11 Gates deve ser reconciliado na #114 antes de
publicar um percentual global. `main`, produção, cobrança real e emissão de NFS-e
não são habilitados por este quadro.


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
