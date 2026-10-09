# Estado dos Gates — 09/10/2026

## Reconciliação vigente — 09/10/2026

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
| G4.8 — Blocos de resumo e janelas completas por modalidade | Parcial | — | — | — | — | Configuração científica existe; blocos de resumo e janelas completas por modalidade ainda não comprovados. Próximo: Modelo operacional completo com regras efetivas |

## Gate 5 — Submissão pelo autor

| Critério | Estado | I | T | D | F | Evidência e próxima ação |
| --- | --- | --- | --- | --- | --- | --- |
| G5.1 — Área de envio vinculada à inscrição confirmada | Integrado | ✓ | ✓ | ✓ | — | #344/#348; scientific-author Próximo: Teste autor confirmado e não confirmado |
| G5.2 — Envio textual, modalidade, área e instituição do autor único | Integrado | ✓ | ✓ | ✓ | — | scientific-author-panel.tsx; #406 Próximo: Percorrer submissão real no navegador |
| G5.3 — Primeira versão, listagem e protocolo idempotente | Integrado | ✓ | ✓ | ✓ | — | scientific-author.service.ts; scientific-author-policy Próximo: Repetição de envio não duplica |
| G5.4 — Limites e validação no servidor | Integrado | ✓ | ✓ | ✓ | — | scientific-author-policy; #406 Próximo: Limites, modalidade desativada e prazo |
| G5.5 — Coautores, ordem, instituições e apresentador | Integrado | ✓ | ✓ | ✓ | — | #411/#445/#457; scientific-author.service.ts e scientific-author-panel.tsx Próximo: Ensaiar ordem, instituições, até dez coautores e apresentadores |
| G5.6 — Upload de PDF na submissão | Parcial | — | — | — | — | #467 integra compensação do PDF na API; formulário atual não envia PDF inicial. #497 (f546b8df) oferece interface e CI verde, ainda draft/sem merge e sem deploy. Próximo: Revisar #497, integrar após checks e ensaiar PDF inicial em homologação; não pontuar código em branch. |
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
| G9.7 — Programação publicada com sessão/trabalho confirmado | Parcial | — | — | — | — | Programação pública integrada em #442; vínculo completo de sessão/trabalho confirmado ainda não comprovado. Próximo: Publicação explícita e vínculo científico |
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
| G11.3 — Download/segunda via e autenticidade | Parcial | — | — | — | — | Consulta por código e impressão existentes; PDF gerado para download e fluxo completo de segunda via ainda não comprovados. Próximo: Consulta e entrega segura |
| G11.4 — Avaliação do evento e exportação | Integrado | ✓ | ✓ | ✓ | — | #420/#452/#457; avaliação, resultados e CSV de comentários filtrados Próximo: Ensaiar resposta própria, pergunta/busca/paginação e exportação no evento |
| G11.5 — Relatórios consolidados de resultados e exportação | Parcial | — | — | — | — | #415/#424/#428: indicadores financeiros, inscritos, presença, ciência e CSV/campos; cobertura completa de visitas/resultados ainda pendente. Próximo: Visitas/vendas/recebido/submissões e campos da ficha |
| G11.6 — Encerramento, retenção e reutilização por clone seguro | Integrado | ✓ | ✓ | ✓ | — | #470 integrado em develop@42256f46 e publicado no conjunto develop@38bfc29e; clone seguro com ACL, isolamento org/evento, idempotência e exclusões operacionais. Próximo: ensaiar negativos com duas organizações/eventos. |

## Histórico preservado

[04/10/2026](history/GATES_STATUS_2026-10-04.json): 51,6% implementação / 39,0% conclusão. [07/10/2026](history/GATES_STATUS_2026-10-07.json): 76,5% / 57,7%. Denominador inalterado.


## Entrega verificada em 09/10/2026 — catálogo #541

- PR [#541](https://github.com/evolvia-tecnologia/evolvia-platform/pull/541) integrado em `develop@7a8d4d39657e12b7624ab6e62b5221e49e20b1be`, após reconciliação com `develop@1496df7936eed9b261ce5ac508edc5d9af97a880`. HEAD validado `da609eb1316127b0f78d4802f0e9042698d83249`.
- [CI 1518](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37966032162) verde: Node22, integração/PostgreSQL, migration idempotente, hidratação isolada do catálogo, acessibilidade runtime, espaçamento de texto, árvore acessível e ARM64 Web. API ARM64 foi ignorada por não haver mudança de imagem API. Job de integração `113941575567`. Prova local complementar: 29/29 testes Node24, harness de hooks e diagnóstico; não equivale a React DOM ou prova humana.
- Código preserva imagem no SSR, separa ciclo de montagem da verificação de mídia e descarta erro tardio do elemento substituído. Diagnóstico preserva código React e somente os enums text/HTML, sem argumentos/URLs privados e sem suprimir erros.
- Publicação deste merge acompanha [run 37967190612](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37967190612), ainda sem prova de deploy nesta consolidação. Nenhum novo aceite funcional/humano foi atribuído. Último SHA publicado comprovado: `1496df7936eed9b261ce5ac508edc5d9af97a880`, run `37937702677`, job `113847881323`; gate público posterior falhou pela versão Nginx exposta.
- Matriz permanece 78,7% implementação / 59,3% conclusão, 73/93 e 0/11; delta 0,0/0,0 pp. Correção dentro de escopo já integrado não cria critério novo. A fonte da medição por critério continua `38bfc29e`; esta seção registra evidência posterior separadamente.
- #525 HEAD `24ddb396cc4c10b15cb9beb9d191a33769bbe96f`: CI verde e conciliação de vendas comprovada por fixtures, mas sem merge/deploy. Contrato #532 ainda exige limite de escrita pública: rota anônima executa incremento a cada pedido sem controle demonstrado na aplicação/configuração versionada. Handoff de correção no mesmo PR: `EVOLVIA_HANDOFF:525:24ddb396cc4c10b15cb9beb9d191a33769bbe96f`. Paths permanecem Cursor, sem lançamento automático de Composer. Não fazer carga no ambiente real.
- #497 continua reservado e serializado com #515/#516; #536 aguarda combinação da base integrada. Sem alterações em main, produção, infra ou secrets. Rollback de #541: reversão do commit de aplicação, sem migration/destruição de dados. Revisão do diff não é auditoria total.
