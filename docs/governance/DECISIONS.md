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
| EVO-006 | Gates e sequência funcional não podem ser atropelados. | ACEITA | Fase 2 — Inscrição só inicia após o Go/No-Go da Fase 1. |
| EVO-007 | Git e evidências vivas prevalecem sobre memória de chat. | ACEITA | Chats ajudam no raciocínio; não comprovam implementação, teste ou merge. |
| EVO-008 | O Orquestrador é a porta de entrada do Product Owner. | ACEITA | Ideias e pedidos são avaliados centralmente antes de distribuir tarefas. |
| EVO-009 | Chats técnicos trabalham por resultado concreto. | ACEITA | Criar uma conversa por entrega reduz contexto obsoleto e conflitos entre “departamentos”. |
| EVO-010 | Handoff do PR precede consolidação central. | ACEITA | Tarefas paralelas não disputam o mesmo `PROJECT_STATE.md`; o Orquestrador consolida fatos. |
| EVO-011 | Progresso não usa percentuais subjetivos. | ACEITA | Reportar SHA, PR, checks, Gate, critérios atendidos e pendências. |
| EVO-012 | UX e comunicação do sistema são em português e acessíveis. | ACEITA | Aplicar WCAG 2.2 AA e linguagem compreensível ao usuário. |
| EVO-013 | O Evolvia adota o Flow Guard v1 para governança do GitHub. | ACEITA | Revisão automática segue regras do `AGENTS.md`; dependências entram por PR controlado; auto-merge nunca se aplica a `main`/produção e só pode ser habilitado em `develop` após todos os gates. |
| EVO-014 | Benchmark é piso de capacidade, não licença para copiar. | ACEITA | Toda solução útil e lícita observada é registrada e avaliada para implementação própria na fase/Gate corretos; interface, texto, código, ativo e fluxo proprietário não são copiados. |
| EVO-015 | EVA é assistente contextual com proteção de produto e tenants por zero trust. | ACEITA | EVA suporta todos os atores autorizados, mas contexto, memória e ferramentas aplicam menor privilégio e nunca revelam dados cross-tenant ou inteligência estratégica interna; a proteção não depende de identificar concorrentes. |
| EVO-016 | Alinhamentos permanentes de produto são versionados em `PRODUCT_MEMORY.md`. | ACEITA | Conversas alimentam a memória canônica, mas implementação e estado continuam dependentes de Git, evidências e fontes vivas. |

## Nova decisão

Registre: contexto, opções avaliadas, decisão, motivos, impactos, riscos,
compatibilidade, migration, segurança, testes e rollback. Inclua issue/PR e data.
