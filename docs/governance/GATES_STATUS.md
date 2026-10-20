# Estado dos Gates — 09/10/2026

## Reconciliação vigente — 20/10/2026

Implementação **87,0%**; conclusão comprovada **65,0%**; **80/93** unidades integradas; **0/11 Gates encerrados**. Baseline v1 preservada.

Portal externo do expositor/prestador e CAEX #537 integrados em `develop@badd9ff097c7b3856a2f4141d39a5fccc19065d5`, candidato `ab4c0b7ae990cea4c99a32f15e0a873c28408204`. [CI #1670](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39373910161) aprovado: qualidade, API/Web, ARM64 API/Web, PostgreSQL/fluxo funcional e migration idempotente. 13/13 threads resolvidas; Gemini sem novos bloqueios no candidato. **G10.13 recebe somente I/T**. [Run #1671](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39375902865) do merge em execução na conferência; publicação/readiness e jornadas autenticadas ainda sem comprovação.

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
| 10 | Operação do evento | 92,3% | 67,3% | 35/52 |
| 11 | Pós-evento | 66,7% | 50,0% | 12/24 |

Delta deste corte: **+0,7 p.p. implementação / +0,3 p.p. conclusão**. Não atribuir deploy/aceite por CI de PR. Portal: `/evento/{slug}/expositor`; CAEX: `/eventos/{id}/painel/caex`. Validar duas organizações/eventos, conta/representante/e-mail não confirmado, cotas/prazos, mobile/desktop, teclado/leitor e impressão real. Rollback: revert do squash, preservando tabela de visitas e dados.

Coordenação: Composer local #568 (reconciliar com a base nova e fechar CI/threads); Cursor Cloud #169/#174 (sete rotas × quatro viewports); Codex acompanha publicação e homologação; científico #567/#576 estacionado. O billing do Actions foi liberado após ajuste do usuário. Sem Go/No-Go de produção; Gates, e-mail real, Asaas sandbox, acessibilidade humana e hardware continuam pendentes. Listagem histórica de PRs abaixo não representa inventário vivo.


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
| #470 | Clone seguro da fundação do evento | G11.6 I/T/D; aceite pendente |
| #478 | Defaults de corrida no Wizard | Evidência adicional G1.1 |
| #475 | Validação por etapa e persistência antes de navegar | Evidência adicional G1.1 |
| #481/#495 | Correções de hidratação do catálogo | G1.7 mantém F histórico |
| #490 | Central administrativa segura do expositor | G10.13 parcial; falta acesso externo |
| #520 | Bloco próprio, consulta organizada e menu lateral recolhível | Refinamento de G10.13; sem unidade nova |
| #527 | Navegação progressiva, teclado e estado vazio da central | Refinamento de G10.13; sem unidade nova |


## Método e limites

Cada critério recebe I/T/D/F binários (25% cada). Percentual do Gate = marcos/(4×critérios)×100; global = média dos 11 Gates. Implementação = média da fração I de cada Gate. Parciais não recebem I completo. F de G1.7 é histórico em b36829b. O índice cobre 93 critérios do escopo ativo, não toda a visão fundacional do Master Codex.

