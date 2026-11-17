# Registro de decisões

Somente decisões aprovadas entram aqui. Ideias ficam no backlog até análise de
impacto e aceite do Product Owner. Uma decisão substituída não é apagada: recebe
status `SUBSTITUÍDA` e aponta para a sucessora.

| ID | Decisão | Status | Consequência operacional |
| --- | --- | --- | --- |
| EVO-001 | Evolvia é self-service assistida pela EVA. | ACEITA | EVA orienta e sugere; não publica nem altera dado sensível silenciosamente. |
| EVO-002 | A plataforma é multi-organização e event-scoped. | ACEITA | Toda nova leitura/escrita aplica isolamento no servidor. |
| EVO-003 | `main` é estável e `develop` é a integração. | ACEITA | Trabalho novo usa branch isolada e PR; produção depende de Go/No-Go explícito. |
| EVO-004 | Ubuntu/ARM64 é plataforma obrigatória. | ACEITA | Build e dependências precisam ser compatíveis e testados nesse alvo. |
| EVO-005 | Migrations seguem expandir -> migrar -> validar -> restringir. | ACEITA | Primeiro corte não destrói schema e preserva rollback da aplicação. |
| EVO-006 | Gates e sequência funcional não podem ser atropelados. | SUBSTITUÍDA por EVO-015 | A ordem continua canônica, mas a preparação vertical em `develop`/homologação foi autorizada pelo Product Owner no Modo Lançamento. |
| EVO-007 | Git e evidências vivas prevalecem sobre memória de chat. | ACEITA | Chats ajudam no raciocínio; não comprovam implementação, teste ou merge. |
| EVO-008 | O Orquestrador é a porta de entrada do Product Owner. | ACEITA | Ideias e pedidos são avaliados centralmente antes de distribuir tarefas. |
| EVO-009 | Chats técnicos trabalham por resultado concreto. | ACEITA | Criar uma conversa por entrega reduz contexto obsoleto e conflitos entre “departamentos”. |
| EVO-010 | Handoff do PR precede consolidação central. | ACEITA | Tarefas paralelas não disputam o mesmo `PROJECT_STATE.md`; o Orquestrador consolida fatos. |
| EVO-011 | Progresso não usa percentuais subjetivos. | ACEITA | Reportar SHA, PR, checks, Gate, critérios atendidos e pendências. |
| EVO-012 | UX e comunicação do sistema são em português e acessíveis. | ACEITA | Aplicar WCAG 2.2 AA e linguagem compreensível ao usuário. |
| EVO-013 | O Evolvia adota o Flow Guard v1 para governança do GitHub. | ACEITA | Revisão automática segue regras do `AGENTS.md`; dependências entram por PR controlado; auto-merge nunca se aplica a `main`/produção e só pode ser habilitado em `develop` após todos os gates. |
| EVO-014 | Enquanto o Gemini Developer estiver pausado, o Codex assume o backlog programável da trilha sem acionar o Gemini. | ACEITA | Owned paths e workflows Gemini permanecem preservados; retomada exige prova controlada e decisão explícita. |
| EVO-015 | Modo Lançamento prioriza fatias verticais utilizáveis em `develop` e homologação. | ACEITA em 22/09/2026 | Cada lote reúne tela + API + banco + testes + homologação quando aplicável; segurança, tenant, LGPD, auditoria, idempotência e rollback são incorporados. Abertura pública, `main` e produção continuam dependentes de Go/No-Go explícito. |
| EVO-016 | Login continua pelo e-mail. CPF ou passaporte é a chave do histórico de participação da própria pessoa. | ACEITA em 04/10/2026 | Documento não autentica. Digitar o documento de outra pessoa não revela o histórico. A organização vê só o evento dela. Contrato em [operacao-do-evento.md](../operacao-do-evento.md). |
| EVO-017 | A operação do evento incorpora as fatias 1 a 17 de [operacao-do-evento.md](../operacao-do-evento.md). | ACEITA em 04/10/2026 como direção, não como entrega | O Orquestrador incorpora uma fatia por vez, com tela, API, banco e testes. Inclui avisos por e-mail, prazo com hora, fila, científico operacional, programação pública, certificado sem taxa, reembolso visível, o link de transmissão para quem já está inscrito e o complemento do credenciamento. Fora de escopo: doação, assento, anais, DOI, WhatsApp, aplicativo nativo, upload de vídeo, comentário na transmissão, senha compartilhada do evento, grupo como módulo, permissão menu a menu e captcha. |

