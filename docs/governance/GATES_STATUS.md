## Homologação — verificação de 26/11/2026

O último deploy bem-sucedido da `develop` publicou `ab02d8d859f29061ff45ec0ebfc27f17aa0ffe3a` em 24/11 às 02h54 UTC. O job confirmou HTTPS 200, disponibilidade da API e do PostgreSQL e ocultação da versão do Nginx. [Log de publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/45313903366/job/138180865264).

Em 26/11, a API pública respondeu com status `ready`, banco `ok` e versão `0.2.0-alpha.3`. A identificação do SHA pelo serviço em execução, a configuração efetiva de WebAuthn e o aceite autenticado por perfil seguem pendentes. A regressão pública em navegador percorreu início, catálogo e página do evento corporativo fictício. O roteiro para confirmar as imagens ativas e as variáveis no host está na [#571](https://github.com/evolvia-tecnologia/evolvia-platform/issues/571#issuecomment-7200660810). Os indicadores por critério permanecem no último fechamento EVO-018. Os registros datados abaixo preservam o histórico.


## Reconciliação G5.8 I/T — 23/11/2026 (PR #708 integrada)

Implementação **96,9%**; conclusão comprovada **72,3%**; **89/93** unidades integradas; **0/11 Gates encerrados**.

Fonte canônica da matriz: `393ab9930d205dcb592cbf283b55c3fd1d2d86e3`. G5.8 I/T comprovados pela #610 e #708, CI #45105953160 COMPLETED/SUCCESS (qualidade, PostgreSQL e ARM64). **D/F continuam falsos**: não há evidência de envio externo autorizado, SHA implantado ou aceite humano. A PR #702 foi fechada sem merge como superada. G2.11, G2.13, G2.14 e G6.8 permanecem pendentes de implementação completa. O gate público Nginx #108 continua externo. Não inferir prontidão de produção. Registros históricos abaixo permanecem como histórico.

| 5 | Submissão pelo autor | 100,0% | 71,9% | 23/32 |

## Reconciliação pós-merge #518 — 22/11/2026 (G7.4 somente I/T)

Implementação **95,8%**; conclusão comprovada **71,7%**; **88/93** unidades integradas; **0/11 Gates encerrados**.

Fonte canônica da matriz: `865bf03f2315642612c1e251559701bca87a993e`. A PR #518 foi integrada em `develop@e46268121378b77343231366922fd6a6b723830d`; os testes PostgreSQL e CI foram comprovados. G7.4: I=true, T=true, D=false, F=false. A publicação teve gate público reprovado pelo cabeçalho Nginx (#108); faltam correção autorizada, correlação do SHA servido, jornada autenticada e aceite humano. Os registros históricos abaixo são preservados.

| 7 | Decisão científica | 100,0% | 70,8% | 17/24 |


# Estado dos Gates

## Conferência de 21/11/2026

No `develop` publicado em `8f6409b0`, a matriz registra 87 critérios com integração, testes e publicação e um critério com aceite funcional. A média dos 11 Gates continua em 94,3% de implementação e 71,0% de conclusão I/T/D/F. As linhas G2.11, G2.13, G2.14, G5.8, G6.8 e G7.4 agora identificam as entregas parciais e os responsáveis pela próxima prova. A atualização de G1.6 inclui o ensaio público em três perfis. [Evidência da publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/44855700901/job/136701219650).

## Reconferência dos indicadores — 20/11/2026, após integrar #680

**Implementação 94,3%**; **conclusão comprovada 71,0%**; **87/93** critérios integrados; **0/11 Gates encerrados**. Reconferidos conforme EVO-018 com 11 Gates de peso igual, sem recalcular por quantidade de PRs. Os dois critérios acrescidos desde a matriz de 27/10 são **G2.10** (compra múltipla, #471) e **G10.10** (permissões granulares do operador, #642), com evidências I/T/D já documentadas nesta PR.

Em 20/11 às 23h40 BRT, a homologação publicou `8f6409b0`. A raiz HTTPS respondeu 200 e a API confirmou prontidão com PostgreSQL. O cabeçalho Server ainda revelou a versão do Nginx. A correção depende do administrador do host na #108. O aceite autenticado por perfil continua pendente. [Log da publicação e da verificação pública](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/44855700901/job/136701219650).

**Novo HEAD verificado:** `develop@8f6409b02178b795359ba96ad1e46f03514e3550` (após squash da [#680](https://github.com/evolvia-tecnologia/evolvia-platform/pull/680), em 20/11 São Paulo). A #680 melhora justificativas e a segurança da interface dos reembolsos, porém declara expressamente **“Não conclui G2.11”**. A [#694](https://github.com/evolvia-tecnologia/evolvia-platform/pull/694), também integrada, dispõe de simulação de estorno com `simulated:true` e `moneyReturned:false`; falta processamento/compensação financeira externa com prova sandbox, conforme contrato [#679](https://github.com/evolvia-tecnologia/evolvia-platform/issues/679). Portanto, **G2.11 permanece sem novo marco I/T/D/F**. As demais integrações #675 (Área Master), #678 (status de eventos), #693 (preparação financeira), #696 (correção de dependência) e #689 (infraestrutura) não acrescentam critérios novos do baseline de 93; aprimoram funcionalidades já contabilizadas ou fora do escopo da matriz.

Os seis critérios sem I/T/D/F continuam: G2.11, G2.13, G2.14, G5.8, G6.8 e G7.4. G2.13 exige entrega verificável, G2.14 emissão fiscal (rascunho não basta), e G5.8/G6.8/G7.4 dependem de fluxo completo/aceite da comunicação científica. O índice não é “prontidão de produção”; homologação, acesso real e Gate público Nginx #108 permanecem independentes. **Nenhuma fonte verificável da EVO-018 nesta conferência sustenta percentual acima de 95%.** Preservar esse valor apenas como hipótese de outra métrica, não como avanço comprovado.

**Estado do registro:** esta reconciliação está na PR documental #677, ainda pendente de integração em `develop`. A fonte-base das evidências para os dois novos critérios é o SHA `865bf03f2315642612c1e251559701bca87a993e`; o SHA novo acima identifica a leitura de continuidade, não atesta que todas as 93 jornadas foram homologadas nesse commit.

## Evidência conferida em 20/11

A publicação de `6ca50702` registrou API e PostgreSQL prontos e HTTPS 200 às 22h25 de 19/11 em São Paulo. A versão exposta do Nginx manteve a #108 aberta. Esse deploy não acrescenta aceite funcional aos critérios. [Job de publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/44651288686/job/136012440839).


## Publicação da Área Master em 19/11

O gateway registrou `b642c2660460f00c4c5af070bebae518f187146b`, com #675 integrada. Às 15h09 de São Paulo o domínio respondeu HTTPS 200, a API e o PostgreSQL estavam prontos e HTTP redirecionou com 308. O gate público reprovou pela versão do Nginx no cabeçalho Server. O acesso autenticado do proprietário continua pendente da #690 e da validação WebAuthn. Os marcos e percentuais da matriz permanecem os da reconciliação abaixo. [Job de publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/44581399025/job/135771644292).


## Reconciliação de 19/11/2026

Implementação **94,3%**; conclusão comprovada **71,0%**; **87/93** unidades integradas; **0/11 Gates encerrados**.

Base integrada `865bf03f2315642612c1e251559701bca87a993e`. G2.10 e G10.10 têm integração, CI e publicação demonstrados. O aceite autenticado segue pendente. Ambos os jobs registraram a prontidão da API e do banco e depois reprovaram o cabeçalho Server. [Compra múltipla](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42683330025/job/129390430705) · [Permissões de operador](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/42715129263/job/129500945850).

| Gate | Nome | Implementação | Conclusão | Marcos |
| --- | --- | --- | --- | --- |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 78,6% | 58,9% | 33/56 |
| 3 | Área reservada do inscrito | 100,0% | 75,0% | 24/32 |
| 4 | Configuração científica | 100,0% | 75,0% | 24/32 |
| 5 | Submissão pelo autor | 87,5% | 65,6% | 21/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 100,0% | 75,0% | 39/52 |
| 11 | Pós-evento | 100,0% | 75,0% | 18/24 |


## Evidência de publicação em 17/11/2026

O [job de publicação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/44146606412/job/134271238197) registrou implantação de `c4512c2d`, prontidão e HTTPS 200. O gate público reprovou por exposição da versão do proxy. O redirecionamento HTTP 308 para o domínio canônico passou. A matriz conserva o histórico do cálculo abaixo. O campo `lastConfirmedDeployment` registra a implantação anunciada pelo gateway. A identificação independente do SHA servido e o aceite funcional seguem pendentes.

## Reconciliação vigente — 27/10/2026, 10h11 (São Paulo)

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

## Reconciliação vigente — 26/10/2026

**91,4% implementação; 68,8% conclusão comprovada; 84/93; 0/11 Gates.** Fórmulas e marcos por critério abaixo preservados. Fonte consolidada `fcb089cd0aecd4394e57a4c563ed8b01f3caa14d`, CI40257810122 e publicação40258960289/job121369593123: Commit26/10 às02:38:31UTC, readinessAPI/PostgreSQL/HTTPS200 às02:38:33UTC. O gate público falhou depois por Nginx/TLS; sem novo aceite. Evidências e prioridade atual em [MasterCodex](EVOLVIA_MASTER_CODEX.md).

#549/ac376be3 integra pacotes idempotentes/verso/horas de participação; #600/fcb089cd integra seleção de autores correspondentes. Não concluem G11.2 nem avisos/distribuição/cartas com entrega real. Extensão dos papéis científicos é candidata; I/T/D/F permanecem inalterados. Foco aprovado: Comunicação científica G5.8/G6.8/G7.4 e certificados G11.2, somente Codex implementando e Gemini revisando; sem Cursor/Composer.

## Histórico preservado

# Estado dos Gates — 25/10/2026

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
| G1.3 — Identidade visual, mídias e editor de divulgação | Integrado | ✓ | ✓ | ✓ | — | #375/#398; apps/web/components/publication-editor.tsx; #584 publication-media-editor aguarda onChanged após POST/DELETE. Próximo: Upload e reflow autenticados no SHA implantado |
| G1.4 — Checklist e transição de publicação | Integrado | ✓ | ✓ | ✓ | — | apps/api/src/event-publication/event-publication.service.ts; scripts/ci-smoke-v02.mjs Próximo: Publicar e despublicar fixture autorizada no ambiente |
| G1.5 — Prévia privada sem publicar | Integrado | ✓ | ✓ | ✓ | — | apps/api/src/event-publication/event-publication-preview.service.ts; testes de preview Próximo: Validar ACL e prévia em homologação |
| G1.6 — Página pública, URL, localização e ações por perfil | Integrado | ✓ | ✓ | ✓ | — | #388/#402; PR #405 comentário 04/10 18:31 UTC; ensaio público da feira; #584 alinha CTA/ingresso: ENTERTAINMENT ou (OTHER/null + Festival/Show); NON_TICKET_PROFILES nunca ingresso. Em 21/11 o catálogo filtrado levou a páginas HTTPS 200 de corporativo, feira e científico, com local e links de participação. As consultas de entretenimento, social e outro perfil não forneceram amostra de evento para o mesmo ensaio. Próximo: Work deve completar as ações por perfil e o aceite funcional em homologação. |
| G1.7 — Vitrine e catálogo de publicados | Integrado | ✓ | ✓ | ✓ | ✓ | #403; PR #405 comentário 04/10 18:31 UTC; catálogo recarregado com dois eventos; #481/#495 correções de hidratação; #584 HTML inicial idêntico CURRENT/PAST/ALL, currentSearch no servidor sem useSearchParams/Suspense; prova /eventos × 1366/768/390/320. F histórico, sem novo aceite Próximo: Prova de listagem no SHA implantado; sem novo F |
| G1.8 — Ajuda, documentos e preferências de acessibilidade | Integrado | ✓ | ✓ | ✓ | — | #399/#403; runtime, espaçamento e árvore acessível CI; #461 tipos na EVA; #578 prova pública SC 1.4.12 integrada; #584 hidratação sem React 418 em PAST 320. #494/#498 ainda não integrados Próximo: WCAG humana completa e leitor de tela ainda pendentes |

## Gate 2 — Inscrição

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G2.1 — Categorias e lotes | Integrado | ✓ | ✓ | ✓ | — | #323/#325/#387; registration-commercial; #584 oculta lote R$0 só em entretenimento pago quando existe lote pago; científico/corporativo/feira/comunidade + Festival mantêm cortesia Próximo: Testar abertura e encerramento nos seis perfis |
| G2.2 — Cupons, convites e cortesias básicos | Integrado | ✓ | ✓ | ✓ | — | #327; registration-benefits Próximo: Teste de uso e concorrência em homologação |
| G2.3 — Ficha configurável e consentimentos | Integrado | ✓ | ✓ | ✓ | — | registration-forms; #396 Próximo: Preencher por categoria e comprovar aceite de versão |
| G2.4 — Reserva pública e capacidade | Integrado | ✓ | ✓ | ✓ | — | #329; registration-reservations; #584 isPublicTicketOffer + NON_TICKET_PROFILES em registration-reservations-policy Próximo: Fixture completa com expiração e repetição no SHA implantado |
| G2.5 — Confirmação de inscrição gratuita | Integrado | ✓ | ✓ | ✓ | — | #329/#348; participant-status Próximo: Teste autenticado e credencial |
| G2.6 — Checkout Asaas e webhook idempotente | Integrado | ✓ | ✓ | ✓ | — | #331; asaas-checkout; CI funcional; #584 isAsaasStubMode nunca em production; isAsaasCheckoutReady exige token não sentinela; publicCheckoutNextStep({ ticketEvent }) Próximo: Sandbox do provedor, webhooks e conciliação; sem cobrança real |
| G2.7 — Comprovante de categoria antes do pagamento e termo PDF | Integrado | ✓ | ✓ | ✓ | — | #396; registration-category-proof/terms-document Próximo: Upload, aprovação, recusa e concorrência no navegador |
| G2.8 — Participante/pagador/tomador e comprovante de pagamento | Integrado | ✓ | ✓ | ✓ | — | #358/#360/#361/#363 Próximo: Fluxo financeiro em sandbox; não equivale a NFS-e |
| G2.9 — Fila de espera por lote | Integrado | ✓ | ✓ | ✓ | — | #468 integrado em e8aac41; UI/API/migration da fila; PostgreSQL concorrência no CI 37607144430; fonte atual CI/deploy 37837951585 Próximo: Ensaiar no SHA implantado: FIFO, última vaga, expiração, isolamento e aceite; sem aviso por e-mail. Reserva histórica limita reentrada. |
| G2.10 — Compra com várias entradas e ficha por comprador | Pendente | — | — | — | — | operacao-do-evento.md, fatia 10 Próximo: Implementar sem duplicar identidade |
| G2.11 — Regra de reembolso visível e fluxo correspondente | Entrega parcial publicada | — | — | — | — | Reembolso individual e de compra múltipla preparado na #693. A #694 persiste a cobrança sandbox e a #680 integra a interface e valida a justificativa. Publicação 8f6409b0 no job 136701219650. A simulação registra moneyReturned=false. Próximo: Codex deve comprovar restituição integral e parcial no provedor sandbox, conciliação e replay idempotente. |
| G2.12 — Troca de categoria de inscrição paga | Integrado | ✓ | ✓ | ✓ | — | #58986d66596; CI1762 e publicação da289784/job121056008408. Próximo: ensaio autenticado; diferenças de preço bloqueadas |
| G2.13 — E-mail transacional entregue com confirmação/credencial | Entrega parcial integrada | — | — | — | — | A #579 integrou a retomada da confirmação após a configuração do canal (0213c9e3). A regressão com transporte simulado está registrada na #571, comentário 7056044955. Próximo: Codex deve comprovar o recebimento da confirmação e da credencial por destinatário de teste autorizado. |
| G2.14 — Emissão fiscal NFS-e | Prévia fiscal em revisão | — | — | — | — | A #613 em e4deefb6 protege a escrita do rascunho e registra auditoria. O candidato inclui teste PostgreSQL. Onze discussões aguardavam decisão independente na consulta. Próximo: Codex e revisor fiscal devem fechar a revisão da prévia. A emissão exige município e conta sandbox autorizada. |

## Gate 3 — Área reservada do inscrito

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G3.1 — Conta e entrada por e-mail/senha | Integrado | ✓ | ✓ | ✓ | — | #335/#346/#350/#355; participant-dashboard Próximo: Confirmar e-mail e acessar com identidade válida |
| G3.2 — Meus eventos sem memorizar o evento | Integrado | ✓ | ✓ | ✓ | — | #346; participant-dashboard.service.ts Próximo: Listagem e isolamento com contas distintas |
| G3.3 — Vinculação de inscrição por documento/e-mail com posse de conta | Integrado | ✓ | ✓ | ✓ | — | #355; participant-dashboard.controller.ts Próximo: Vínculos positivos/negativos em homologação |
| G3.4 — Consulta da inscrição, pagamento e QR | Integrado | ✓ | ✓ | ✓ | — | #338/#340; participant-area.tsx Próximo: Status após webhook e uso do QR |
| G3.5 — Correção controlada da ficha pelo titular | Integrado | ✓ | ✓ | ✓ | — | #366; participant-registration-editor Próximo: Concorrência e campos bloqueados no navegador |
| G3.6 — Link de transmissão do evento para confirmado | Integrado | ✓ | ✓ | ✓ | — | #407; transmission Próximo: Confirmado acessa, pendente e público não recebem URL |
| G3.7 — Histórico por CPF/passaporte após troca de e-mail | Integrado | ✓ | ✓ | ✓ | — | #5886344d8d7; CI1759 e publicação descendente da289784/job121056008408. Próximo: jornada autenticada; aliases legados e canal externo pendentes |
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
| G4.8 — Blocos de resumo e janelas completas por modalidade | Integrado | ✓ | ✓ | ✓ | — | #565 integrado em f1a91f093d2bbb8fdbbf2b999c3d52feab627748; HEAD 77fdcfad5b7c982f0124d7bf06dc8a669a7b60d7; CI 38150531939 verde (Node22, PostgreSQL/migration, hidratação/acessibilidade runtime e ARM64); revisão Gemini sem achados abertos. Janelas e até quatro blocos por modalidade, round-trip de correção, validação unit-aware e preservação do PDF. Deploy do SHA badd9ff0 comprovado no run39375902865/job118476843359: Commit às 05:51:56 UTC e readiness API/PostgreSQL/HTTPS200 às 05:51:58 UTC em 20/10/2026; gate público falhou depois por Nginx/alias. Próximo: Ensaio autenticado desktop/mobile, duas organizações/eventos, teclado/leitor; aceite funcional pendente. |

## Gate 5 — Submissão pelo autor

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G5.1 — Área de envio vinculada à inscrição confirmada | Integrado | ✓ | ✓ | ✓ | — | #344/#348; scientific-author Próximo: Teste autor confirmado e não confirmado |
| G5.2 — Envio textual, modalidade, área e instituição do autor único | Integrado | ✓ | ✓ | ✓ | — | scientific-author-panel.tsx; #406 Próximo: Percorrer submissão real no navegador |
| G5.3 — Primeira versão, listagem e protocolo idempotente | Integrado | ✓ | ✓ | ✓ | — | scientific-author.service.ts; scientific-author-policy Próximo: Repetição de envio não duplica |
| G5.4 — Limites e validação no servidor | Integrado | ✓ | ✓ | ✓ | — | scientific-author-policy; #406 Próximo: Limites, modalidade desativada e prazo |
| G5.5 — Coautores, ordem, instituições e apresentador | Integrado | ✓ | ✓ | ✓ | — | #411/#445/#457; scientific-author.service.ts e scientific-author-panel.tsx Próximo: Ensaiar ordem, instituições, até dez coautores e apresentadores |
| G5.6 — Upload de PDF na submissão | Integrado | ✓ | ✓ | ✓ | — | #497 integrado em 041f83b4 (HEAD 2d139026); CI pós-merge 38001809029: qualidade/PostgreSQL/ARM64 verdes. Publicação job 114064573887, Commit 041f83b4 em 09/10 23:10:11UTC e readiness API/PostgreSQL às 23:10:13 UTC; gate público falha Nginx/alias. PDF privado por versão, contexto assíncrono/anexo e compensação cobertos. Sem aceite autenticado. Próximo: Ensaiar envio/download PDF privado com duas contas/eventos; não inferir F de mocks ou deploy. |
| G5.7 — Rascunho, correção e nova versão pelo autor | Integrado | ✓ | ✓ | ✓ | — | #567 integrado em fb8f991e5775de5e7810414f4484f4331cc28cbf; HEAD c45f4a7a3b902b5bb31754682b62a9aa9ff3a062; CI #1678/run39418005077 aprovado em qualidade, API/Web, PostgreSQL/fluxo funcional, migration idempotente, hidratação/acessibilidade runtime e ARM64 API/Web. Rascunhos persistentes, retomada/exclusão escopada, snapshots de autoria e trilha de versões; retry P2034 limitado na exclusão. Publicação do merge e aceite autenticado ainda sem comprovação. Deploy herdado comprovado no descendente c92853d6bcb463b1bbb24d3c40b933c53752ff34: run39705487242/job119587988438, Commit 22/10/2026 01:39:07 UTC, readiness API/PostgreSQL/HTTPS200 01:39:09 UTC. Compare GitHub ahead4/behind0 desde fb8f991e. Gate público falhou por Nginx/alias; F pendente. Próximo: Ensaiar salvar, retomar, excluir, submeter e corrigir com duas contas/eventos em desktop/mobile e teclado/leitor; aceite pendente. |
| G5.8 — Aviso ao autor após submissão/correção | Avisos em PR | — | — | — | — | A #610 em 6ba3ed58 implementa candidato para avisos ao autor com opt-in. O GitHub mantém a PR aberta. Próximo: Gemini deve revisar o delta atual e comprovar entrega autorizada, isolamento por evento e idempotência. |

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
| G6.8 — Avisos, distribuição assistida e operação em lote | Entrega parcial publicada | — | — | — | — | operação fatia 11/benchmark; #551/8bea955c integrado/publicado: distribuição assistida com cargas persistidas e locks, CI40466676636/89PG. Refinamento parcial não conclui o critério. Próximo: Gemini deve provar comunicação em lote com filtro, destinatário autorizado e prevenção de duplicatas. A distribuição assistida da #551 já está contabilizada como entrega parcial. |

## Gate 7 — Decisão científica

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G7.1 — Consolidação e quórum operacional | Integrado | ✓ | ✓ | ✓ | — | #421/#457; scientific-reviewer.service.ts; scientific-decision-quorum.test.mjs Próximo: Ensaiar quórum da versão atual; pareceres antigos não autorizam nova versão |
| G7.2 — Aceite, recusa e aceite com alteração | Integrado | ✓ | ✓ | ✓ | — | #411/#421; scientific-reviewer.service.ts Próximo: Ensaiar aceite, recusa e aceite com alteração com atores distintos |
| G7.3 — Resolução de divergência e intervenção do coordenador | Integrado | ✓ | ✓ | ✓ | — | #421; scientific-reviewer.service.ts; chair/identidade da comissão Próximo: Ensaiar coordenador autorizado e negativas da comissão |
| G7.4 — Carta de aceite e comunicação ao autor | Entrega parcial e PR aberta | — | — | — | — | Cartas configuráveis e consulta pelo autor constam da matriz. A #518 em 657191fc propõe registrar entrega na área do autor. Próximo: Gemini deve verificar decisão, destinatário, entrega e leitura da carta pelo autor em homologação. |
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
| G10.13 — Área do expositor/prestador e serviços | Integrado | ✓ | ✓ | ✓ | — | Central administrativa #490/#520/#527 preservada. Portal externo e CAEX #537 integrados em badd9ff097c7b3856a2f4141d39a5fccc19065d5; conta com e-mail confirmado e ACL por representante/empresa/evento/org; CI1670/run39373910161 aprovado em API/Web, ARM64 API/Web, PostgreSQL/fluxo funcional e migration idempotente; 13/13 threads resolvidas, Gemini sem novos bloqueios. Deploy do SHA badd9ff0 comprovado no run39375902865/job118476843359: Commit às 05:51:56 UTC e readiness API/PostgreSQL/HTTPS200 às 05:51:58 UTC em 20/10/2026; gate público falhou depois por Nginx/alias. Próximo: Ensaio autenticado desktop/mobile, duas organizações/eventos, teclado/leitor; aceite funcional pendente. |

## Gate 11 — Pós-evento

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G11.1 — Templates, tags e emissão de certificado por presença/papel | Integrado | ✓ | ✓ | ✓ | — | #548 integrado em develop@2f6087bc99c99a256248a0b7343fc8b63fbbd017; HEAD 0c58c0b055d1b2c1a3d57bb1b33778ae47c219ac; CI1722/run39705597229 success. Templates/tags e emissão sem taxa por atividade, trabalho aprovado, apresentação, convidado e avaliador; elegibilidade revalidada em transação Serializable, idempotência e recuperação GET após escrita. Publicação comprovada no run39707553563/job119594505568: Commit 2f6087bc às 02:01:06 UTC e readiness API/PostgreSQL/HTTPS200 às 02:01:08 UTC em 22/10/2026; gate público falhou depois por Nginx/alias. Sem F. Próximo: Ensaiar configuração, elegibilidade, emissão, segunda via, autenticidade, falha de atualização e isolamento com duas contas/orgs/eventos; aceite pendente. |
| G11.2 — Pacotes/lotes, verso e carga horária | Integrado | ✓ | ✓ | ✓ | — | #549/ac376be3 e #601/4337c99c: participação e cinco papéis científicos com pacotes/lotes auditáveis, verso e carga horária canônicos congelados, replay idempotente e PDF histórico. CI40272157015 do HEADe0fbd9fc: 892 API,632 Web,84 PostgreSQL, migration e ARM64; Gemini5647622754 triado, threads resolvidas. Publicação40273335894/job121414197364 comprovou Commit4337c99c em26/10/2026 às05:33:22UTC e readiness API/PostgreSQL/HTTPS200 às05:33:23UTC. Gate público falhou depois por Nginx/alias. I/T/D comprovados; F pendente. Próximo: Jornada autenticada com duas organizações/eventos, mobile320/390px, teclado, emissão/retry/download, fidelidade da impressão e aceite humano. Paginação do histórico é refinamento candidato separado, sem crédito por branch. |
| G11.3 — Download/segunda via e autenticidade | Integrado | ✓ | ✓ | ✓ | — | #522 integrado em c18fb511 após CI 38005789849 do HEAD 66d82138: 663 API / 466 Web, PostgreSQL/integração e ARM64 verdes. Threads Gemini satisfeitas. Segunda via idempotente e lote 40 com ACL por evento/organização; fonte Unicode embutida, paginação integral/Poppler; sem glifo retorna 422 sem auditoria. Publicação no job 114389232356 comprovou Commit c18fb511 em 11/10 04:37:37 UTC e readiness API/PostgreSQL às 04:37:39 UTC; gate público falhou depois por Nginx/alias. Sem F. Próximo: Comprovar publicação do SHA, jornada de download e negativos autenticados com duas contas/orgs/eventos; CJK exige fallback imprimível. |
| G11.4 — Avaliação do evento e exportação | Integrado | ✓ | ✓ | ✓ | — | #420/#452/#457; avaliação, resultados e CSV de comentários filtrados Próximo: Ensaiar resposta própria, pergunta/busca/paginação e exportação no evento |
| G11.5 — Relatórios consolidados de resultados e exportação | Integrado | ✓ | ✓ | ✓ | — | #525 integrado em db766978; CI pós-merge 38000947075 qualidade/PostgreSQL/ARM64 verdes. Publicação job 114060762594: Commit db766978 em 09/10 22:56:56UTC, readiness API/PostgreSQL às 22:56:58 UTC; gate público falha Nginx/alias. Visitas limitadas por processo, slugs inexistentes não ocupam cotas; vendas sem paidAt conciliam; CSV e métrica explícita. Sem aceite autenticado. Próximo: Ensaiar relatórios/exportação e isolamento entre duas organizações/eventos; limite por instância não é orçamento distribuído. |
| G11.6 — Encerramento, retenção e reutilização por clone seguro | Integrado | ✓ | ✓ | ✓ | — | #470 integrado em develop@42256f46 e publicado no conjunto develop@38bfc29e; clone seguro com ACL, isolamento org/evento, idempotência e exclusões operacionais. Próximo: ensaiar negativos com duas organizações/eventos. |

## Histórico preservado

[04/10/2026](history/GATES_STATUS_2026-10-04.json): 51,6% implementação / 39,0% conclusão. [07/10/2026](history/GATES_STATUS_2026-10-07.json): 76,5% / 57,7%. [20/10/2026](history/GATES_STATUS_2026-10-20.json): 88,1% / 66,1%. [21/10/2026](history/GATES_STATUS_2026-10-21.json): 89,6% / 67,1%. Denominador inalterado.


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



## Proposta de reconciliação — 14/11/2026, 19h BRT

A matriz JSON em `develop` permanece **sem alteração de critérios**: 85/93 integrados, 256/372 marcos I/T/D/F, **92,9% implementação** e **70,0% conclusão**, pesos iguais dos 11 Gates (0/11 encerrados). O último `sourceSha`/deploy comprovado no JSON é histórico; não confundir com `develop` atual. Os PRs #676/#675/#672/#491/#674 não foram integrados neste fechamento, portanto não há avanço demonstrável. A tabela completa por Gate, SHA/CI/threads, publicação, riscos e owners consta em [CLOSING_2026-11-14_19H.md](./CLOSING_2026-11-14_19H.md). Esta atualização documental depende de revisão e merge.