## Gate 1 — Divulgação do evento

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G1.1 — Fundação do evento e wizard persistente | Integrado | ✓ | ✓ | ✓ | — | apps/api/src/event-wizard.service.ts; #380; #475 valida etapa e persistência das áreas; #478 defaults de corrida Próximo: Teste autenticado da criação nos seis perfis |
| G1.2 — Perfis, capabilities e painel único | Integrado | ✓ | ✓ | ✓ | — | apps/api/src/event-integrations.controller.ts; #392 Próximo: Troca de evento e estado residual em homologação |
| G1.3 — Identidade visual, mídias e editor de divulgação | Integrado | ✓ | ✓ | ✓ | — | #375/#398; apps/web/components/publication-editor.tsx Próximo: Upload e reflow autenticados |
| G1.4 — Checklist e transição de publicação | Integrado | ✓ | ✓ | ✓ | — | apps/api/src/event-publication/event-publication.service.ts; scripts/ci-smoke-v02.mjs Próximo: Publicar e despublicar fixture autorizada no ambiente |
| G1.5 — Prévia privada sem publicar | Integrado | ✓ | ✓ | ✓ | — | apps/api/src/event-publication/event-publication-preview.service.ts; testes de preview Próximo: Validar ACL e prévia em homologação |
| G1.6 — Página pública, URL, localização e ações por perfil | Integrado | ✓ | ✓ | ✓ | — | #388/#402; PR #405 comentário 04/10 18:31 UTC; ensaio público da feira Próximo: Ensaio público parcial de abertura; localização e ações por perfil ainda não foram integralmente exercitadas |
| G1.7 — Vitrine e catálogo de publicados | Integrado | ✓ | ✓ | ✓ | ✓ | #403; PR #405 comentário 04/10 18:31 UTC; catálogo recarregado com dois eventos; #481/#495 correções de hidratação do catálogo; F histórico, sem novo aceite Próximo: Prova de listagem no SHA implantado |
| G1.8 — Ajuda, documentos e preferências de acessibilidade | Integrado | ✓ | ✓ | ✓ | — | #399/#403; runtime, espaçamento e árvore acessível CI; #461 tipos na EVA; #494/#498 ainda não integrados Próximo: WCAG humana completa e leitor de tela ainda pendentes |

## Gate 2 — Inscrição

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G2.1 — Categorias e lotes | Integrado | ✓ | ✓ | ✓ | — | #323/#325/#387; registration-commercial Próximo: Testar abertura e encerramento |
| G2.2 — Cupons, convites e cortesias básicos | Integrado | ✓ | ✓ | ✓ | — | #327; registration-benefits Próximo: Teste de uso e concorrência em homologação |
| G2.3 — Ficha configurável e consentimentos | Integrado | ✓ | ✓ | ✓ | — | registration-forms; #396 Próximo: Preencher por categoria e comprovar aceite de versão |
| G2.4 — Reserva pública e capacidade | Integrado | ✓ | ✓ | ✓ | — | #329; registration-reservations Próximo: Fixture completa com expiração e repetição |
| G2.5 — Confirmação de inscrição gratuita | Integrado | ✓ | ✓ | ✓ | — | #329/#348; participant-status Próximo: Teste autenticado e credencial |
| G2.6 — Checkout Asaas e webhook idempotente | Integrado | ✓ | ✓ | ✓ | — | #331; asaas-checkout; CI funcional Próximo: Sandbox do provedor, webhooks e conciliação; sem cobrança real |
| G2.7 — Comprovante de categoria antes do pagamento e termo PDF | Integrado | ✓ | ✓ | ✓ | — | #396; registration-category-proof/terms-document Próximo: Upload, aprovação, recusa e concorrência no navegador |
| G2.8 — Participante/pagador/tomador e comprovante de pagamento | Integrado | ✓ | ✓ | ✓ | — | #358/#360/#361/#363 Próximo: Fluxo financeiro em sandbox; não equivale a NFS-e |
| G2.9 — Fila de espera por lote | Integrado | ✓ | ✓ | ✓ | — | #468 integrado em e8aac41; UI/API/migration da fila; PostgreSQL concorrência no CI 37607144430; fonte atual CI/deploy 37837951585 Próximo: Ensaiar no SHA implantado: FIFO, última vaga, expiração, isolamento e aceite; sem aviso por e-mail. Reserva histórica limita reentrada. |
| G2.10 — Compra com várias entradas e ficha por comprador | Pendente | — | — | — | — | operacao-do-evento.md, fatia 10 Próximo: Implementar sem duplicar identidade |
| G2.11 — Regra de reembolso visível e fluxo correspondente | Pendente | — | — | — | — | operacao-do-evento.md, fatia 14 Próximo: Implementar política e compensação explícita |
| G2.12 — Troca de categoria de inscrição paga | Pendente | — | — | — | — | operacao-do-evento.md, fatia 8 Próximo: Preço equivalente e auditoria; diferenças bloqueadas |
| G2.13 — E-mail transacional entregue com confirmação/credencial | Pendente | — | — | — | — | #376; envio real ainda sem evidência conclusiva Próximo: Provar entrega, repetição/falha e privacidade |
| G2.14 — Emissão fiscal NFS-e | Pendente | — | — | — | — | BACKLOG.md; responsável/comprovante não emite nota Próximo: Adaptador e homologação fiscal próprios |

