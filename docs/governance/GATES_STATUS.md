# Evolvia — Reconciliação dos Gates 1–11

Linha de base **v1**, apurada em 04/10/2026. Responsável: Orquestrador Codex, por solicitação de Berg Martins. Escopo: sequência canônica de lançamento e requisitos operacionais aceitos; este índice não mede prazo, esforço restante, valuation nem toda a visão futura da empresa.

## Resultado executivo

- Conclusão comprovada: **39,0%**, média dos 11 Gates com peso igual.
- Implementação: **51,6%**, média da cobertura funcional integrada por Gate.
- Critérios funcionais: **93**, detalhados abaixo e em [GATES_STATUS.json](GATES_STATUS.json).
- Gates formalmente encerrados: **0/11**. Percentual não substitui Go/No-Go.
- Fonte técnica: `develop@b36829b29d5e543b3c0c7c936e9ab4a8ab52bd9a`.
- [CI integrado](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37224064537): qualidade, API 435/435, Web 260/260, ARM64 API/Web, migration idempotente e smoke geral/A4/A5/A6 aprovados. Estes são testes do pipeline existente, não auditoria integral de segurança nem E2E de todos os 93 critérios.
- [Deploy de homologação](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37224064537/job/111501624315): publicação concluída em 04/10 às 18:29 UTC (15:29 Brasília), com o SHA acima e readiness API/PostgreSQL.
- Run global vermelho: versão Nginx exposta. O diagnóstico do alias `dev` executou em modo informativo e retornou hostname mismatch; step verde não comprova certificado válido.
- Aceitação pública: **1/4 = 25%**, preservando o denominador anterior: principal HTTPS/readiness comprovado; ocultar versão Nginx, validar certificado/redirecionamento do alias e completar WCAG humana pendentes.

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

## Método reproduzível

Cada unidade funcional tem quatro marcos binários, com peso igual (25% da unidade):

1. **I — integração funcional:** tela + API + persistência aplicável no SHA fonte. Um enum, migration, documento, planejador local ou API sem a interface necessária não basta.
2. **T — testes do módulo/CI:** testes aplicáveis existentes passam no SHA fonte. Este marco comprova a validação disponível; não afirma cobertura integral nem ensaio operacional.
3. **D — deploy:** fonte integrada publicada em homologação e serviços prontos no mesmo SHA. Não implica que a função foi acionada no ambiente, nem que o Gate externo passou.
4. **F — ensaio funcional no ambiente:** cenário definido da unidade exercitado e registrado em homologação. Não implica WCAG humana completa, aprovação comercial ou Go de produção.

`conclusão do Gate = 100 × marcos comprovados / (4 × unidades do Gate)`.

`implementação do Gate = 100 × unidades com I / unidades do Gate`.

`global = média aritmética dos 11 percentuais de Gate`, calculada antes do arredondamento. Cada Gate pesa 1/11: escolha de transparência da linha de base, não estimativa de esforço. A alternativa por esforço exige estimativa formal ainda inexistente. Não somar os 11 percentuais, os recortes 11/11, 3/4, 5/5 ou o Gate público 1/4.

A linha de base é uma **classificação gerencial verificável instituída neste marco**, não uma métrica previamente aprovada de esforço. É adequada para acompanhar entregas e evidências; continua limitada pela decomposição em unidades funcionais. Os 93 itens explicitam esse denominador. Qualquer inclusão/retirada futura deve gerar versão nova com motivo, mantendo este snapshot. Os antigos 28%, 32% e estimativas por Gate não têm o mesmo método/escopo e não permitem calcular aumento ou regressão em pontos percentuais.

Zero significa nenhuma unidade funcional do Gate comprovada por este método. Não significa ausência de especificação, modelo ou trabalho em branch: #23 e estruturas de decisão científica existem, mas não constituem jornada integrada; certificado e ePoster têm direção/configuração, sem engine final operável. O teto pós-aceite do ePoster é o único item pontuado no Gate 8.

