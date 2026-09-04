# Backlog e ordem de execução

GitHub Issues contém as unidades de trabalho. Este arquivo registra a ordem
executiva do `develop` vivo e impede que novas ideias antecipem a Fase 2.

## Classificação

| Classe | Uso |
| --- | --- |
| P0 — Crítico | segurança, perda de dados, produção ou bloqueio absoluto |
| P1 — Fase atual | necessário para concluir ou proteger o Gate em curso |
| P2 — Próxima entrega | aprovado, mas bloqueado pelo Gate atual |
| P3 — Futuro aprovado | válido, ainda sem autorização de execução |
| IDEIA | requer análise e decisão antes de virar implementação |

## Quadro executivo atual

| Classe | Item | Estado verificável |
| --- | --- | --- |
| P0 | Issue `#68` — HTTPS público | depende de intervenção administrativa; não executar nesta fila |
| P1 | Gate final da Fase 1 | runtime automatizado avançou; WCAG humana e HTTPS permanecem |
| P1 | Issue `#282` — governança viva | atualização de `PROJECT_STATE.md` e deste backlog |
| P1 | Issue `#281` — contrato dos planejadores | pronta, bloqueada pelo limite de gasto do Cursor |
| P1 | Issues `#274`, `#277`, `#278` | aceitas pelo Cursor, sem PR/handoff comprovado |
| P1 | PR `#149` — Integrações | Draft e desatualizado em relação a `develop` |
| P1 | Evidência humana WCAG | leitor de tela e validação humana ainda pendentes |
| P1 | Issues `#40` e `#42` | recuperação de senha e confirmação real de e-mail, preservadas como transversais |
| P2 | Registration Engine | bloqueado pelo Go/No-Go e `EVO-006` |
| P3 | Gamificação, científico funcional e demais engines | preservados para as fases correspondentes |

## Sequência da frente ativa

1. reconciliar a governança com `develop@aaf954c338fa`;
2. liberar capacidade do Cursor sem ampliar o limite de quatro frentes;
3. executar o contrato anti-duplicação `#281`;
4. usar o PR `#280` como base obrigatória na revisão de um planejador
   representativo;
5. concluir a evidência humana WCAG;
6. comprovar HTTPS pela issue `#68` quando houver acesso administrativo;
7. emitir Go/No-Go da Fase 1;
8. iniciar Fase 2 somente após aprovação explícita.

## Regras para a família de planejadores

- planejadores são orientação local, não engines funcionais;
- reutilizar `LocalPlannerShell`, `LocalPlannerChoiceGroup` e
  `LocalPlannerSummary`;
- não coletar, enviar, persistir ou inferir dados pessoais;
- não criar dezenas de páginas desconectadas;
- diferenciar estados por texto, ícone e estilo, nunca apenas cor;
- manter teclado, foco, 44 px, 320 px, forced colors e PT-BR;
- integrar gradualmente, após revisão de valor, navegação e consistência;
- CI verde em Draft não substitui adoção da arquitetura compartilhada.

## Regras transversais

- preservar self-service assistido pela EVA;
- aplicar `deny-by-default` e isolamento `organizationId + eventId`;
- minimizar DTOs e dados pessoais;
- exigir auditoria, idempotência e rollback quando aplicáveis;
- migrations seguem expandir -> migrar -> validar -> restringir;
- validar Ubuntu/ARM64 e dependências reproduzíveis;
- não expor CTA para backend inexistente;
- não alterar `main`, produção ou infraestrutura sem Go/No-Go e autorização.

## Entrada de uma nova ideia

1. registrar a ideia com usuários, valor e risco;
2. verificar equivalentes, dependências e fase;
3. classificar como IDEIA, P3, P2, P1 ou P0;
4. obter decisão explícita quando ampliar produto;
5. criar issue com base SHA, branch, owned paths, testes e stop rules;
6. só considerar concluída após handoff, checks e estado verificável.