## Gate 3 — Área reservada do inscrito

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G3.1 — Conta e entrada por e-mail/senha | Integrado | ✓ | ✓ | ✓ | — | #335/#346/#350/#355; participant-dashboard Próximo: Confirmar e-mail e acessar com identidade válida |
| G3.2 — Meus eventos sem memorizar o evento | Integrado | ✓ | ✓ | ✓ | — | #346; participant-dashboard.service.ts Próximo: Listagem e isolamento com contas distintas |
| G3.3 — Vinculação de inscrição por documento/e-mail com posse de conta | Integrado | ✓ | ✓ | ✓ | — | #355; participant-dashboard.controller.ts Próximo: Vínculos positivos/negativos em homologação |
| G3.4 — Consulta da inscrição, pagamento e QR | Integrado | ✓ | ✓ | ✓ | — | #338/#340; participant-area.tsx Próximo: Status após webhook e uso do QR |
| G3.5 — Correção controlada da ficha pelo titular | Integrado | ✓ | ✓ | ✓ | — | #366; participant-registration-editor Próximo: Concorrência e campos bloqueados no navegador |
| G3.6 — Link de transmissão do evento para confirmado | Integrado | ✓ | ✓ | ✓ | — | #407; transmission Próximo: Confirmado acessa, pendente e público não recebem URL |
| G3.7 — Histórico por CPF/passaporte após troca de e-mail | Pendente | — | — | — | — | EVO-016; operação fatia 1 Próximo: Recuperação com vínculo verificado e sem revelar histórico |
| G3.8 — Agenda própria e inscrição nas atividades | Integrado | ✓ | ✓ | ✓ | — | #457/#447; participant-agenda.service.ts e participant-agenda.tsx Próximo: Ensaiar reserva, cancelamento, lotação e conflitos em homologação |

## Gate 4 — Configuração científica

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G4.1 — Central científica e capabilities | Integrado | ✓ | ✓ | ✓ | — | docs/cycle2-scientific-central.md; scientific-event-central Próximo: Validar perfil, estado e comportamento após publicar |
| G4.2 — Áreas, subáreas e taxonomia | Integrado | ✓ | ✓ | ✓ | — | scientific-structure; CI A6 Próximo: Teste do congresso com áreas e subáreas |
| G4.3 — Modalidades e formas de apresentação | Integrado | ✓ | ✓ | ✓ | — | scientific-submissions; #406 Próximo: Oral/pôster e chaves submissão/avaliação |
| G4.4 — Título, palavras-chave e limites por autor | Integrado | ✓ | ✓ | ✓ | — | scientific-submissions.config; #406 Próximo: 180 caracteres e até 3 trabalhos no evento de teste |
| G4.5 — Resumo, contagem e campos científicos opcionais | Integrado | ✓ | ✓ | ✓ | — | #406; scientific-author-policy Próximo: 2800 caracteres, alternativas e limites |
| G4.6 — Regras de autoria, instituição e apresentadores | Integrado | ✓ | ✓ | ✓ | — | scientific-submissions.config; #406 Próximo: Configuração persistida; não comprova envio de coautores |
| G4.7 — Modo cego, estilo de nota, teto da banca e coordenador | Integrado | ✓ | ✓ | ✓ | — | #406; scientific-review-policy Próximo: Salvar/reabrir configuração em homologação |
| G4.8 — Blocos de resumo e janelas completas por modalidade | Integrado | ✓ | ✓ | — | — | #565 integrado em f1a91f09 (HEAD 77fdcfad); CI 38150531939 verde e Gemini sem achados abertos. Janelas, até quatro blocos, round-trip de correção, validação unit-aware e PDF preservado. Próximo: comprovar publicação do merge e ensaiar organizador/autor autenticados; sem D/F. |

