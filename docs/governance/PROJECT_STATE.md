---
snapshot_at_utc: 2026-10-27T13:11:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha_at_snapshot: d0493a743690fad325c4c64646dd12a7ad345ae7
delivery_mode: "Modo Lançamento — EVO-015"
active_phase: "Operação de inscrição e aceitação pública em homologação"
---


## Publicação em homologação de G5.8 e G7.4 — 23/11/2026

Implementação **96,9%**; conclusão comprovada **73,0%**; **89/93** unidades integradas; **0/11 Gates encerrados**.

O publicador registrou `99a041a128ac6d8d3cd35c908d5e6e5bf01b1204` na tentativa 2. A API e o PostgreSQL responderam prontos. O gate público confirmou HTTPS 200, ocultação da versão do proxy e redirecionamento 308. Os commits de G5.8 e G7.4 integram essa versão. O aceite de G5.8 depende de recebimento autorizado. O de G7.4 depende da jornada autenticada da carta e do aceite humano. [Evidência de publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/45259500761/job/138127736334)

## Reconciliação G5.8 I/T — 23/11/2026 (PR #708 integrada)

Implementação **96,9%**; conclusão comprovada **72,3%**; **89/93** unidades integradas; **0/11 Gates encerrados**.

Fonte canônica da matriz: `393ab9930d205dcb592cbf283b55c3fd1d2d86e3`. G5.8 I/T comprovados pela #610 e #708, CI #45105953160 COMPLETED/SUCCESS (qualidade, PostgreSQL e ARM64). **D/F continuam falsos**: não há evidência de envio externo autorizado, SHA implantado ou aceite humano. A PR #702 foi fechada sem merge como superada. G2.11, G2.13, G2.14 e G6.8 permanecem pendentes de implementação completa. O gate público Nginx #108 continua externo. Não inferir prontidão de produção. Registros históricos abaixo permanecem como histórico.


## Reconciliação pós-merge #518 — 22/11/2026 (G7.4 somente I/T)

Implementação **95,8%**; conclusão comprovada **71,7%**; **88/93** unidades integradas; **0/11 Gates encerrados**.

Fonte canônica da matriz: `865bf03f2315642612c1e251559701bca87a993e`. A PR #518 foi integrada em `develop@e46268121378b77343231366922fd6a6b723830d`; os testes PostgreSQL e CI foram comprovados. G7.4: I=true, T=true, D=false, F=false. A publicação teve gate público reprovado pelo cabeçalho Nginx (#108); faltam correção autorizada, correlação do SHA servido, jornada autenticada e aceite humano. Os registros históricos abaixo são preservados.


## Reconciliação de 19/11/2026

Implementação **94,3%**; conclusão comprovada **71,0%**; **87/93** unidades integradas; **0/11 Gates encerrados**.

Base integrada `865bf03f2315642612c1e251559701bca87a993e`. G2.10 e G10.10 têm integração, CI e publicação demonstrados. O aceite autenticado segue pendente. Ambos os jobs registraram a prontidão da API e do banco e depois reprovaram o cabeçalho Server. [Compra múltipla](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42683330025/job/129390430705) · [Permissões de operador](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42715129263/job/129500945850).


## Homologação em 17/11/2026, 15h34 de São Paulo

O gateway anunciou a implantação de `c4512c2deb2e406f888b6572c2ad3c4b9813c2ad` às 18h34min32s UTC. O runner observou readiness da API e do PostgreSQL, HTTPS 200, HTTP 308 com destino canônico, HSTS, nosniff, Referrer-Policy, SAMEORIGIN e ausência de X-Powered-By. A versão exposta em `Server: nginx/1.24.0 (Ubuntu)` reprovou o gate. O diagnóstico posterior do alias removido retornou 127 em etapa tolerante a falha. A resposta pública medida não identifica o SHA servido. A implantação de 06/11 e o registro de 27/10 são históricos. [job de publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/44146606412/job/134271238197).

## Estado verificado — 06/11/2026

