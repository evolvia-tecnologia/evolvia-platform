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
| P1 | Issues #32 e #56 — Go/No-Go da Fase 1 | código integrado e implantado; faltam evento público real e matriz humana |
| P1 | PR #85 — evidência e roteiro do Gate 1 | Draft documental baseado em `develop@94c51e9e` |
| P1 | Issue #30 — acessibilidade transversal | automação parcial aprovada; leitor de tela, mobile e reflow pendentes |
| P1 | PR #72 / issues #40 e #42 — recuperação e confirmação de e-mail | Draft em base anterior; depende de gateway real, configuração e evidência humana |
| P1 | PR #81 — memória de produto e salvaguardas da EVA | Draft documental em base anterior; sincronização e novo CI obrigatórios |
| P1 | Issue #64 — ativações administrativas do Flow Guard | código integrado; rulesets/Dependabot/revisão automática exigem prova administrativa |
| P1 | Issue #69 — modo economia | primeiro corte integrado; medições e itens administrativos pendentes |
| P2 | Fase 2 — Registration Engine | bloqueada pelo Go/No-Go da Fase 1 |
| P3 | PRs científicos #27, #28 e #23 | preservados com dependências; fora da linha ativa |

A issue #68 — SSL público da homologação — foi encerrada em 27/08/2026 após o
push #339 comprovar HTTPS, redirecionamento, healthcheck e
`evolvia/homologacao: success`.

## Sequência da frente ativa

1. concluir CI e revisão do PR #85 no HEAD exato;
2. confirmar que homologação e `develop` continuam no mesmo SHA;
3. publicar somente um evento de teste autorizado pelo fluxo canônico;
4. executar a matriz humana de leitor de tela, teclado, mobile e zoom/reflow;
5. corrigir em lote isolado qualquer defeito bloqueador encontrado;
6. emitir o Go explícito da Fase 1 somente com toda a evidência;
7. iniciar Fase 2 somente após o encerramento verificável do Gate anterior.

## Bloqueio humano atual

O catálogo de homologação retorna zero eventos `PUBLISHED`. Isso impede
validar a terceira superfície pública sem inventar dado ou contornar a state
machine.

O teste do dia deve:

- usar evento de teste autorizado, sem PII desnecessária;
- preservar confirmação humana explícita da publicação;
- registrar SHA, slug, ambiente, navegador, viewport e tecnologia assistiva;
- não gravar token, senha, segredo ou dado pessoal nas evidências;
- manter o Gate em No-Go temporário se qualquer critério estiver ausente.

O roteiro completo está em
`docs/governance/GATE1_GO_NO_GO.md` no PR #85.

## Frentes independentes preservadas

Trabalho funcional independente pode avançar durante bloqueio humano ou externo
somente quando:

- permanece dentro da Fase 1 ou trata risco transversal já autorizado;
- não cria conflito com branch ativa;
- não antecipa CTA, API ou estado da Fase 2;
- parte do SHA vivo de `develop`;
- possui issue, escopo, não escopo, risco, teste e rollback;
- repete CI no HEAD exato antes de qualquer integração.

PRs #72 e #81 partiram de bases anteriores e não podem usar seus CIs antigos
como autorização de merge. Os PRs #27, #28 e #23 continuam fora da linha ativa.

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
- não alterar `main` ou produção sem Go/No-Go e autorização explícita;
- não fundir cegamente a divergência histórica entre `main` e `develop`.

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