## Gate 5 — Submissão pelo autor

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G5.1 — Área de envio vinculada à inscrição confirmada | Integrado | ✓ | ✓ | ✓ | — | #344/#348; scientific-author Próximo: Teste autor confirmado e não confirmado |
| G5.2 — Envio textual, modalidade, área e instituição do autor único | Integrado | ✓ | ✓ | ✓ | — | scientific-author-panel.tsx; #406 Próximo: Percorrer submissão real no navegador |
| G5.3 — Primeira versão, listagem e protocolo idempotente | Integrado | ✓ | ✓ | ✓ | — | scientific-author.service.ts; scientific-author-policy Próximo: Repetição de envio não duplica |
| G5.4 — Limites e validação no servidor | Integrado | ✓ | ✓ | ✓ | — | scientific-author-policy; #406 Próximo: Limites, modalidade desativada e prazo |
| G5.5 — Coautores, ordem, instituições e apresentador | Integrado | ✓ | ✓ | ✓ | — | #411/#445/#457; scientific-author.service.ts e scientific-author-panel.tsx Próximo: Ensaiar ordem, instituições, até dez coautores e apresentadores |
| G5.6 — Upload de PDF na submissão | Integrado | ✓ | ✓ | ✓ | — | #497 integrado em 041f83b4 (HEAD 2d139026); CI pós-merge 38001809029: qualidade/PostgreSQL/ARM64 verdes. Publicação job 114064573887, Commit 041f83b4 em 09/10 23:10:11UTC e readiness API/PostgreSQL às 23:10:13 UTC; gate público falha Nginx/alias. PDF privado por versão, contexto assíncrono/anexo e compensação cobertos. Sem aceite autenticado. Próximo: Ensaiar envio/download PDF privado com duas contas/eventos; não inferir F de mocks ou deploy. |
| G5.7 — Rascunho, correção e nova versão pelo autor | Parcial | — | — | — | — | Correção e novas versões integradas; rascunho persistente completo continua pendente. Próximo: Versão imutável e trilha de correção |
| G5.8 — Aviso ao autor após submissão/correção | Pendente | — | — | — | — | #406 explicitamente exclui envio de e-mail Próximo: Provar entrega e idempotência |

## Gate 6 — Avaliação científica

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G6.1 — Critérios e pesos administrados pela comissão | Integrado | ✓ | ✓ | ✓ | — | scientific-reviews.tsx; scientific-reviews.controller.ts Próximo: Adicionar rubrica e validar faixa/peso |
| G6.2 — Distribuição à versão e teto de avaliadores | Integrado | ✓ | ✓ | ✓ | — | scientific-reviews.service; #406 Próximo: Distribuir versões sem cruzar eventos |
| G6.3 — Bloqueio de conflito objetivo de autoria | Integrado | ✓ | ✓ | ✓ | — | scientific-review-policy; service-smoke Próximo: Casos negativos de identidade/conflito |
| G6.4 — Acompanhamento administrativo de atribuições | Integrado | ✓ | ✓ | ✓ | — | scientific-reviews GET management; scientific-reviews.tsx Próximo: Status sem agir em nome do avaliador |
| G6.5 — Área e identidade segura do avaliador | Integrado | ✓ | ✓ | ✓ | — | #411; scientific-reviewer.service.ts Próximo: Ensaiar token próprio, revogação, expiração e isolamento de atribuição |
| G6.6 — Notas, conflito declarado, parecer e envio pelo avaliador | Integrado | ✓ | ✓ | ✓ | — | #411; scientific-reviewer.service.ts Próximo: Ensaiar notas, conflito, parecer e versão atribuída em homologação |
| G6.7 — Retomar/reabrir parecer e rubrica versionada | Pendente | — | — | — | — | operação fatia 11 Próximo: Não zerar banca e auditar revisões |
| G6.8 — Avisos, distribuição assistida e operação em lote | Pendente | — | — | — | — | operação fatia 11/benchmark Próximo: Comunicação real e ações auditáveis |