O único F registrado no Gate 1 provêm do ensaio público relatado no [PR #405](https://github.com/evolvia-tecnologia/evolvia-platform/pull/405), comentário final de 04/10/2026 18:31 UTC. Limita-se ao catálogo. A página pública foi aberta, mas o ensaio não comprova integralmente localização e ações por perfil. Este trabalho não repetiu ensaios autenticados, pagamentos, impressão física ou leitor de tela. Todos os outros F permanecem falsos.

## Merges reconciliados

| PR | Resultado | Merge SHA |
| --- | --- | --- |
| [#392](https://github.com/evolvia-tecnologia/evolvia-platform/pull/392) | Padronizar o caminho do evento em todas as telas do painel | `0dcc079646cdd583f3404eead78ce9812ee1bcc3` |
| [#395](https://github.com/evolvia-tecnologia/evolvia-platform/pull/395) | Portaria de credenciamento e controle de acesso | `3220e4db9a3bfbaac18abfd384454c4be1aa2ea2` |
| [#396](https://github.com/evolvia-tecnologia/evolvia-platform/pull/396) | PDF dos termos no aceite da ficha de inscrição | `050db4de90b9cd873ef910eedf5f87d52f1d9cc9` |
| [#397](https://github.com/evolvia-tecnologia/evolvia-platform/pull/397) | Fundação de API, webhooks e presença em sites | `1fae7faea01a9dbc37967160c270e02c725ef46c` |
| [#398](https://github.com/evolvia-tecnologia/evolvia-platform/pull/398) | Completar correções do organizador na divulgação, inscrições e página pública | `ac12084ab571308cd06195b1d1054b6e728946a0` |
| [#399](https://github.com/evolvia-tecnologia/evolvia-platform/pull/399) | Ajustes de acessibilidade em toda a plataforma | `f094d0c4e6488cf0936c0823b803ab2abf829c32` |
| [#400](https://github.com/evolvia-tecnologia/evolvia-platform/pull/400) | Operação de show: equipe, relatórios e API de catracas | `bc3199eed25c472ec3636ee4ffc24dbed5c8afc3` |
| [#401](https://github.com/evolvia-tecnologia/evolvia-platform/pull/401) | Relatório de presenças para evento corporativo e demais eventos | `ee7db457d9641b6141e6265e5dfef30fedfb376f` |
| [#402](https://github.com/evolvia-tecnologia/evolvia-platform/pull/402) | Completar a página publicada com Waze, telefone e compra | `2d49757ef58caf5ff7409e2f2ef8d48410aa5266` |
| [#403](https://github.com/evolvia-tecnologia/evolvia-platform/pull/403) | Corrigir a vitrine pública e listar eventos publicados | `9fd1aa2b0915519e79f6e0428b950066c17904e6` |
| [#404](https://github.com/evolvia-tecnologia/evolvia-platform/pull/404) | Limitar tentativas de acesso e fixar a sessão HS256 | `168afe8381a417cc7cf0e7bc31ed00199f682a14` |
| [#405](https://github.com/evolvia-tecnologia/evolvia-platform/pull/405) | Consolidar operação, merges de outubro e bloqueadores de homologação | `b36829b29d5e543b3c0c7c936e9ab4a8ab52bd9a` |
| [#406](https://github.com/evolvia-tecnologia/evolvia-platform/pull/406) | Gravar as configurações científicas que ainda faltavam | `86ed34a66bc9408672a80a5236d6b473c4f285c0` |
| [#407](https://github.com/evolvia-tecnologia/evolvia-platform/pull/407) | Link de transmissão para o inscrito e número de inscrição no totem | `9d9e213b148347698e4db9ddab5be22408917c37` |

#393/#394 não estão incluídos nessa sequência: números de PR não formam uma faixa necessariamente integrada. A leva original é #392 e #395–#404, **11/11**. A nova leva #405–#408 é **3/4**. #405 é consolidação documental: nenhum ponto funcional adicional foi atribuído somente por seu merge.

## Critérios e evidências

Legenda: ✓ comprovado; — sem prova suficiente. I/T/D/F são marcos, não permissões de produção. Itens parciais são descritos na evidência/próxima ação e não ganham integração completa.

### Gate 1 — Divulgação do evento

**78,1% (25/32)**; implementação 100,0%. Dependência funcional: fundação e identidade da organização. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G1.1 | Fundação do evento e wizard persistente | ✓ | ✓ | ✓ | — | apps/api/src/event-wizard.service.ts; #380. Próxima prova: Teste autenticado da criação nos seis perfis. |
| G1.2 | Perfis, capabilities e painel único | ✓ | ✓ | ✓ | — | apps/api/src/event-integrations.controller.ts; #392. Próxima prova: Troca de evento e estado residual em homologação. |
| G1.3 | Identidade visual, mídias e editor de divulgação | ✓ | ✓ | ✓ | — | #375/#398; apps/web/components/publication-editor.tsx. Próxima prova: Upload e reflow autenticados. |
| G1.4 | Checklist e transição de publicação | ✓ | ✓ | ✓ | — | apps/api/src/event-publication/event-publication.service.ts; scripts/ci-smoke-v02.mjs. Próxima prova: Publicar e despublicar fixture autorizada no ambiente. |
| G1.5 | Prévia privada sem publicar | ✓ | ✓ | ✓ | — | apps/api/src/event-publication/event-publication-preview.service.ts; testes de preview. Próxima prova: Validar ACL e prévia em homologação. |
| G1.6 | Página pública, URL, localização e ações por perfil | ✓ | ✓ | ✓ | — | #388/#402; PR #405 comentário 04/10 18:31 UTC; ensaio público da feira. Próxima prova: Ensaio público parcial de abertura; localização e ações por perfil ainda não foram integralmente exercitadas. |
| G1.7 | Vitrine e catálogo de publicados | ✓ | ✓ | ✓ | ✓ | #403; PR #405 comentário 04/10 18:31 UTC; catálogo recarregado com dois eventos. Próxima prova: Prova de listagem no SHA implantado. |
| G1.8 | Ajuda, documentos e preferências de acessibilidade | ✓ | ✓ | ✓ | — | #399/#403; runtime, espaçamento e árvore acessível CI. Próxima prova: WCAG humana completa e leitor de tela ainda pendentes. |

### Gate 2 — Inscrição

**42,9% (24/56)**; implementação 57,1%. Dependência funcional: Gate 1 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G2.1 | Categorias e lotes | ✓ | ✓ | ✓ | — | #323/#325/#387; registration-commercial. Próxima prova: Testar abertura e encerramento. |
| G2.2 | Cupons, convites e cortesias básicos | ✓ | ✓ | ✓ | — | #327; registration-benefits. Próxima prova: Teste de uso e concorrência em homologação. |
| G2.3 | Ficha configurável e consentimentos | ✓ | ✓ | ✓ | — | registration-forms; #396. Próxima prova: Preencher por categoria e comprovar aceite de versão. |
| G2.4 | Reserva pública e capacidade | ✓ | ✓ | ✓ | — | #329; registration-reservations. Próxima prova: Fixture completa com expiração e repetição. |
| G2.5 | Confirmação de inscrição gratuita | ✓ | ✓ | ✓ | — | #329/#348; participant-status. Próxima prova: Teste autenticado e credencial. |
| G2.6 | Checkout Asaas e webhook idempotente | ✓ | ✓ | ✓ | — | #331; asaas-checkout; CI funcional. Próxima prova: Sandbox do provedor, webhooks e conciliação; sem cobrança real. |
| G2.7 | Comprovante de categoria antes do pagamento e termo PDF | ✓ | ✓ | ✓ | — | #396; registration-category-proof/terms-document. Próxima prova: Upload, aprovação, recusa e concorrência no navegador. |
| G2.8 | Participante/pagador/tomador e comprovante de pagamento | ✓ | ✓ | ✓ | — | #358/#360/#361/#363. Próxima prova: Fluxo financeiro em sandbox; não equivale a NFS-e. |
| G2.9 | Fila de espera por lote | — | — | — | — | operacao-do-evento.md, fatia 10. Próxima prova: Implementar tela/API/banco e testes. |
| G2.10 | Compra com várias entradas e ficha por comprador | — | — | — | — | operacao-do-evento.md, fatia 10. Próxima prova: Implementar sem duplicar identidade. |
| G2.11 | Regra de reembolso visível e fluxo correspondente | — | — | — | — | operacao-do-evento.md, fatia 14. Próxima prova: Implementar política e compensação explícita. |
| G2.12 | Troca de categoria de inscrição paga | — | — | — | — | operacao-do-evento.md, fatia 8. Próxima prova: Preço equivalente e auditoria; diferenças bloqueadas. |
| G2.13 | E-mail transacional entregue com confirmação/credencial | — | — | — | — | #376; envio real ainda sem evidência conclusiva. Próxima prova: Provar entrega, repetição/falha e privacidade. |
| G2.14 | Emissão fiscal NFS-e | — | — | — | — | BACKLOG.md; responsável/comprovante não emite nota. Próxima prova: Adaptador e homologação fiscal próprios. |

### Gate 3 — Área reservada do inscrito

**56,3% (18/32)**; implementação 75,0%. Dependência funcional: Gate 2 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G3.1 | Conta e entrada por e-mail/senha | ✓ | ✓ | ✓ | — | #335/#346/#350/#355; participant-dashboard. Próxima prova: Confirmar e-mail e acessar com identidade válida. |
| G3.2 | Meus eventos sem memorizar o evento | ✓ | ✓ | ✓ | — | #346; participant-dashboard.service.ts. Próxima prova: Listagem e isolamento com contas distintas. |
| G3.3 | Vinculação de inscrição por documento/e-mail com posse de conta | ✓ | ✓ | ✓ | — | #355; participant-dashboard.controller.ts. Próxima prova: Vínculos positivos/negativos em homologação. |
| G3.4 | Consulta da inscrição, pagamento e QR | ✓ | ✓ | ✓ | — | #338/#340; participant-area.tsx. Próxima prova: Status após webhook e uso do QR. |
| G3.5 | Correção controlada da ficha pelo titular | ✓ | ✓ | ✓ | — | #366; participant-registration-editor. Próxima prova: Concorrência e campos bloqueados no navegador. |
| G3.6 | Link de transmissão do evento para confirmado | ✓ | ✓ | ✓ | — | #407; transmission. Próxima prova: Confirmado acessa, pendente e público não recebem URL. |
| G3.7 | Histórico por CPF/passaporte após troca de e-mail | — | — | — | — | EVO-016; operação fatia 1. Próxima prova: Recuperação com vínculo verificado e sem revelar histórico. |
| G3.8 | Agenda própria e inscrição nas atividades | — | — | — | — | operação fatias 5/12. Próxima prova: Implementar seleção, conflitos e agenda pessoal. |

### Gate 4 — Configuração científica

**65,6% (21/32)**; implementação 87,5%. Dependência funcional: Gate 3 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G4.1 | Central científica e capabilities | ✓ | ✓ | ✓ | — | docs/cycle2-scientific-central.md; scientific-event-central. Próxima prova: Validar perfil, estado e comportamento após publicar. |
| G4.2 | Áreas, subáreas e taxonomia | ✓ | ✓ | ✓ | — | scientific-structure; CI A6. Próxima prova: Teste do congresso com áreas e subáreas. |
| G4.3 | Modalidades e formas de apresentação | ✓ | ✓ | ✓ | — | scientific-submissions; #406. Próxima prova: Oral/pôster e chaves submissão/avaliação. |
| G4.4 | Título, palavras-chave e limites por autor | ✓ | ✓ | ✓ | — | scientific-submissions.config; #406. Próxima prova: 180 caracteres e até 3 trabalhos no evento de teste. |
| G4.5 | Resumo, contagem e campos científicos opcionais | ✓ | ✓ | ✓ | — | #406; scientific-author-policy. Próxima prova: 2800 caracteres, alternativas e limites. |
| G4.6 | Regras de autoria, instituição e apresentadores | ✓ | ✓ | ✓ | — | scientific-submissions.config; #406. Próxima prova: Configuração persistida; não comprova envio de coautores. |
| G4.7 | Modo cego, estilo de nota, teto da banca e coordenador | ✓ | ✓ | ✓ | — | #406; scientific-review-policy. Próxima prova: Salvar/reabrir configuração em homologação. |
| G4.8 | Blocos de resumo e janelas completas por modalidade | — | — | — | — | benchmark científico; operação fatia 11. Próxima prova: Modelo operacional completo com regras efetivas. |

### Gate 5 — Submissão pelo autor

**37,5% (12/32)**; implementação 50,0%. Dependência funcional: Gate 4 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G5.1 | Área de envio vinculada à inscrição confirmada | ✓ | ✓ | ✓ | — | #344/#348; scientific-author. Próxima prova: Teste autor confirmado e não confirmado. |
| G5.2 | Envio textual, modalidade, área e instituição do autor único | ✓ | ✓ | ✓ | — | scientific-author-panel.tsx; #406. Próxima prova: Percorrer submissão real no navegador. |
| G5.3 | Primeira versão, listagem e protocolo idempotente | ✓ | ✓ | ✓ | — | scientific-author.service.ts; scientific-author-policy. Próxima prova: Repetição de envio não duplica. |
| G5.4 | Limites e validação no servidor | ✓ | ✓ | ✓ | — | scientific-author-policy; #406. Próxima prova: Limites, modalidade desativada e prazo. |
| G5.5 | Coautores, ordem, instituições e apresentador | — | — | — | — | scientific-author.service bloqueia minAuthors > 1. Próxima prova: Atender até 10 coautores no cenário solicitado. |
| G5.6 | Upload de PDF na submissão | — | — | — | — | scientific-author.service bloqueia requireFile. Próxima prova: Endpoint/passividade/limites e interface. |
| G5.7 | Rascunho, correção e nova versão pelo autor | — | — | — | — | controller do autor oferece GET/POST, sem edição. Próxima prova: Versão imutável e trilha de correção. |
| G5.8 | Aviso ao autor após submissão/correção | — | — | — | — | #406 explicitamente exclui envio de e-mail. Próxima prova: Provar entrega e idempotência. |

### Gate 6 — Avaliação científica

**37,5% (12/32)**; implementação 50,0%. Dependência funcional: Gate 5 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G6.1 | Critérios e pesos administrados pela comissão | ✓ | ✓ | ✓ | — | scientific-reviews.tsx; scientific-reviews.controller.ts. Próxima prova: Adicionar rubrica e validar faixa/peso. |
| G6.2 | Distribuição à versão e teto de avaliadores | ✓ | ✓ | ✓ | — | scientific-reviews.service; #406. Próxima prova: Distribuir versões sem cruzar eventos. |
| G6.3 | Bloqueio de conflito objetivo de autoria | ✓ | ✓ | ✓ | — | scientific-review-policy; service-smoke. Próxima prova: Casos negativos de identidade/conflito. |
| G6.4 | Acompanhamento administrativo de atribuições | ✓ | ✓ | ✓ | — | scientific-reviews GET management; scientific-reviews.tsx. Próxima prova: Status sem agir em nome do avaliador. |
| G6.5 | Área e identidade segura do avaliador | — | — | — | — | controller/UI limitados à administração. Próxima prova: Login e escopo de atribuição próprios. |
| G6.6 | Notas, conflito declarado, parecer e envio pelo avaliador | — | — | — | — | scientific-reviews.tsx informa entrega futura. Próxima prova: Fluxo completo com versão imutável. |
| G6.7 | Retomar/reabrir parecer e rubrica versionada | — | — | — | — | operação fatia 11. Próxima prova: Não zerar banca e auditar revisões. |
| G6.8 | Avisos, distribuição assistida e operação em lote | — | — | — | — | operação fatia 11/benchmark. Próxima prova: Comunicação real e ações auditáveis. |

### Gate 7 — Decisão científica

**0,0% (0/24)**; implementação 0,0%. Dependência funcional: Gate 6 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G7.1 | Consolidação e quórum operacional | — | — | — | — | #23 draft; sem controller de decisão em app.module.ts. Próxima prova: Implementar painel/API de decisão. |
| G7.2 | Aceite, recusa e aceite com alteração | — | — | — | — | Enums/configurações não constituem comando operável. Próxima prova: Transições autorizadas e auditadas. |
| G7.3 | Resolução de divergência e intervenção do coordenador | — | — | — | — | coordinatorDecidesStatus é configuração em #406. Próxima prova: Operação explícita com trilha. |
| G7.4 | Carta de aceite e comunicação ao autor | — | — | — | — | operação fatia 11. Próxima prova: Documento e entrega real. |
| G7.5 | Correção pós-parecer e nova decisão | — | — | — | — | direção científica. Próxima prova: Preservar parecer e versões anteriores. |
| G7.6 | Desbloqueio condicionado do pós-aceite | — | — | — | — | #406 guarda flags/prazo, sem workflow de decisão. Próxima prova: Ligar decisão a permissões reais. |

### Gate 8 — Arquivo final, pôster e ePoster

**12,5% (3/24)**; implementação 16,7%. Dependência funcional: Gate 7 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G8.1 | Configuração do envio pós-aceite e prazo | ✓ | ✓ | ✓ | — | #406; acceptedWorkUploadEnabled/Deadline. Próxima prova: Só configuração; o upload ainda não abre. |
| G8.2 | Envio do arquivo final após aceite | — | — | — | — | scientific-author-panel mostra envio futuro. Próxima prova: Endpoint e UI com autorização pós-aceite. |
| G8.3 | Validação passiva de PDF e armazenamento do trabalho final | — | — | — | — | Reutilizar política PDF; não existe fluxo final. Próxima prova: Versionamento/limites/autorização. |
| G8.4 | Segunda versão e slide pós-aprovação | — | — | — | — | operação fatia 11. Próxima prova: Vínculo ao trabalho aceito e histórico. |
| G8.5 | Estação ePoster, busca e QR individual | — | — | — | — | Planejador local não é estação operável. Próxima prova: Busca título/autor/área e leitura. |
| G8.6 | Exibição, idiomas e download autorizado | — | — | — | — | requisito científico sem engine final em app.module. Próxima prova: Operação e autorização sem publicar anais/DOI. |

### Gate 9 — Programação científica

**46,9% (15/32)**; implementação 62,5%. Dependência funcional: Gate 8 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G9.1 | Espaços e salas | ✓ | ✓ | ✓ | — | scientific-program; CI_SMOKE_A5_OK. Próxima prova: Criar salas e limites em homologação. |
| G9.2 | Atividades, datas, horários e tipos | ✓ | ✓ | ✓ | — | scientific-program; #384. Próxima prova: Agenda dentro do período do evento. |
| G9.3 | Cadastro/vínculo de palestrantes e papéis | ✓ | ✓ | ✓ | — | scientific-guests/program; CI_SMOKE_A4_OK. Próxima prova: Vincular pessoa canônica. |
| G9.4 | Conflitos de sala e pessoa no servidor | ✓ | ✓ | ✓ | — | #390; scientific-program-update tests. Próxima prova: Reagendamento por API sem colisão. |
| G9.5 | Diagnóstico e prontidão para revisão | ✓ | ✓ | ✓ | — | scientific-program ready-for-review; #390. Próxima prova: Recusar conflito bloqueante. |
| G9.6 | Editar/reagendar pela interface | — | — | — | — | API PATCH existe; UI scientific-program sem formulário de edição. Próxima prova: Completar UI e validar conflito. |
| G9.7 | Programação publicada com sessão/trabalho confirmado | — | — | — | — | operação fatia 12; painel não é agenda pública. Próxima prova: Publicação explícita e vínculo científico. |
| G9.8 | Agenda do palestrante/participante | — | — | — | — | operação fatia 12. Próxima prova: Agenda pessoal com permissões. |

### Gate 10 — Operação do evento

**51,9% (27/52)**; implementação 69,2%. Dependência funcional: Gate 9 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G10.1 | Posto restrito do operador e painel de links | ✓ | ✓ | ✓ | — | #395/#407; EventDesk eventFor/requireOrganizer. Próxima prova: Teste conta OPERATOR sem painel organizador. |
| G10.2 | QR assinado e check-in | ✓ | ✓ | ✓ | — | #340/#395; check-in. Próxima prova: Leitor físico/câmera, repetição e negativas. |
| G10.3 | Busca, ficha e nova inscrição no local | ✓ | ✓ | ✓ | — | #395; event-desk. Próxima prova: Busca mínima e correção autorizada. |
| G10.4 | Etiqueta, layout e reimpressão | ✓ | ✓ | ✓ | — | #395; event-desk badge/label. Próxima prova: Impressão física, 1/2 etiquetas e margens. |
| G10.5 | Totem, confirmação e link com validade | ✓ | ✓ | ✓ | — | #407; self-check-in/totem policy. Próxima prova: Imprimir, sair, timeout, revogar/expirar. |
| G10.6 | Presença por atividade e entrega de material | ✓ | ✓ | ✓ | — | event-desk activity-access/material. Próxima prova: Repetição não duplica e escopo correto. |
| G10.7 | Relatórios, impressão de lista e sorteio | ✓ | ✓ | ✓ | — | #401/#407; event-desk report/raffle. Próxima prova: Conferir filtros e dados da fixture. |
| G10.8 | Credenciais de equipe e reentrada | ✓ | ✓ | ✓ | — | #400; show-operations. Próxima prova: Uso de equipe separado de ingresso. |
| G10.9 | API de catraca e chaves com validade | ✓ | ✓ | ✓ | — | #400; turnstile; tests/CI. Próxima prova: Integração real e negativas; sem promessa de hardware homologado. |
| G10.10 | Atribuição granular do operador por evento/função | — | — | — | — | #368 separado e aberto. Próxima prova: Reconciliar com posto integrado; não recriar. |
| G10.11 | Presença por dia e estorno lógico de presença/material | — | — | — | — | operação fatia 4. Próxima prova: Correção auditada sem apagar evidência. |
| G10.12 | Inscrição em atividade com vaga e conflito | — | — | — | — | operação fatia 5. Próxima prova: Separar de registro de presença. |
| G10.13 | Área do expositor/prestador e serviços | — | — | — | — | #408 draft, identidade sem posse verificada. Próxima prova: Corrigir identidade e concluir testes negativos antes de merge. |

### Gate 11 — Pós-evento

**0,0% (0/24)**; implementação 0,0%. Dependência funcional: Gate 10 e capabilities aplicáveis. EVO-015 autoriza preparação vertical em develop/homologação sem dispensar o Go de lançamento.

| ID | Unidade | I | T | D | F | Evidência / pendência |
| --- | --- | :---: | :---: | :---: | :---: | --- |
| G11.1 | Templates, tags e emissão de certificado por presença/papel | — | — | — | — | operação fatia 13; sem engine certificado em app.module. Próxima prova: Sem taxa de download. |
| G11.2 | Pacotes/lotes, verso e carga horária | — | — | — | — | operação fatia 13. Próxima prova: Emissão auditável e dados canônicos. |
| G11.3 | Download/segunda via e autenticidade | — | — | — | — | planejador/certificate-ready não emite. Próxima prova: Consulta e entrega segura. |
| G11.4 | Avaliação do evento e exportação | — | — | — | — | operação fatia 6. Próxima prova: Questionário e respostas do próprio evento. |
| G11.5 | Relatórios consolidados de resultados e exportação | — | — | — | — | operação fatias 2/3; relatórios de portaria são Gate10. Próxima prova: Visitas/vendas/recebido/submissões e campos da ficha. |
| G11.6 | Encerramento, retenção e reutilização por clone seguro | — | — | — | — | operação fatia 7. Próxima prova: Sem copiar pessoas, dinheiro, submissões ou mídia privada. |

## Bloqueadores e decisões para avançar

1. **P0 — homologação pública:** aplicar configuração Nginx/TLS pelo acesso administrativo autorizado e repetir provas; não enfraquecer checks nem contornar a chave SSH restrita. Procedimento/rollback em [operacao-ssl-homologacao.md](../operacao-ssl-homologacao.md).
2. **P0 — identidade do expositor:** #408 permanece aberto/draft; provar posse do e-mail ou conta verificada, com testes negativos de personificação. Não integrar apenas porque e-mail + documento correspondem.
3. **P1 — validar o que já foi entregue:** Gate 1 criação/publicação por perfil; Gate 2 gratuito/comprovante/Asaas sandbox; Gate 3 login, confirmação, vínculo, QR e transmissão; Gate 10 conta OPERATOR, câmera/leitor, totem e impressão física. Ensaio humano de teclado/foco/NVDA ou VoiceOver deve ficar registrado.
4. **P1 — caminho crítico científico:** concluir coautoria e submissão PDF (G5), área segura do avaliador/parecer (G6), decisão e comunicação (G7), depois arquivo pós-aceite (G8). Testar congresso com título 180 caracteres, resumo 2800, até 3 trabalhos por autor e até 10 coautores, com instituição de cada autor.
5. **P1 — programação:** completar editar/reagendar pela interface, programação pública e agenda pessoal (G9), aproveitando o PATCH e os checks já existentes.
6. **P2 — operação/pós-evento:** presença diária, estorno lógico, inscrição na atividade, relatórios finais e certificado por presença/papel; não emitir certificado com programação apenas planejada.

#409 apareceu aberto/draft durante esta apuração: página pública, mapa e texto formatado. Não pontuado antes do merge/CI/deploy. #368 continua separado para ACL granular; #394 parcialmente substituído por #404 exige comparação, não integração automática. #85 é snapshot antigo: não sobrescrever outubro com agosto. Outros PRs antigos não são elegíveis por CI histórico isolado.

## Limites transversais e proteção de escopo

Segurança, tenant/event isolation, LGPD, idempotência, auditoria, rollback, identidade verificada, Node22/ARM64 e acessibilidade são condições de encerramento. O pedido de auditoria integral ao Gemini no #405 é **solicitação**, sem evidência de execução completa. O login protocol/documento por evento ainda existe como fallback legado e exige revisão de identidade; não atribuir a ele posse de histórico consolidado.

NFS-e é explicitamente pendente no Gate 2; comprovante/recibo e dados PF/PJ não equivalem a emissão fiscal. Catálogo de integrações não comprova conectores de terceiros; #397 comprova somente API/webhooks/presença em sites. Funcionalidades de visão futura (por exemplo biometria/RFID/aplicativo nativo) ficam fora desta linha de base de lançamento, sem apagar os requisitos históricos. Anais/DOI/WhatsApp/upload de vídeo e demais exclusões da EVO-017 permanecem fora do escopo ativo.

Sem promoção de main, sem deploy de produção e sem cobrança real por esta consolidação. Reverter a documentação restaura o estado anterior sem tocar banco ou aplicação.
