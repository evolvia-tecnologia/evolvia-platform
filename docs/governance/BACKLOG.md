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

## Quadro executivo atual

| Classe | Item | Estado verificável |
| --- | --- | --- |
| P0 | Issue `#68` — HTTPS público da homologação | código de recuperação integrado; depende de TCP 443 e ativação administrativa na Oracle |
| P1 | Issues `#32` e `#56` — Go/No-Go da Fase 1 | Lotes 1–5 integrados; faltam WCAG manual e HTTPS público |
| P1 | PR `#65` / issue `#67` — UX Cadastro/Login | Draft; CI `#260` técnico verde; validação visual e acessível pendente |
| P1 | Issue `#40` — recuperação segura de senha | próximo corte funcional após estabilizar o PR `#65` |
| P1 | Issue `#42` — confirmação real de e-mail | pendente de contrato e implementação backend seguros |
| P1 | Issue `#64` — ativações administrativas do Flow Guard | código integrado; rulesets, Dependabot, auto-merge e Code Review automático não comprovados |
| P1 | Issue `#69` — modo economia | primeiro corte integrado pelo PR `#70`; medições e itens administrativos pendentes |
| P2 | Fase 2 — Registration Engine | bloqueada pelo Go/No-Go da Fase 1 |
| P3 | PRs científicos `#27`, `#28` e `#23` | preservados com dependências; fora da linha ativa |

## Sequência da frente ativa

1. provar UX/WCAG e responsividade do PR `#65`;
2. revalidar HEAD, checks, base e reviews antes de qualquer integração;
3. concluir recuperação de senha e confirmação de e-mail sem UI decorativa;
4. comprovar HTTPS público e healthcheck quando a intervenção Oracle estiver
   disponível;
5. emitir o Go/No-Go da Fase 1;
6. iniciar Fase 2 somente após aprovação explícita do Gate anterior.

Trabalho funcional independente pode avançar durante o bloqueio externo do SSL,
desde que não antecipe a Fase 2 nem crie conflito com branches ativas.

## Regras transversais

- preservar self-service assistido pela EVA e o Framework IICEE;
- seguir a jornada 1→11 e capabilities por perfil;
- aplicar deny-by-default e isolamento `organizationId + eventId`;
- minimizar DTOs e dados pessoais;
- exigir auditoria, idempotência e revisão otimista quando aplicáveis;
- usar migrations expansivas e rollback verificável;
- validar Ubuntu/ARM64 e dependências reproduzíveis;
- tratar WCAG 2.2 AA, responsividade e português claro como Gates;
- não expor CTA para backend inexistente;
- não alterar `main` ou produção sem Go/No-Go e autorização explícita.

## Entrada de uma nova ideia

1. Berg registra a ideia no Orquestrador.
2. O Orquestrador identifica usuários, valor, dependências, módulos, dados,
   segurança, UX, compatibilidade e fase correta.
3. A ideia recebe classe `IDEIA` ou proposta de prioridade.
4. Somente após decisão explícita vira issue executável.
5. O contrato define escopo e não escopo antes de criar branch.

## Regra de foco

Enquanto o Gate da Fase 1 estiver aberto, correções entram na linha ativa quando
forem necessárias ao Gate, reduzirem risco relevante ou tiverem autorização
explícita. Benchmark orienta problemas e padrões úteis; nunca autoriza copiar
interface, texto, código ou fluxo proprietário.