## Gate 7 — Decisão científica

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G7.1 — Consolidação e quórum operacional | Integrado | ✓ | ✓ | ✓ | — | #421/#457; scientific-reviewer.service.ts; scientific-decision-quorum.test.mjs Próximo: Ensaiar quórum da versão atual; pareceres antigos não autorizam nova versão |
| G7.2 — Aceite, recusa e aceite com alteração | Integrado | ✓ | ✓ | ✓ | — | #411/#421; scientific-reviewer.service.ts Próximo: Ensaiar aceite, recusa e aceite com alteração com atores distintos |
| G7.3 — Resolução de divergência e intervenção do coordenador | Integrado | ✓ | ✓ | ✓ | — | #421; scientific-reviewer.service.ts; chair/identidade da comissão Próximo: Ensaiar coordenador autorizado e negativas da comissão |
| G7.4 — Carta de aceite e comunicação ao autor | Parcial | — | — | — | — | Cartas configuráveis de aceite/recusa com editor, tags e consulta pelo próprio autor; envio e entrega de comunicação não comprovados. Próximo: Documento e entrega real |
| G7.5 — Correção pós-parecer e nova decisão | Integrado | ✓ | ✓ | ✓ | — | #445/#457; nova versão + quórum por versionNumber Próximo: Ensaiar correção pós-parecer, redistribuição e nova decisão preservando histórico |
| G7.6 — Desbloqueio condicionado do pós-aceite | Integrado | ✓ | ✓ | ✓ | — | #411/#450/#457; autorização do pós-aceite no servidor Próximo: Ensaiar bloqueio antes de aceite, fora do prazo e titular errado |

## Gate 8 — Arquivo final, pôster e ePoster

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G8.1 — Configuração do envio pós-aceite e prazo | Integrado | ✓ | ✓ | ✓ | — | #406; acceptedWorkUploadEnabled/Deadline Próximo: Ensaiar prazo e bloqueio do envio pós-aceite na configuração persistida. |
| G8.2 — Envio do arquivo final após aceite | Integrado | ✓ | ✓ | ✓ | — | #411/#450/#457; uploadEposter/uploadFollowUp Próximo: Ensaiar arquivos aceitos nos formatos e prazos habilitados |
| G8.3 — Validação passiva de PDF e armazenamento do trabalho final | Integrado | ✓ | ✓ | ✓ | — | #411/#417/#457; validação passiva PDF e storage científico persistente Próximo: Ensaiar PDF inválido, rollback, troca de arquivo e recuperação de volume |
| G8.4 — Segunda versão e slide pós-aprovação | Integrado | ✓ | ✓ | ✓ | — | #450/#457; segundo ePoster e slide do trabalho aceito Próximo: Ensaiar substituição, preservação do primeiro ePoster e negativas |
| G8.5 — Estação ePoster, busca e QR individual | Integrado | ✓ | ✓ | ✓ | — | #411; scientific-station.service.ts Próximo: Ensaiar estação, busca e QR individual no dispositivo do evento |
| G8.6 — Exibição, idiomas e download autorizado | Integrado | ✓ | ✓ | ✓ | — | #411/#437; estação ePoster com rótulos PT/ES/EN e PDF autorizado Próximo: Ensaiar exibição, idioma da interface e download; tradução do conteúdo não prometida |

