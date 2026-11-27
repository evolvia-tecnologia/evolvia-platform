
## Publicação verificada em 24/11/2026

O deploy da `develop` em `ab02d8d859f29061ff45ec0ebfc27f17aa0ffe3a` passou na verificação pública do Nginx (#108), incluindo HTTPS, cabeçalhos e a ocultação da versão. A coleta das imagens atualmente ativas e o aceite autenticado por perfil continuam pendentes. [Job de publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/45313903366/job/138180865264) · [Coleta no VPS](https://github.com/evolvia-tecnologia/evolvia-platform/issues/571#issuecomment-7200660810).

## Reconciliação de #719 e #743 — 27/11/2026

Implementação **96,9%**; conclusão comprovada **73,0%**; **89/93** unidades integradas; **0/11 Gates encerrados**.

Na tentativa 2 da execução 45259500761, o publicador registrou `99a041a128ac6d8d3cd35c908d5e6e5bf01b1204`, contendo G5.8 e G7.4. A API e o PostgreSQL responderam prontos e o redirecionamento HTTP retornou 308. A matriz incorpora a publicação desses dois critérios uma única vez. O recebimento autorizado do aviso e o aceite da jornada autenticada das cartas continuam pendentes. O registro de 24/11 para `ab02d8d8` permanece como evidência de publicação posterior. A identificação das imagens em execução depende da coleta no host. [Publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/45259500761/job/138127736334)

## Reconciliação G5.8 I/T — 23/11/2026 (PR #708 integrada)

Implementação **96,9%**; conclusão comprovada **72,3%**; **89/93** unidades integradas; **0/11 Gates encerrados**.

Fonte canônica da matriz: `393ab9930d205dcb592cbf283b55c3fd1d2d86e3`. G5.8 I/T comprovados pela #610 e #708, CI #45105953160 COMPLETED/SUCCESS (qualidade, PostgreSQL e ARM64). **D/F continuam falsos**: não há evidência de envio externo autorizado, SHA implantado ou aceite humano. A PR #702 foi fechada sem merge como superada. G2.11, G2.13, G2.14 e G6.8 permanecem pendentes de implementação completa. O gate público Nginx #108 continua externo. Não inferir prontidão de produção. Registros históricos abaixo permanecem como histórico.

## Reconciliação pós-merge #518 — 22/11/2026 (G7.4 somente I/T)

Implementação **95,8%**; conclusão comprovada **71,7%**; **88/93** unidades integradas; **0/11 Gates encerrados**.

Fonte canônica da matriz: `865bf03f2315642612c1e251559701bca87a993e`. A PR #518 foi integrada em `develop@e46268121378b77343231366922fd6a6b723830d`; os testes PostgreSQL e CI foram comprovados. G7.4: I=true, T=true, D=false, F=false. A publicação teve gate público reprovado pelo cabeçalho Nginx (#108); faltam correção autorizada, correlação do SHA servido, jornada autenticada e aceite humano. Os registros históricos abaixo são preservados.


# Backlog e ordem de execução — Modo Lançamento

## Reconciliação de 19/11/2026

Implementação **94,3%**; conclusão comprovada **71,0%**; **87/93** unidades integradas; **0/11 Gates encerrados**.

Base integrada `865bf03f2315642612c1e251559701bca87a993e`. G2.10 e G10.10 têm integração, CI e publicação demonstrados. O aceite autenticado segue pendente. Ambos os jobs registraram a prontidão da API e do banco e depois reprovaram o cabeçalho Server. [Compra múltipla](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42683330025/job/129390430705) · [Permissões de operador](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42715129263/job/129500945850).


## Prioridade operacional em 17/11/2026

Work coordena a recuperação [#108](https://github.com/evolvia-tecnologia/evolvia-platform/issues/108) e o corte conjunto com a suíte [#686](https://github.com/evolvia-tecnologia/evolvia-platform/pull/686). O operador autorizado deve inspecionar a configuração carregada, aplicar o corte validado com backup e rollback e repetir a prova externa de versão do proxy. Para habilitar o aceite das jornadas, correlacionar o SHA solicitado, o informado pelo gateway e o identificado no serviço ativo. A execução anterior está no [job de publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/44146606412/job/134271238197).

## Fila vigente — 06/11/2026

Contrato [#571/6685989083](https://github.com/evolvia-tecnologia/evolvia-platform/issues/571#issuecomment-6685989083) e decisão EVO-021 substituem a distribuição histórica de 05/11 abaixo. Base integrada: `49aeae51` (#637 e #647). Handoffs exigem ACK com SHA e arquivos; não reimplementar código integrado nem disputar caminhos ativos.

| Frente | Dono | Próxima conclusão |
| --- | --- | --- |
| Inscrição #637 / integração | Work | Código integrado e publicado em homologação; gate público falhou depois por versão Nginx e alias `dev`. Jornada autenticada ainda pendente. Sem novo crédito de critério. |
| G2.10 / #471 | Codex | Recusar entrada de valor zero em pedido PAID antes das escritas, preservando FREE; tratar threads novas e atualizar base com CI/revisão final. [Achado](https://github.com/evolvia-tecnologia/evolvia-platform/pull/471#issuecomment-6686774524). |
| G2.11 / #491 | Codex + Work nos compartilhados | Operação financeira persistida, compensação e efeito nas credenciais; pedido administrativo não comprova estorno. |
| G2.13 / #579 e #557 | Codex | Reaproveitar transporte integrado, sem reaplicar PR antigo; provar entrega por canal e destinatário autorizados. |
| G2.14 / #613 | Codex | Completar API, persistência e adaptador; dependências fiscais municipais e do provedor explícitas. Rascunho não é NFS-e. |
| G5.8 / #610 e G6.8/G7.4 / #518 | Gemini após ACK do worker | Concluir avisos, lote, cartas e consulta do autor; preservar outbox e não disparar e-mail real sem autorização. |
| G10.10 / #642 e CAEX | Claude | Montar UI, provar HTTP/concorrência PostgreSQL/impressão. Três inversas do schema já presentes no SHA59801816; não repetir esse bloqueio histórico. |
| Etiquetas #614 → #647 | Work/Cursor | Integrado em `develop@49aeae51`; HEAD `7dd48da9`, CI aplicável completo verde e revisão independente aprovada. Aguardar publicação e jornada física de impressão. [Achado corrigido](https://github.com/evolvia-tecnologia/evolvia-platform/pull/647#issuecomment-6686639676). |
| Sports #621 → #648 | Cursor | Catálogo público não conclui jornada de atleta/estoque; fechar comportamento completo com persistência existente e testes. |

Um resultado ativo por dono; até dois candidatos críticos de integração. Shared paths com patch mínimo serializado por Work e lease conferida. Sem mudança de produção, infra, secrets, cobrança, APIs pagas ou efeitos financeiros/comunicação reais. Datas e metas não substituem CI, revisão ou prova funcional. Percentuais não foram recalculados nesta atualização.


## Fila sincronizada — 05/11/2026

Esta seção substitui a ordem executiva histórica abaixo, sem mudar a fórmula ou o denominador dos Gates. Coordenação e leases: [#571](https://github.com/evolvia-tecnologia/evolvia-platform/issues/571). Política de execução: EVO-020.

| Critério/frente | Responsável | Próxima entrega funcional e dependência |
| --- | --- | --- |
| G2.10 — Compra múltipla | Codex | Reconciliar #471 com develop vivo; preservar reserva atômica, identidade por entrada, idempotência e revisão do SHA final. |
| G2.11 — Reembolso | Codex | Aproveitar #491, concluir compensação no gateway e efeito nas credenciais; pedido administrativo não comprova reembolso financeiro. |
| G2.13 — Confirmação de inscrição | Codex | Reutilizar transporte integrado, tratar falhas/repetição e comprovar entrega por canal/destinatário autorizados. |
| G2.14 — NFS-e | Codex | #613 é contrato de rascunho; faltam API/persistência/adaptador e homologação fiscal do provedor. |
| G5.8 — Avisos de submissão | Codex | Fechar #610 preservando ownership do worker; coordenar contrato de transporte com Gemini, sem duplicar a implementação. |
| G6.8 / G7.4 — Lote e cartas | Gemini, fila #641 | Aproveitar a comunicação já integrada/#594 e #518; concluir seleção→envio→resultado, consulta do próprio autor e entrega rastreável. Não editar o worker #610 sem acordo. |
| G10.10 — Operadores | Claude, fila #640 | Aproveitar #642; helper isolado não conclui concessão/revogação persistida, aplicação no serviço e interface. Histórico por episódios preservado. |
| Expositores/CAEX | Claude, fila #640 | Usar módulos integrados; completar somente lacunas de cotas, credenciais, equipe, leads e relatórios comprovadas no código. |
| Sports | Gemini após lock #621 | Reutilizar a base Corrida e os módulos de estoque já integrados; fechar atleta/modalidade/kit/camisa/estoque e pós-evento sem disputa de paths. |
| Cortes independentes / integração | Work | #643 e #644 integrados; WORK-02 facilita Informações do evento pela edição existente. Consolidar evidência no Master Codex sem pontuação antecipada. |

Manter no máximo dois candidatos críticos; uma implementação por conjunto de paths. Priorizar tela+API+banco/integração quando aplicáveis, testes essenciais de segurança/permissões/integridade e checks obrigatórios. Auditoria E2E abrangente fica para a etapa final. Nenhum envio real, pagamento real, alteração de produção, secret ou gasto adicional é autorizado por este registro.

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


GitHub Issues contém as unidades de trabalho. O estado e os percentuais
auditáveis estão em [PROJECT_STATE.md](PROJECT_STATE.md). Este quadro prioriza
o `develop` vivo; `main` e produção aguardam Go/No-Go próprio.

## Prioridade vigente — 09/10/2026

Implementação **78,7%**; conclusão comprovada **59,3%**; **73/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Clone seguro #470 integrado em `develop@42256f46` e publicado no conjunto `develop@38bfc29e`; ensaio negativo cross-org/evento e aceite seguem pendentes. Central administrativa do expositor integrada (#490), com navegação refinada por #520/#527; portal/CAEX permanece no #537/#538. G10.13 fica parcial. G5.6 segue parcial com UI PDF no draft #497. #494/#498, #491, #471, #480 e #368 não pontuam enquanto não integrados. Asaas sandbox, entrega real de e-mail, WCAG humana e hardware continuam pendentes. `main` e produção sem promoção.

1. Priorizar jornadas e correções dos Gates; HTTPS/alias adiado pelo Product Owner até 95%, preservando No-Go e checks.
2. Provar em sessão autenticada o fluxo administrativo do expositor #486 (320/390/desktop/zoom, teclado/leitor e negativos cross-org/evento); concluir identidade externa #408 sem recriar a central #490 nem os refinamentos #520/#527.
3. Revisar PDF inicial #497, acessibilidade #494/#498, compra múltipla #471, reembolso #491 e kits #480 no HEAD vivo; cortes concorrentes precisam de handoff.
4. Ensaiar fila #468 no SHA implantado, manter limite de reentrada e entrega de e-mail como pendências explícitas.
5. Ensaiar o clone #470 com duas organizações/eventos; concluir ACL #368, blocos/janelas, rascunho, rubrica/reabertura, comunicação, vínculo sessão/trabalho e certificados.
6. Asaas sandbox, NFS-e e hardware com provas próprias; CI/automação não equivalem a aceite humano.

Há 74 PRs abertos no snapshot: lista exata em GATES_STATUS.json. PR aberto não é entrega. Fonte integrada e publicada: 38bfc29e4576ca182f84285ba21b2b91dd6758fc; run #1502 publicou com readiness, mantendo falhas públicas conhecidas de Nginx/alias. As filas e percentuais abaixo são históricos.

## Snapshot histórico — prioridade de 07/10/2026 UTC

Implementação **76,5%**; conclusão comprovada **57,7%**; **71/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

1. Corrigir Nginx/TLS no host e registrar WCAG humana; não enfraquecer checks.
2. Ensaiar jornadas autenticadas, negativo cross-org/evento, gratuito/comprovante/Asaas sandbox e dispositivos reais no SHA implantado.
3. Corrigir identidade do expositor (#408) e reconciliar ACL granular do operador (#368).
4. Completar rascunho/upload inicial PDF, blocos e janelas por modalidade, reabertura/rubrica e operações em lote.
5. Provar comunicação entregue, refund/categoria/fila/compra múltipla e NFS-e com homologação própria.
6. Completar vínculo sessão/trabalho, certificados por atividade/trabalho/papel, PDF/segunda via/lotes/verso, visitas/BI e clone seguro.
7. Reconciliar 65 PRs históricos com código vivo antes de integrar; dois têm destino main, três outras branches.

Integrados: coautores, avaliador/parecer, decisão com quórum da versão atual, ePoster, correção, agenda/vagas, presença diária/estorno, avaliação/CSV, EVA contextual, comissão e logo do totem. Não recriar esses módulos. Certificado de participação é parcial diante da engine completa.

## Snapshot histórico — backlog de 04/10/2026



Baseline v1: conclusão comprovada 39,0%, implementação 51,6%; [matriz dos 93 critérios](GATES_STATUS.md). Ordem operacional atual:

1. Resolver Nginx/TLS pelo acesso administrativo e concluir evidência humana WCAG.
2. Ensaiar Gate1/2/3/10 no SHA implantado: contas distintas, gratuito/comprovante/Asaas sandbox, QR, OPERATOR, totem e impressão física.
3. Resolver posse de identidade do #408 antes de integrar; #409 continua draft e não pontuado.
4. Concluir G5 coautoria/PDF, G6 área do avaliador/parecer, G7 decisão/comunicação e G8 arquivo final, reutilizando contratos existentes.
5. Completar UI de reagendamento, programação pública e agenda pessoal (G9).
6. Presença diária/estorno, vagas em atividades, relatórios finais e certificados por presença/papel.

As filas históricas abaixo não autorizam recriar funcionalidades já integradas. #368 refere-se à ACL granular restante; posto/totem/impressão básica estão no #395/#407. O percentual da issue #114 agora possui denominador documentado; a issue permanece aberta pelo restante de seu aceite (PRs antigos, evidência humana e Go).

## Snapshot anterior da consolidação em 04/10/2026

Leva #392/#395–#404 integrada: 11/11; este é um recorte de integração. CI e
homologação são critérios distintos. #406 e #407 estão integrados após CI completo (1202 e 1198). #408 aguarda prova de posse do e-mail na autenticação da
empresa, sem senha compartilhada. O estado e as evidências estão em
[PROJECT_STATE.md](PROJECT_STATE.md). O contrato de operação é direção futura,
não prova de entrega de todas as fatias.

## Direção do Product Owner em 04/10/2026

O Product Owner mandou incorporar no Evolvia a operação observada na Even3.
Isso ainda não está implementado. O contrato está em
[operacao-do-evento.md](../operacao-do-evento.md). Decisões EVO-016 e EVO-017.

O Orquestrador incorpora uma fatia por vez, nesta ordem:

1. Histórico do inscrito por CPF ou passaporte, com login por e-mail.
2. Pessoas do evento e exportação da ficha, uma coluna por campo.
3. Relatórios do próprio evento: visitas, inscritos, submissões, vendas e valor recebido.
4. Presença por dia e por atividade, junto da presença geral e da entrega de material.
5. Inscrição na atividade, separada da inscrição no evento.
6. Avaliação do evento, com exportação.
7. Clonar evento, sem pessoas e sem dinheiro.
8. Link oculto e troca de categoria.
9. Avisos por e-mail, sem WhatsApp.
10. Prazo com hora, lote visível e fila de espera.
11. Científico operacional sobre o que já existe, com PDF passivo.
12. Programação na página pública e agenda da pessoa.
13. Certificado sem cobrança de download, só com presença ou papel confirmado.
14. Reembolso visível antes de pagar e cupom em quantidade.
15. Transmissão: um link https do evento para inscrição confirmada. Se o campo já existir, não criar outro modelo; o que falta é o link da atividade.
16. Credenciamento: posto, celular, leitor, etiquetas, relatório, impressão, sorteio, totem e o link com validade já estão no rascunho #407. Não recriar. Presença por dia continua na fatia 4.
17. Área do expositor: o menu Expositor e serviços, os formulários que a empresa e o prestador veem, cotas, credenciais e pedidos já estão no rascunho #408. Acesso por e-mail e documento da empresa. Não recriar e não acrescentar senha, boleto nem upload.

Doação, assento, anais, DOI, WhatsApp, aplicativo nativo, upload de vídeo,
comentário na transmissão, senha compartilhada do evento, senha de expositor, inscrição em grupo
como módulo, permissão menu a menu e captcha não entram por esta direção.

| Prioridade | Frente | Estado e próxima ação |
| --- | --- | --- |
| P0 | Gate público da homologação | CI #977: deploy e readiness concluídos, Gate vermelho pela versão do Nginx exposta e pelo TLS/redirecionamento do alias `dev`. Corrigir no host e repetir a prova sem enfraquecer checks. |
| P1 | WCAG humana | Registrar teclado/foco e NVDA ou VoiceOver no fluxo real, incluindo painel e inscrição. |
| P1 | Painel do evento | PR #370 integrado em `develop@1b3151c`: credenciamento e hierarquia dos acessos atualizados; verificar publicação em homologação. |
| P1 | Credenciamento e check-in | PR #368 draft: revisar, integrar e ensaiar câmera/leitor e fallback antes de afirmar que a operação de entrada está concluída. |
| P1 | Gates 1–11 | Issue #114: estabelecer mapa, critérios e evidência de cada Gate. Não divulgar um percentual global sem denominador. |
| P1 | Jornada de inscrição | Cinco fatias integradas: #323/#325, #327, #329, #331, #335. Exercitar checkout e área do participante em homologação; cobrança real permanece desabilitada por padrão. |
| P1 | Integrações | Catálogo #149 integrado. Planejar adaptadores reais por plataforma, inclusive NFS-e de qualquer município/UF, com autenticação, idempotência, LGPD e homologação fiscal por provedor. O catálogo ainda não conecta nem emite. |
| P2 | Recuperação/confirmação de conta | Issues #40 e #42, transversais à jornada. |
| P2 | Contrato dos planejadores | PR #284: preservar exigências da revisão e revalidar antes de integrar. |
| P3 | Científico funcional, gamificação e demais jornadas | Desdobrar em fatias verticais aprovadas, sem atribuir progresso por código isolado. |

## Sequência operacional

1. Verificar publicação de `develop@1b3151c` em homologação e ensaiar o novo painel.
2. Corrigir versão do Nginx, certificado e redirecionamento do alias `dev` no host
   autorizado; repetir o Gate externo sem dispensar HTTPS ou cabeçalhos.
3. Executar validação humana de acessibilidade e registrar evidência.
4. Revisar PR #368 e testar credenciamento com dispositivos reais.
5. Reconciliar #114 para que os 11 Gates tenham critérios e percentuais
   reproduzíveis; manter o estado de cada corte sincronizado no projeto.
6. Exigir Go/No-Go explícito antes de promover `main` ou produção.

Regras transversais: isolamento `organizationId + eventId`, deny-by-default,
minimização de dados pessoais, auditoria, idempotência, migrations aditivas,
rollback, Node 22/ARM64, PostgreSQL, Redis, WCAG 2.2 AA e PT-BR.


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



## Próximos desbloqueios propostos — fechamento 14/11/2026

P0 Work: #676 corrigir identidade/autorização e cinco falhas CI43637885633; rodar HTTP/PostgreSQL e revisão. P0 Claude: #675 corrigir `Response.json` duplo, isolar delta de 1176 arquivos contra main, trazer PR limpo para develop, UI Master e migration aditiva controlada. P1 Cursor: #672 resolver 2 threads de foco/teclado, revalidar CI/320/390. P1 Codex: #491 Draft com conflitos e 10 threads, comprovar compensação sem dinheiro real. P1 Gemini: G7.4/G6.8 com autorização, isolamento e transporte simulado. P1 Work: revisão dos PRs encadeados #651/#662/#666/#663/#669. Referência: [fechamento 14/11](./CLOSING_2026-11-14_19H.md). Sem novo crédito de Gate.
