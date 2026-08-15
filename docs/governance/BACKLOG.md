# Backlog e ordem de execução

GitHub Issues contém as unidades de trabalho. Este arquivo mantém a ordem
executiva e impede que ideias novas desviem a fase atual.

## Classificação

| Classe | Uso |
| --- | --- |
| P0 — Crítico | risco de segurança, perda de dados, produção ou bloqueio absoluto |
| P1 — Fase atual | necessário para concluir o Gate em curso |
| P2 — Próxima entrega | aprovado, mas bloqueado pela fase atual |
| P3 — Futuro aprovado | faz sentido, sem autorização para execução agora |
| IDEIA | precisa de análise e decisão antes de entrar no escopo |

## Quadro executivo no snapshot

| Classe | Item | Estado |
| --- | --- | --- |
| P1 | Issue `#32` — Fase 1 Divulgação | em execução |
| P1 | PR `#55` — preview privado e SEO | rascunho; auditar antes de integrar |
| P1 | Lote 5 — Go/No-Go da Fase 1 | próximo após o PR `#55` |
| P2 | Fase 2 — Registration Engine | bloqueada pelo Go/No-Go da Fase 1 |
| P3 | PRs científicos `#27`, `#28` e `#23` | preservados com dependências; fora da linha ativa |
| P3 | Comprovação HTTPS pública | adiada; não é prioridade funcional atual |

## Entrada de uma nova ideia

1. Berg registra a ideia no chat `00 — ORQUESTRADOR / PRODUCT OWNER`.
2. O Orquestrador identifica usuários afetados, valor, dependências, módulos,
   dados, segurança, UX, compatibilidade e fase correta.
3. A ideia recebe classe `IDEIA` ou proposta de prioridade.
4. Somente após decisão explícita vira issue executável.
5. O contrato da tarefa define escopo e não escopo antes de criar branch.

Uma ideia descoberta em chat técnico deve retornar ao Orquestrador. Não entra
automaticamente no produto nem no PR em andamento.

## Regra de foco

Enquanto o Gate da Fase 1 estiver aberto, correções e melhorias só entram no
corte atual quando forem necessárias ao Gate, reduzirem risco relevante ou
forem explicitamente aprovadas. O restante permanece classificado sem bloquear
a entrega.