## Gate 9 — Programação científica

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G9.1 — Espaços e salas | Integrado | ✓ | ✓ | ✓ | — | scientific-program; CI_SMOKE_A5_OK Próximo: Criar salas e limites em homologação |
| G9.2 — Atividades, datas, horários e tipos | Integrado | ✓ | ✓ | ✓ | — | scientific-program; #384 Próximo: Agenda dentro do período do evento |
| G9.3 — Cadastro/vínculo de palestrantes e papéis | Integrado | ✓ | ✓ | ✓ | — | scientific-guests/program; CI_SMOKE_A4_OK Próximo: Vincular pessoa canônica |
| G9.4 — Conflitos de sala e pessoa no servidor | Integrado | ✓ | ✓ | ✓ | — | #390; scientific-program-update tests Próximo: Reagendamento por API sem colisão |
| G9.5 — Diagnóstico e prontidão para revisão | Integrado | ✓ | ✓ | ✓ | — | scientific-program ready-for-review; #390 Próximo: Recusar conflito bloqueante |
| G9.6 — Editar/reagendar pela interface | Integrado | ✓ | ✓ | ✓ | — | #413; edição/reagendamento em scientific-program.tsx Próximo: Ensaiar editar/reagendar e bloquear colisões em homologação |
| G9.7 — Programação publicada com sessão/trabalho confirmado | Integrado | ✓ | ✓ | ✓ | — | #521 integrado em `develop@3c8a625e` (HEAD `6c2edc47`); CI `38117629140` verde em qualidade, PostgreSQL/migration, hidratação, acessibilidade runtime e ARM64 API/Web. Vínculo transacional, auditoria e projeção pública sem PII. Publicação `38118548732` / job `114410043257` comprovou Commit e readiness; gate público falhou depois por Nginx/alias. Sem aceite autenticado. Próximo: ensaiar vínculo/retirada/publicação com duas organizações/eventos, decisão concorrente, teclado/leitor de tela e aceite humano. |
| G9.8 — Agenda do palestrante/participante | Integrado | ✓ | ✓ | ✓ | — | #447/#457; agenda própria por inscrição e identidade do palestrante Próximo: Ensaiar identidade, atividades próprias e reserva confirmada |

## Gate 10 — Operação do evento

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G10.1 — Posto restrito do operador e painel de links | Integrado | ✓ | ✓ | ✓ | — | #395/#407; EventDesk eventFor/requireOrganizer Próximo: Teste conta OPERATOR sem painel organizador |
| G10.2 — QR assinado e check-in | Integrado | ✓ | ✓ | ✓ | — | #340/#395; check-in Próximo: Leitor físico/câmera, repetição e negativas |
| G10.3 — Busca, ficha e nova inscrição no local | Integrado | ✓ | ✓ | ✓ | — | #395; event-desk Próximo: Busca mínima e correção autorizada |
| G10.4 — Etiqueta, layout e reimpressão | Integrado | ✓ | ✓ | ✓ | — | #395; event-desk badge/label Próximo: Impressão física, 1/2 etiquetas e margens |
| G10.5 — Totem, confirmação e link com validade | Integrado | ✓ | ✓ | ✓ | — | #407; self-check-in/totem policy; #459 devolve CPF/passaporte ao autoatendimento preservando códigos Próximo: Imprimir, sair, timeout, revogar/expirar |
| G10.6 — Presença por atividade e entrega de material | Integrado | ✓ | ✓ | ✓ | — | event-desk activity-access/material Próximo: Repetição não duplica e escopo correto |
| G10.7 — Relatórios, impressão de lista e sorteio | Integrado | ✓ | ✓ | ✓ | — | #401/#407; event-desk report/raffle Próximo: Conferir filtros e dados da fixture |
| G10.8 — Credenciais de equipe e reentrada | Integrado | ✓ | ✓ | ✓ | — | #400; show-operations Próximo: Uso de equipe separado de ingresso |
| G10.9 — API de catraca e chaves com validade | Integrado | ✓ | ✓ | ✓ | — | #400; turnstile; tests/CI Próximo: Integração real e negativas; sem promessa de hardware homologado |
| G10.10 — Atribuição granular do operador por evento/função | Bloqueado | — | — | — | — | Posto básico integrado; ACL granular do operador ainda no #368, com conflitos. Próximo: Reconciliar com posto integrado; não recriar |
| G10.11 — Presença por dia e estorno lógico de presença/material | Integrado | ✓ | ✓ | ✓ | — | #448/#457; check-in-record.ts, desk-presence.policy.ts e posto Próximo: Ensaiar fuso/dia, estorno com motivo, reativação e impacto no certificado |
| G10.12 — Inscrição em atividade com vaga e conflito | Integrado | ✓ | ✓ | ✓ | — | #447/#457; ParticipantAgendaService com transação Serializable Próximo: Ensaiar última vaga concorrente e conflito de horário |
| G10.13 — Área do expositor/prestador e serviços | Parcial | — | — | — | — | #490 integrado em d7287eb; central administrativa em /eventos/{id}/painel/expositores, empresas, cotas, credenciais, formulários, catálogo, pedidos e CSV. #520 integrou bloco próprio, consulta organizada e menu lateral recolhível; #527 reduziu a carga visual com navegação progressiva, teclado e estado vazio. UI/API/migration administrativas publicadas em develop@3c97223e; acesso externo da empresa/prestador do #408 não integrado por identidade. Próximo: #486: ensaio administrativo autenticado, 320/390/desktop/zoom, leitor real e negativos cross-org/evento; #408: prova de posse e acesso externo. Não marcar I completo enquanto faltar a área externa. |

