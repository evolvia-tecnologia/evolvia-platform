# Evolvia Master Codex

## Checkpoint de execução — 06/11/2026

Direção do fundador e contratos em [#571/6685989083](https://github.com/evolvia-tecnologia/evolvia-platform/issues/571#issuecomment-6685989083). Work integra e mantém #637; Codex mantém compra múltipla/reembolso/confirmação/fiscal; Claude mantém #642 e operação/CAEX; Gemini recebe cartas/comunicações e #610 mediante ACK; Cursor retomado explicitamente para etiquetas #614→#647 e Sports #621→#648, em sessão contratada sem Cloud/cobrança nova. Um dono por conjunto de paths, transferências com SHA/ACK, compartilhados serializados. Esta direção substitui as atribuições históricas incompatíveis abaixo.

A meta é concluir o desenvolvimento hoje; o prazo não substitui segurança, revisão, CI ou comprovação funcional. Gates mantêm os 93 critérios, os 11 pesos e os marcos I/T/D/F. Refinamentos de inscrição/etiquetas não criam unidade nova. Não se declara 100% por agenda, branch ou comentário.

### Entrega integrada: inscrição e telefone

- [#637](https://github.com/evolvia-tecnologia/evolvia-platform/pull/637) integrado por squash em `4cf655b51af6480d877d7c331e668f5cd899da43`, HEAD validado `9cb2940ffbe75e62e54edf76d4451d8c428a24f6`. Árvores do HEAD e squash idênticas: `4b5e4d0bab8845e19bb23710527f925daee7e22d`.
- Sugestão apenas do primeiro nome, preservando edição manual e branco; área +1 visível/editável, troca de DDI e colagem sem duplicação de dígitos. Cadastros históricos não são reescritos.
- [CI 42229498792](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42229498792) completo aplicável verde: 948 testes da API, 729 da Web, PostgreSQL, migrations e fluxo funcional, hidratação/acessibilidade runtime e ARM64 Web; ARM64 API não aplicável/skipped por imagem não alterada. 31 testes focais locais e typecheck do componente/helper aprovados. Nova suíte React detectou 5 falhas antes do ajuste e passou 6/6 depois.
- Revisão independente Codex do delta final sem novos bloqueadores; thread histórica resolvida, base atual e merge com SHA esperado, sem bypass. A revisão Gemini antiga não foi apresentada como revisão deste HEAD.
- Publicação pós-merge [42231851766/job127946099903](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42231851766/job/127946099903) comprovou `develop@4cf655b5`, containers saudáveis, API/PostgreSQL prontos e HTTPS acessível em 06/11 às 11h28 São Paulo. A verificação pública falhou depois por `Server: nginx/1.24.0` e pelo alias `dev` com certificado/redirect divergentes. Isso comprova implantação, sem aprovar o gate público nem a jornada autenticada. Navegador local indisponível por download do Chromium inválido; testes React não equivalem a homologação autenticada/mobile.
- Rollback por reversão da aplicação, sem migration ou remoção de dados. Nenhum critério novo: medição histórica 92,9% / 70,0%, 85/93 e 0/11 permanece até nova conciliação canônica.

### Próximos bloqueios concretos

- #471: reserva em evento PAID aceita entrada de valor zero, mas checkout conjunto rejeita a entrada após ocupar vaga; achado em [6686774524](https://github.com/evolvia-tecnologia/evolvia-platform/pull/471#issuecomment-6686774524). Correção e negativas sem escrita exigidas, preservando FREE e fluxo individual. Codex mantém ownership.
- #647: achado da prévia `fitWarning` oculta corrigido em `828f40c1`; HEAD final `7dd48da9` integrado por squash em `develop@49aeae51`, com CI aplicável completo verde, zero threads e revisão independente final sem bloqueadores. A prévia ilegível aparece em tela e não entra na impressão; publicação e jornada física permanecem separadas. Registro: [6686639676](https://github.com/evolvia-tecnologia/evolvia-platform/pull/647#issuecomment-6686639676). #648 Sports ainda não comprova jornada completa de atleta/estoque.
- #642: Claude mantém UI/HTTP/concorrência/impressão. Três relações inversas já presentes no schema do `59801816`, blob `6378807a`; não repetir o bloqueio histórico resolvido.
- Reembolso exige operação financeira persistida/compensação; NFS-e exige API/persistência/adaptador e homologação municipal/provedor. Confirmação de inscrição já integrada não deve ser reimplementada; entrega externa continua sem prova/autorização nesta execução.


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

## Snapshot histórico — 11/10/2026

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


## MC-2026-10-22-01 — Publicação de G11.1 e evidências do fluxo show

- Data: 22/10/2026, 10h10 São Paulo. Responsável: Orquestrador Cursor.
- Implementação **89,6%**; conclusão comprovada **67,5%**; **82/93** unidades integradas; **0/11 Gates encerrados**.
- Fonte integrada e publicada `develop@2f6087bc99c99a256248a0b7343fc8b63fbbd017`. [Pós-merge 39707553563](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39707553563) / job `119594505568`: Commit 02:01:06 UTC e readiness API/PostgreSQL/HTTPS200 02:01:08 UTC. **G11.1 recebe D; F pendente.** Gate público falhou por Nginx/alias.
- #584/#578 refinam G1.3/G1.6/G1.7/G1.8/G2.1/G2.4/G2.6 sem nova unidade. G5.7 já tinha D em `c92853d6`. #586 documental; #587/#582/#579–#583/#568 sem crédito.
- Impacto IICEE: separa publicação comprovada de aceite humano; não pontua rascunho.
- Segurança/LGPD: Asaas stub isolado de production; sem secrets neste corte.
- Rollback: revert documental; a aplicação publicada permanece até revert de deploy.
- `main` e produção sem promoção.

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



## Patrimônio de decisão — checkpoint 14/11/2026, 19h BRT (proposta)

Área Master: o proprietário da **plataforma** administra eventos de qualquer organização mediante autenticação forte, suporte auditável, suspensão reversível com status anterior persistido, reativação e exclusão lógica com preservação de provas/obrigações legais. Ações financeiras e comunicações reais exigem autorização separada. Papel OWNER organizacional não implica papel Master; concessões de equipe por escopo/ação/prazo, sem autoelevação. Relatórios reutilizam o escopo autorizado pelo guard e filtros apenas restringem. #675 ainda não fornece UI operacional e está bloqueado por CI/PR contra main. #676 exige correção de isolamento. Nenhuma dessas decisões representa implementação aceita ou deploy. Evidências e risco detalhados em [CLOSING_2026-11-14_19H.md](./CLOSING_2026-11-14_19H.md); manter decisões aprovadas no registro DECISIONS mediante revisão específica.