## Nova decisão

Registre: contexto, opções avaliadas, decisão, motivos, impactos, riscos,
compatibilidade, migration, segurança, testes e rollback. Inclua issue/PR e data.


## EVO-018 — Medição dos Gates por critérios e evidências

Status: ACEITA como método de acompanhamento solicitado pelo Product Owner em 04/10/2026; não altera escopo funcional nem autoriza produção.

Contexto: após os merges/deploys de outubro, faltava um denominador reproduzível. Opções: contagem de PRs (não mede funcionalidades), estimativa por esforço (não há estimativa formal), critérios funcionais e marcos verificáveis (adotado). Baseline v1: 93 unidades na sequência canônica 1–11. Cada unidade tem integração funcional, CI aplicável, deploy da fonte e ensaio do cenário em homologação, com 25% por marco. Cada Gate pesa igualmente no índice global. Integração e conclusão comprovada são exibidas separadamente. Método/dados: [GATES_STATUS.md](GATES_STATUS.md) / [GATES_STATUS.json](GATES_STATUS.json).

Consequência: numeradores só mudam por evidência; mudanças de denominador geram baseline nova com justificativa. As estimativas antigas não são comparáveis. Zero não apaga trabalho documental/em branch. Critérios de segurança, identidade, WCAG, infraestrutura e Go permanecem bloqueadores mesmo com cobertura funcional alta.

Impacto IICEE: transparência e continuidade. Risco: percentuais confundidos com esforço ou liberação; mitigação: fórmula, 93 itens explícitos, etapas separadas e Go independente. Não afeta migrations, dados, permissões ou runtime. Validação: soma dos marcos/denominadores e links relativos; fontes Git/CI no SHA b36829b. Rollback: reverter esta consolidação documental.


## EVO-019 — Foco em critérios completos de comunicação e certificados

Status: HISTÓRICA; exclusividade de implementação substituída por EVO-020 em 05/11/2026. Permanecem os limites de efeitos externos e a exigência de evidência.

Priorizar G5.8/G6.8/G7.4 na base compartilhada de comunicação e G11.2 em certificados. Substitui a alternância obrigatória de seis frentes; preserva pendências e limites anteriores. Codex implementa nas branches existentes com ownership exclusivo, Gemini analisa/revisa novos deltas. Validar localmente um lote coerente antes de CI/revisão; triagem reproduzível dos achados; não repetir revisões do mesmo SHA ou reagir a comentários próprios. Nenhum acionamento Cursor/Composer.

A soma potencial é +5,30p.p., sem garantia de prazo e sem alteração da fórmula EVO-018. Avisos, distribuição assistida/operação em lote e cartas precisam do comportamento completo e de prova real de entrega quando o aceite exigir. HTTP aceito pelo provedor não comprova recebimento; sem canal/destinatário autorizado avançar certificados independente. E-mails reais e dinheiro dependem de autorização específica. Integração emdevelop continua condicionada ao HEAD exato, base atual, CI completo aplicável e threads resolvidas; publicação exige prova própria do SHA. Rollback de aplicação preserva snapshots, auditoria e migrations aditivas. Filas #570/#571/#545 registram os contratos/evidências; `main`, produção, infra, secrets e billing permanecem fora do escopo.

## EVO-020 — Execução sincronizada no Modo Lançamento