## Gate 11 — Pós-evento

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G11.1 — Templates, tags e emissão de certificado por presença/papel | Parcial | — | — | — | — | #455 emite participação de evento com presença, arte, título, tags e carga horária. Atividade, trabalho e papéis científicos pendentes. Próximo: Sem taxa de download |
| G11.2 — Pacotes/lotes, verso e carga horária | Parcial | — | — | — | — | Carga horária de participação existe; pacotes/lotes/verso não completados. Próximo: Emissão auditável e dados canônicos |
| G11.3 — Download/segunda via e autenticidade | Integrado | ✓ | ✓ | ✓ | — | #522 integrado em c18fb511 após CI 38005789849 do HEAD 66d82138: 663 API / 466 Web, PostgreSQL/integração e ARM64 verdes. Threads Gemini satisfeitas. Segunda via idempotente e lote 40 com ACL por evento/organização; fonte Unicode embutida, paginação integral/Poppler; sem glifo retorna 422 sem auditoria. Publicação no job 114389232356 comprovou Commit c18fb511 em 11/10 04:37:37 UTC e readiness API/PostgreSQL às 04:37:39 UTC; gate público falhou depois por Nginx/alias. Sem F. Próximo: Comprovar publicação do SHA, jornada de download e negativos autenticados com duas contas/orgs/eventos; CJK exige fallback imprimível. |
| G11.4 — Avaliação do evento e exportação | Integrado | ✓ | ✓ | ✓ | — | #420/#452/#457; avaliação, resultados e CSV de comentários filtrados Próximo: Ensaiar resposta própria, pergunta/busca/paginação e exportação no evento |
| G11.5 — Relatórios consolidados de resultados e exportação | Integrado | ✓ | ✓ | ✓ | — | #525 integrado em db766978; CI pós-merge 38000947075 qualidade/PostgreSQL/ARM64 verdes. Publicação job 114060762594: Commit db766978 em 09/10 22:56:56UTC, readiness API/PostgreSQL às 22:56:58 UTC; gate público falha Nginx/alias. Visitas limitadas por processo, slugs inexistentes não ocupam cotas; vendas sem paidAt conciliam; CSV e métrica explícita. Sem aceite autenticado. Próximo: Ensaiar relatórios/exportação e isolamento entre duas organizações/eventos; limite por instância não é orçamento distribuído. |
| G11.6 — Encerramento, retenção e reutilização por clone seguro | Integrado | ✓ | ✓ | ✓ | — | #470 integrado em develop@42256f46 e publicado no conjunto develop@38bfc29e; clone seguro com ACL, isolamento org/evento, idempotência e exclusões operacionais. Próximo: ensaiar negativos com duas organizações/eventos. |

## Histórico preservado

[04/10/2026](history/GATES_STATUS_2026-10-04.json): 51,6% implementação / 39,0% conclusão. [07/10/2026](history/GATES_STATUS_2026-10-07.json): 76,5% / 57,7%. Denominador inalterado.


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