- Base integrada: `develop@49aeae51e4f2b35eab08558ca9997a0ff900fc09`, com [#637](https://github.com/evolvia-tecnologia/evolvia-platform/pull/637) e [#647](https://github.com/evolvia-tecnologia/evolvia-platform/pull/647). Sugestão do primeiro nome editável, telefone internacional sem área oculta e etiquetas consistentes no posto/totem.
- HEAD validado `9cb2940f`, [CI42229498792](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42229498792) completo aplicável verde: 948 testes da API, 729 da Web, PostgreSQL/migration, acessibilidade runtime e ARM64 Web. Árvores validada e integrada idênticas. Revisão independente Codex sem novos bloqueadores; não confundir com a revisão Gemini histórica.
- Publicação pós-merge [42231851766/job127946099903](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42231851766/job/127946099903) comprovou `develop@4cf655b5`, containers saudáveis, API/PostgreSQL prontos e HTTPS acessível em 06/11 às 11h28 São Paulo. O gate público falhou depois por `Server: nginx/1.24.0` e pelo alias `dev` com certificado/redirect divergentes. Isso comprova implantação, sem aprovar o gate público nem a jornada autenticada.
- [#647](https://github.com/evolvia-tecnologia/evolvia-platform/pull/647) integrado por squash `49aeae51`, HEAD final `7dd48da9`, CI aplicável completo verde, zero threads e revisão independente final sem bloqueadores. A prévia ilegível permanece visível em tela e excluída da impressão; publicação e jornada física continuam pendentes.
- Direção atual: Work integra; Codex responde por G2/financeiro/fiscal; Claude por operadores/operação/CAEX; Gemini por ciência/comunicações; Cursor retomado para etiquetas e Sports. Contrato [#571/6685989083](https://github.com/evolvia-tecnologia/evolvia-platform/issues/571#issuecomment-6685989083), decisão EVO-021. Esta distribuição substitui atribuições históricas incompatíveis abaixo.
- A correção refina um critério já integrado. A última medição continua histórica: **92,9% implementado / 70,0% comprovado, 85/93, 0/11 Gates encerrados**. Sem novo crédito por branch, agenda ou refinamento.

Detalhes da entrega e limitações no [Master Codex](EVOLVIA_MASTER_CODEX.md); próximas ações no [Backlog](BACKLOG.md). Histórico preservado abaixo.


## Checkpoint de execução — 05/11/2026

Base integrada verificada: `develop@9fd3bed60347a8f6eefb2a0bcda46f4ff18cca21`.
Este checkpoint registra entregas e coordenação; não recalcula a matriz de 93 critérios.

- [#643](https://github.com/evolvia-tecnologia/evolvia-platform/pull/643): recuperação segura da Transmissão integrada em `dd5285b0ea01070e4dd07a29fa59e1b2ecf30c06`, HEAD validado `f3872c30e5d02af9fd2d89f97abe388efc9a1e23`. CI [42029015343](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42029015343) completo aplicável aprovado: 944 testes API, 708 Web, integração/PostgreSQL/migration e ARM64 Web. Leitura obrigatória antes de editar, trava síncrona e recuperação por GET após resultado de escrita desconhecido; sem nova entidade, ACL ou envio externo.
- Publicação do #643 comprovada no [run42030834086/job127262197907](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42030834086/job/127262197907): Commit `dd5285b0` em 05/11 às 13:06:53 UTC (10h06 São Paulo), API/PostgreSQL prontos e HTTPS200 às 13:06:54 UTC. O check público falhou depois por `Server: nginx/1.24.0` e certificado do alias `dev` incompatível com o hostname. Isso comprova publicação, sem aprovar o gate público ou o ensaio autenticado.
- [#644](https://github.com/evolvia-tecnologia/evolvia-platform/pull/644): contraste integrado em `9fd3bed6`, HEAD `2b4ef9cd7fe67d8084d8d325dfaa029c961504cb`, CI [42030957167](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42030957167) completo aplicável verde, Gemini sem apontamentos e zero threads. Reaproveita a linha revisada do #636 sobre a base atual; branch Codex preservada. #636 foi encerrado como substituído após o merge. Contraste calculado entre 5,21:1 e 6,06:1 nas cinco superfícies claras canônicas. Publicação desse squash e avaliação humana global exigem evidência separada.
- Refinamentos de Transmissão e contraste não criam critério novo. A última medição permanece **92,9% implementado / 70,0% comprovado, 85/93, 0/11 Gates encerrados**. Não confundir essa medição de 27/10 com uma nova auditoria funcional em 05/11.
- Direção vigente do fundador: Codex mantém G2/financeiro/etiquetas/integrações; Claude mantém operadores/credenciamento/expositores na #640; Gemini mantém científico/comunicações/cartas/Sports na #641, respeitando locks anteriores; Work coordena, implementa cortes independentes e integra. Essa distribuição substitui a exclusividade de implementação registrada nos checkpoints históricos. Detalhes em EVO-020 e #571.
- Atividade externa só é confirmada por ACK/commit verificável. Comentários em filas não iniciam sessões de Claude/Gemini; não existe executor externo conectado nesta sessão. Work atua nesta execução e registra o handoff, sem promessa de implementação automática entre mensagens.

## Última medição dos Gates — 27/10/2026, 10h11 (São Paulo)

Implementação **92,9%**; conclusão comprovada **70,0%**; **85/93** unidades integradas; **0/11 Gates encerrados**. Recálculo pelos mesmos 93 critérios e pesos iguais dos 11 Gates: 92,9154% de integração e 69,9707% de I/T/D/F. Nenhum marco foi alterado por refinamento, branch, comentário ou espera.

- [#605](https://github.com/evolvia-tecnologia/evolvia-platform/pull/605) integrado em `7c059cfbdd92089966ef620a51f09fccda00bc86`; publicação comprovada em [run40466131316/job122065653324](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40466131316/job/122065653324), 27/10 às04h30 São Paulo, API/PostgreSQL prontos e HTTPS200.
- [#551](https://github.com/evolvia-tecnologia/evolvia-platform/pull/551) integrado em `8bea955c7a4645370e2fcf90a74171cd67b7fbb2`, árvore validada `f810525f203d196e0128cecfd20a159c9e1a3e20`. CI40466676636 completo aplicável verde, 89 testes PostgreSQL, Gemini5663992790 triado e zero threads antes do squash esperado. Publicação comprovada em [run40473034582/job122089115530](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40473034582/job/122089115530): Commit08:37:47UTC/05h37 São Paulo, prontidão API/PostgreSQL e HTTPS200 às08:37:48UTC. Inclui carga prévia dos avaliadores, revalidação limitada aos trabalhos travados e navegação científica/Secretaria. G6.8 permanece incompleto: avisos e aceite operacional completos não foram demonstrados.
- [#606](https://github.com/evolvia-tecnologia/evolvia-platform/pull/606) integrado em `d0493a743690fad325c4c64646dd12a7ad345ae7` às09:19:52UTC/06h19 São Paulo, árvore `55b5bcbb3e1758c835fa027e972f0428b322d5bd` idêntica ao HEAD877ee94e. CI40475151905 completo aplicável verde, Gemini5664728098 triado, zero threads e squash com SHA esperado. Relatórios recolhíveis e API BI GET de agregados com autenticação no cabeçalho, ACL e escopo org/evento; sem dados nominais ou token na URL. 18 testes focais, tsc API e ensaio HTTP local com JWT assinado aprovados; banco em memória nesse ensaio, sem equivaler a PostgreSQL/homologação. Publicação606 comprovada em [run40479956349/job122112460724](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40479956349/job/122112460724): Commit d0493a743690fad325c4c64646dd12a7ad345ae7 às09:34:54UTC/06h34 São Paulo; prontidão API/PostgreSQL e HTTPS200 às09:34:56UTC. Pós-merge: 919 testes API,656 Web,89 PostgreSQL e ARM64 aprovados. O gate público falhou depois por Nginx/alias TLS; conexão/refresh PowerBI e aceite humano não comprovados.

O gate público falhou após as implantações605/551/606 pela versão Nginx exposta e pelo aliasdev com TLS/redirect incorretos. Isso não desfaz a evidência de implantação nem aprova o gate. Sem Go de produção, mudança de infra ou efeitos externos reais.

**Próxima posição:** ensaiar jornadas autenticadas com duas organizações/eventos, candidato da equipe e primeiro evento oficial, incluindo mobile320/390px, teclado, recuperação de falhas e aceite humano. Comunicação594 conserva sua branch e o bloqueio de SMTP/canal/destinatário autorizado; Asaas real exige acessos específicos. Não reenviar e-mails nem movimentar dinheiro. Histórico de certificados602 já integrado, sem reiniciar essa frente. Codex mantém ownership exclusivo; Gemini revisa apenas código novo uma vez por SHA. Sem Cursor/Composer; máximo dois críticos e leases nas filas570/571/545.

## Reconciliação histórica — 26/10/2026, 02h33 (São Paulo)

Implementação **92,9%**; conclusão comprovada **70,0%**; **85/93** unidades integradas; **0/11 Gates encerrados**.

Fonte integrada e publicada `develop@4337c99cd83cec1939b3744910032165c370cd85`, árvore `e593ba988772ded471c3298488a8900bb23a2c21`. **G11.2 recebe I/T/D**, por #549 e [#601](https://github.com/evolvia-tecnologia/evolvia-platform/pull/601): pacotes/lotes de participação e dos cinco papéis científicos, verso original e carga horária canônica congelados, auditoria atômica, replay e PDF histórico. [CI40272157015](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40272157015), HEAD`e0fbd9fce5e95f9a03cac2e8391c57cdec3b3625`, completo aprovado: 892 API,632 Web,84 PostgreSQL, migration e ARM64. Gemini5647622754 triado; threads resolvidas antes do squash esperado. Árvore validada idêntica à integrada.

**Publicação separada do merge:** [run40273335894/job121414197364](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40273335894/job/121414197364), Commit4337c99c em26/10 às05:33:22UTC (02:33:22 São Paulo), readiness API/PostgreSQL e HTTPS200 às05:33:23UTC. Qualidade, integração/migration e ARM64 pós-merge verdes. A verificação pública falhou depois da implantação: versão Nginx exposta e aliasdev com hostname TLS divergente e HTTP200 em vez308/sem Location. O passo diagnóstico do alias conclui success, mas seu log contém4falhas; isso não constitui aceite. Sem Go de produção ou alteração de infra.

**F permanece pendente em G11.2**: jornada autenticada em duas organizações/eventos, mobile320/390px, teclado, emissão/retry/download e impressão, com aceite humano. Esses ensaios não são confundidos com I/T/D já demonstrados. Delta sobre a reconciliação anterior: +1,5p.p. implementação / +1,1p.p. comprovado; uma unidade e três marcos, sem alterar denominador ou pesos. Gate11 fica100,0% implementado e75,0% comprovado; nenhum Gate é encerrado.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 71,4% | 53,6% | 30/56 |
| 3 | Área reservada do inscrito | 100,0% | 75,0% | 24/32 |
| 4 | Configuração científica | 100,0% | 75,0% | 24/32 |
| 5 | Submissão pelo autor | 87,5% | 65,6% | 21/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 92,3% | 69,2% | 36/52 |
| 11 | Pós-evento | 100,0% | 75,0% | 18/24 |

**Próximo lote candidato, sem crédito adicional:** paginação do histórico de pacotes científicos além dos20 recentes, na mesma branch de certificados e com contrato #571/6409054537. Sem nova entidade/migration ou mudança na emissão/PDF. Comunicação594 preservada na branch existente: análise de transporte #570/6406911390 pendente; rascunhos e prévias não concluem G5.8/G6.8/G7.4 nem e-mail recebido. Sem canal/destinatário autorizado, não enviar mensagens reais. Codex implementa, Gemini revisa apenas deltas novos; sem Cursor/Composer. Máximo dois críticos e leases vivos. Preservadas as demais frentes/bloqueios, main/produção/infra/secrets/billing.

### Histórico anterior — não representa o estado vigente

## Reconciliação histórica — 26/10/2026, fonte fcb089cd (São Paulo)

Implementação **91,4%**; conclusão comprovada **68,8%**; **84/93** unidades integradas; **0/11 Gates encerrados**. Fórmulas e marcos I/T/D/F preservados, sem crédito por rascunhos ou refinamentos de critério incompleto.

Fonte integrada `develop@fcb089cd0aecd4394e57a4c563ed8b01f3caa14d`. #596/editor, #597/snapshot original, #598/rascunhos, #599/prévia de inscrições, #549/pacotes de participação e #600/autores correspondentes foram integrados. #549 squash `ac376be3de91be0e5ad177dc3d4fb2c60044d34b`: CI [40252884867](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40252884867), 81/81 PostgreSQL. #600 HEAD `4576ccd480ea21941379b833607f93c3207e58e0`: CI [40257810122](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40257810122) completo aprovado, Gemini5646679067 e threads resolvidas antes do squash esperado.

**Publicação comprovada, separada do merge:** [run40258960289/job121369593123](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40258960289/job/121369593123), Commit `fcb089cd` em26/10/2026 às02:38:31UTC (25/10 23:38:31 São Paulo), readiness API/PostgreSQL e HTTPS200 às02:38:33UTC. #549 também publicado no run40257495655/job121365166329 às02:21:49UTC. O gate público falhou **depois** da implantação: versão Nginx exposta e aliasdev com TLS/redirect incorretos. Sem Go de produção ou aceite público adicional.

**Direção aprovada pelo PO em25/10 substitui as alternâncias/janelas históricas abaixo:** dois resultados completos, Comunicação científica G5.8/G6.8/G7.4 e certificados G11.2, potencial +5,30p.p. somente com critérios existentes cumpridos. Codex implementa exclusivamente; Gemini auxilia/revisa segurança de delta novo uma vez por SHA, sem editar os mesmos paths. Sem Cursor/Composer, sem parada às06h ou espera por outra04h. Máximo dois candidatos críticos, branches existentes e leases nas filas569/570/571/545.

Comunicação: rascunhos e seleção de destinatários integrados não concluem aviso, distribuição assistida/lote ou carta entregue. Reutilizar ScientificAuthorNotice e contratos existentes; análise do transporte registrada em #570/6406911390. SMTP por organizador, canal configurado e destinatário autorizado/recebimento real permanecem pendentes. Não disparar e-mail real ou movimentar dinheiro sem autorização específica.

Certificados: participação já tem pacotes idempotentes, verso e carga congelados. Próximo candidato na mesma branch de certificados estende isso aos cinco papéis científicos: frente/verso/carga históricos, pacotes persistidos, replay e PDF limitado. Somente após CI aplicável, Gemini, integração, publicação e jornada autenticada/mobile/teclado/impressão/aceite poderá ser revisto G11.2. Não marcar o candidato como entregue ou pontuar antecipadamente. Demais pendências preservadas: Asaas sandbox, áreas de feira/CAEX e comparação visual, ACL granular, fiscal, WCAG humana e hardware. Main/produção/infra/secrets/billing sem alteração.

# Estado oficial do projeto

## Reconciliação histórica — 25/10/2026, 13h30 (São Paulo)

Implementação **91,4%**; conclusão comprovada **68,8%**; **84/93** unidades integradas; **0/11 Gates encerrados**.

Fonte integrada `develop@4407173be303bbe9e94bd87ee63b028140b2a0c3`, árvore `83d42216dff0acd54c7e6a62b12b8718878dcadc`. #593/CAEX foi integrado em0b3a0276, #595/Asaas em4916d0ee e #480/kits em4407173b. O [CI40210806446](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40210806446) do HEAD7fa7c247 (árvore idêntica ao squash480) passou qualidade, integração e ARM64;71 testes PostgreSQL incluem serialização da primeira configuração com duas conexões, estoque, isolamento e auditoria. Gemini5644099897 sem novos apontamentos; threads resolvidas antes do squash com SHA esperado.

**Publicação separada do merge:** run40211680312 ainda pendente para4407173b. Último deploy comprovado4916d0ee: [job121108485994](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40172588455/job/121108485994), Commit às07:37:37UTC e readiness API/PostgreSQL+HTTPS200 às07:37:39UTC. O gate público falhou depois por Nginx exposto e aliasdev com TLS/redirect incorretos; isso impede declarar aceite público ou Go de produção. Não modificar infra nesta frente.

**Direção atual substitui as janelas antigas abaixo:** somente Codex implementa e Gemini revisa, sem Cursor/Composer. Seis frentes sequenciais por lote, respeitando leases e no máximo dois críticos; não existe mais parada às06h nem espera por outra janela04h. #596 continua na branch existente, HEAD834f1383 antes da reconciliação com4407173b: PDF com fonte/cor/tamanho/alinhamento reais, Unicode/paginação e alinhamentos Web consecutivos corrigidos; revisões Gemini5644087481/5644121722, CI da composição final obrigatório. Não repetir revisão em reconciliação sem delta funcional.

Comunicação#594 aguarda estabilização do editor, com SMTP por organizador, filtros, editor e resultado simples do lote. Snapshot original/verificador de certificados ainda falta; Asaas sandbox e recebimento SMTP exigem acessos/destinatário autorizados, sem envio real ou movimentação financeira nesta execução. CAEX integrado não substitui comparação visual Mitte/mobile e jornadas autenticadas. Próximas posições: concluir596/CI/publicação, Comunicação, certificados, integrações autorizadas, áreas de feira/mobile e homologação integral. Nenhum crédito por branch, comentário ou espera; preservar fórmulas e critérios I/T/D/F existentes até prova adicional.

### Histórico anterior à reconciliação acima



## Reconciliação histórica — 25/10/2026, 02h00 (São Paulo)

Implementação **91,4%**; conclusão comprovada **68,8%**; **84/93** unidades integradas; **0/11 Gates encerrados**. Baseline de 93 critérios, pesos iguais entre os 11 Gates e fórmula I/T/D/F preservadas.

Fonte integrada e publicada `develop@da289784e180aad811b4dd2cd0351245ca560774`, árvore `bc3d3d3cd77552a7693da4256cd0564f51bbf79c`. **G2.12 recebe I/T/D**: troca de categoria paga #589 integrada em `86d66596`, HEAD `602cd42c`, [CI1762](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40061298212) aprovado. Preço recalculado igual ao valor pago, snapshot/checkout preservados, concorrência e auditoria testadas. **G3.7 recebe D** pela publicação deste descendente de `6344d8d7`.

[Publicação40154762958/job121056008408](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40154762958/job/121056008408): Commit às02:45:34UTC e readiness API/PostgreSQL + HTTPS200 às02:45:35UTC de25/10 (24/10,23h45 São Paulo). Qualidade, integração e ARM64 passaram; o gate público falhou depois por Nginx exposto e aliasdev/TLS. Isso comprova implantação, sem aceite funcional nem Go de produção.

**G2.13 permanece sem I/T/D/F**: #579 integrado `0213c9e3`, HEAD `15161524`, [CI40122892166](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40122892166) aprovado, mas o critério exige e-mail entregue e a prova externa está pendente. Não confundir aceite HTTP com recebimento. #591 integrado disponibiliza Relatórios, refinamento de critérios existentes, sem nova unidade. Nenhum F novo.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 71,4% | 53,6% | 30/56 |
| 3 | Área reservada do inscrito | 100,0% | 75,0% | 24/32 |
| 4 | Configuração científica | 100,0% | 75,0% | 24/32 |
| 5 | Submissão pelo autor | 87,5% | 65,6% | 21/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 92,3% | 69,2% | 36/52 |
| 11 | Pós-evento | 83,3% | 62,5% | 15/24 |

Delta sobre24/10: **+0,6p.p. implementação / +0,8p.p. comprovado**, uma unidade integrada e quatro marcos. Não há crédito por branches ou comentários.

Críticos: #593 `8531682b`, CI40154824753 aprovado, comparação visual exata Mitte pendente; #595 `26a09a37`, CI40160206321 falhou em asserção estática antiga que exigia o guard por subdomínio, correção no mesmo candidato. #596 `a8ce5a0d` é candidato serial Cursor, CI falhouTS5097 e editor/PDF precisam correções; ownership preservado. Merges reservados para04h de25/10, somente com HEAD esperado, base atual, CI completo aplicável e revisões resolvidas. Ainda sem novos merges nesta janela.

Próximos bloqueios: Asaas sandbox real (credenciais indisponíveis nesta sessão), e-mail recebido, editor/PDF/snapshot histórico com handoff, Comunicação594, ACL operador, fiscal, WCAG humana e hardware. Preservar jornadas dos seis perfis, duas organizações/eventos, desktop320/390/teclado e negativas. Após06h termina esta janela de desenvolvimento; segue somente acompanhamento dos pedidos Cursor. Webhook persistente permanece ativo.

## Snapshot histórico — 24/10/2026

Implementação **90,8%**; conclusão comprovada **68,1%**; **83/93** unidades integradas; **0/11 Gates encerrados**. Baseline de 93 critérios, pesos iguais entre os 11 Gates e fórmula I/T/D/F preservadas.

Fonte integrada `develop@6344d8d7e5d33f17196320f5fca67cb6141f2517`. #588 integrou histórico por consentimento restrito ao e-mail do confirmante, sem transferir autorizações recebidas de terceiros. CI [1759](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40059484960), HEAD39c009ab: PostgreSQL57/57, API/Web, migration e ARM64 aprovados; revisãoGemini executada no mesmo SHA e threads tratadas. **G3.7 recebe I/T; D/F pendentes.** A confirmação fica na área da conta autenticada; envio externo e aliases legados não estão implementados.

#587 integrado15e60efc e publicado: [job120763928889](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/40056781316/job/120763928889), Commit03:20:15UTC e readinessAPI/PostgreSQL/HTTPS200 às03:20:16UTC em24/10. RefinaG3.8 já integrado, sem unidade nova. Gate público reprovado por versãoNginx e aliasdev/TLS. Publicação6344d8d7 segue pendente de prova própria.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 100,0% | 71,9% | 23/32 |
| 4 | Configuração científica | 100,0% | 75,0% | 24/32 |
| 5 | Submissão pelo autor | 87,5% | 65,6% | 21/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 92,3% | 69,2% | 36/52 |
| 11 | Pós-evento | 83,3% | 62,5% | 15/24 |

Críticos atuais: #589 (troca equivalente, branch reconciliada após588) e #579 (retomada do e-mail após corrigir configuração), ambos semcrédito. Próximos: G5.8/G6.8/G7.4 nos candidatos existentes. Sem Go de produção, sem novo aceite humano. Permanecem jornadas autenticadas dos seis perfis, sandboxAsaas, e-mail real, acessibilidade humana e hardware; preservar os roteiros históricos abaixo.

Delta sobre22/10: +1,1p.p. implementação/+0,6p.p. comprovado;83/93. Integração de documentação e candidato em branch não equivalem a publicação. 

## Snapshot histórico — 22/10/2026, 10h10 (São Paulo)

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

- #586 sucede o #585 e inclui correção da fixture temporal que bloqueava a integração. #587 permanece Draft, com provas PostgreSQL pendentes; #582 incorpora develop e aguarda CI válido. #579–#581/#583/#588/#589 seguem candidatos sem crédito por rascunho. #568 só pode ser encerrado após o sucessor integrado.
- Retomada de 22/10 às 14h59 (São Paulo): Codex assume a fila pendente Cursor/Composer #569 além de #571/#545, preservando branches e commits. Críticos #586/#587; #590 é o lote visual Codex já submetido, sem ampliação de frentes. Logs dos jobs `119844632586` e `119841101349` demonstram 404 no CAE após expirar o lote fixo em `2026-10-22T12:00:00Z`. A fixture passa a usar uma âncora relativa à execução, mantendo a rejeição de lote depois do evento. Regressão local: 5/5 em Node24, usando a política comercial real e o instante da falha; CI completo do novo SHA ainda pendente. Não equivale a merge, publicação ou aceite.
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



## Checkpoint proposto — 14/11/2026, 19h BRT

Auditoria de fechamento: `develop@8741613681c55f60de93f6f6072d7ba1c5c895dc`. Nenhum PR integrado ou deploy comprovado neste ciclo. #676 CI43637885633 falhou (5 casos de isolamento/autorização), #675 CI43598175714 falhou (HTTP/PG e base main), #672 CI43464220927 verde mas 2 threads abertas, #491 Draft/conflitos, #674 Draft/5 threads. **Não alterar marcos I/T/D/F**. Detalhes, owners, riscos e próximos passos em [CLOSING_2026-11-14_19H.md](./CLOSING_2026-11-14_19H.md). Este checkpoint permanece como proposta até a revisão/merge do PR documental.
