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
| EVO-016 | Login continua pelo e-mail. CPF ou passaporte é a chave do histórico de participação da própria pessoa. | ACEITA em 04/10/2026 | Documento não autentica. Digitar o documento de outra pessoa não revela o histórico. A organização vê só o evento dela. Contrato em `docs/operacao-do-evento.md`. |
| EVO-017 | A operação do evento incorpora as fatias 1 a 17 de `docs/operacao-do-evento.md`. | ACEITA em 04/10/2026 como direção, não como entrega | O Orquestrador incorpora uma fatia por vez, com tela, API, banco e testes. Inclui avisos por e-mail, prazo com hora, fila, científico operacional, programação pública, certificado sem taxa, reembolso visível, o link de transmissão para quem já está inscrito e o complemento do credenciamento. Fora de escopo: doação, assento, anais, DOI, WhatsApp, aplicativo nativo, upload de vídeo, comentário na transmissão, senha compartilhada do evento, grupo como módulo, permissão menu a menu e captcha. |

## Nova decisão

Registre: contexto, opções avaliadas, decisão, motivos, impactos, riscos,
compatibilidade, migration, segurança, testes e rollback. Inclua issue/PR e data.