Status: ACEITA como direção explícita do fundador em 05/11/2026; substitui EVO-019 somente quanto à exclusividade de implementação e distribuição do trabalho. Não representa aceite funcional, autorização de produção ou de efeitos financeiros/comunicação externos reais.

Contexto: o fundador determinou retomar o Work e aproveitar as sessões já contratadas para concluir funcionalidades, preservando branches, código existente e proteções do GitHub. A alternativa de concentrar toda implementação no Codex limita o avanço; concorrência nos mesmos arquivos aumenta risco de perda e retrabalho.

Decisão: Codex responde por G2, financeiro, etiquetas e integrações; Claude por G10, operadores, credenciamento e expositores (#640); Gemini por científico, comunicações, cartas e Sports (#641), respeitando locks existentes como #610/#621; Work coordena, implementa cortes independentes, integra e consolida. Compartilhar contratos e dependências, não compartilhar escrita dos mesmos paths sem acordo. Filas e ACK/commit/PR/SHA/checks ficam na #571. Comentário de fila não comprova ativação de outra sessão.

Execução: priorizar funcionalidades completas e reutilizar PRs existentes; manter segurança, tenant, permissões, integridade, migrations aditivas, rollback e CI obrigatório. Reservar a auditoria E2E abrangente para o fechamento da implementação. No máximo dois candidatos críticos. Sem APIs/execuções com novos custos a partir desta decisão, nem promessa de atuação automática entre mensagens.

Medição: preservar EVO-018 e os 93 critérios; só alterar I/T/D/F por prova canônica. Correções de critérios já integrados não criam nova unidade. Work registra entregas verificadas no Master Codex; histórico não é apagado. Main/produção continuam sujeitos a Go/No-Go e autorização explícita.

IICEE: coordenação por contratos e evidências melhora integração, confiabilidade e experiência sem criar arquitetura paralela. Risco: considerar uma IA ativa só por ter tarefa atribuída; mitigação por ACK/commit verificável e execução explícita. Rollback: redistribuir o próximo corte preservando branch, histórico e contratos; nenhuma migration decorre desta decisão.


## EVO-021 — Macrociclos de conclusão e retorno do Cursor em 06/11

Status: ACEITA como direção explícita do fundador em06/11/2026; substitui EVO-020 somente na distribuição das frentes. Contrato [#571/6685989083](https://github.com/evolvia-tecnologia/evolvia-platform/issues/571#issuecomment-6685989083).

Work coordena e integra; Codex mantém G2/financeiro/fiscal; Claude mantém operadores/operação/CAEX; Gemini mantém cartas/comunicações e recebe #610 mediante ACK; Cursor foi reautorizado para etiquetas #614→#647 e Sports #621→#648, na sessão contratada, sem Cloud/novos custos. Um dono por conjunto de paths, transferências por SHA e ACK, e integração de compartilhados em sequência. A alternativa de todos editarem os mesmos módulos foi rejeitada pelo risco de sobrescrita e retrabalho.

Meta de 100% no dia não dispensa backend deny-by-default, tenant/LGPD, integridade financeira, CI obrigatório, revisão independente ou evidência de publicação. Revisar delta novo uma vez por SHA, sem auditorias/leituras repetidas ou commits artificiais por rodada. Macrociclos concluem resultados verticais; bloqueio reproduzível é registrado uma vez antes de alternar para tarefa livre.

Medição EVO-018 preservada: 93 critérios/11 Gates e I/T/D/F somente por prova. Agendamento e comentário de fila não comprovam execução externa. Rodadas aceitas pelo serviço não garantem ativação; sessões Claude/Gemini/Cursor exigem ACK/commit. Sem main/produção/infra/secrets/billing, pagamentos/e-mails reais ou APIs pagas. Compatibilidade, migrations aditivas e rollback permanecem obrigatórios. Rollback desta direção redistribui o próximo corte sem apagar trabalho.
