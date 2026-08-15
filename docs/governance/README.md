# Governança do Evolvia

Esta pasta transforma conversas e tarefas paralelas em um fluxo verificável.
Ela não replica todo o histórico do produto: aponta para as fontes certas e
mantém somente o estado necessário para retomar o trabalho com segurança.

## Documentos canônicos

| Documento | Função | Responsável por consolidar |
| --- | --- | --- |
| `PROJECT_STATE.md` | fotografia executiva e próximo Gate | Orquestrador |
| `ARCHITECTURE.md` | mapa e invariantes de arquitetura | Arquitetura + Orquestrador |
| `DECISIONS.md` | decisões aceitas e substituições | Orquestrador/Product Owner |
| `BACKLOG.md` | ordem de trabalho, bloqueios e ideias | Orquestrador/Product Owner |
| `WORKFLOW.md` | chats, tarefas paralelas e handoff | Orquestrador |
| `PROJECT_INSTRUCTIONS.md` | instruções para o Projeto no ChatGPT | Product Owner |

O `AGENTS.md` na raiz contém as regras executáveis por qualquer agente que abra
o repositório.

## Verdade e atualização

- Git é a verdade do que existe.
- Issues e PRs são a verdade do trabalho em andamento.
- Este diretório explica o que deve ser feito e em que ordem.
- Chats preservam raciocínio, mas não oficializam decisão nem conclusão.

Não registrar percentuais subjetivos. Use SHA, PR, check, Gate e critério de
aceite como evidência.

## Regra de concorrência

Branches especializadas entregam handoff no PR. O estado central é consolidado
depois da mudança oficial, evitando conflitos artificiais em cada tarefa
paralela.
