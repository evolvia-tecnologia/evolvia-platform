# Backlog e ordem de execução

GitHub Issues contém as unidades de trabalho. Este arquivo registra a ordem
executiva do `develop` vivo e impede antecipação da Fase 2.

## Classificação

| Classe | Uso |
| --- | --- |
| P0 — Crítico | segurança, produção ou bloqueio absoluto |
| P1 — Fase atual | necessário para concluir ou proteger o Gate em curso |
| P2 — Próxima entrega | aprovado, mas bloqueado pelo Gate atual |
| P3 — Futuro aprovado | válido, ainda sem autorização de execução |
| IDEIA | requer análise e decisão antes de implementação |

## Quadro executivo atual

| Classe | Item | Estado verificável |
| --- | --- | --- |
| P0 | Proxy público da homologação | `Server: nginx/1.24.0 (Ubuntu)`; wrapper administrativo não promove Nginx versionado |
| P1 | Gate final da Fase 1 | automação e headers verdes; ocultação do proxy e evidência humana pendentes |
| P1 | Evidência humana WCAG | teclado/foco e NVDA ou VoiceOver ainda não registrados |
| P1 | Master Codex e governança | PR #314 sincronizado com o estado de 16/09/2026 |
| P1 | PR #284 — contrato dos planejadores | preservar exigências de revisão registradas no PR; revalidar antes de decisão |
| P1 | PR #149 — Integrações | Draft histórico; sincronização e CI do HEAD vivo obrigatórios |
| P1 | Issues #40 e #42 | recuperação de senha e confirmação real de e-mail, transversais |
| P2 | Registration Engine | bloqueado pelo Go/No-Go e EVO-006 |
| P3 | Gamificação, científico funcional e demais engines | fases futuras |

## Entregas integradas em 16/09/2026

- PR #308: detector offline de colisões de owned paths, `develop@54f0a0fa`.
- PR #312: reconciliação de PROJECT_STATE/BACKLOG/CHANGELOG, `develop@5ca73ee8`.
- PRs #295, #296 e #297: planejadores locais acessíveis, até `develop@76871738`.
- PR #315: cabeçalhos defensivos Web/Nginx, `develop@855c52ba`.
- PR #316: promoção Nginx com validação e rollback, `develop@315c89f6`.
- PR #317: deploy pela rota SSH autorizada, `develop@314dace4`.

## Sequência da frente ativa

1. atualizar o wrapper administrativo do host sem ampliar a chave SSH nem
   alterar secrets;
2. promover a configuração Nginx versionada com backup, `nginx -t`, reload e rollback;
3. repetir CI #742-equivalente no novo HEAD e comprovar ausência da versão;
4. executar validação humana com NVDA/VoiceOver e registrar evidência;
5. emitir Go/No-Go da Fase 1;
6. iniciar a fatia vertical de Inscrição somente após aprovação explícita.

## Regras transversais

- preservar self-service assistido pela EVA;
- aplicar `deny-by-default` e isolamento `organizationId + eventId`;
- minimizar DTOs e dados pessoais;
- exigir auditoria, idempotência e rollback;
- migrations seguem expandir -> migrar -> validar -> restringir;
- validar Node 22, Ubuntu/ARM64 e dependências reproduzíveis;
- manter WCAG 2.2 AA, PT-BR, teclado, foco e 320 px;
- não alterar `main`, produção ou infraestrutura sem Go e autorização.
