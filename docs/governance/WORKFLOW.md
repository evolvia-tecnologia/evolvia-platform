# Fluxo do Orquestrador e dos chats técnicos

## Estrutura recomendada no Projeto ChatGPT

Fixar um único chat de entrada:

- `00 — ORQUESTRADOR / PRODUCT OWNER`.

Criar chats separados por resultado, com nomes curtos e rastreáveis:

| Prefixo | Quando usar | Exemplo |
| --- | --- | --- |
| `ARQ` | decisão estrutural | `ARQ — política de publicação` |
| `BE` | API e domínio | `BE — preview autorizado` |
| `FE` | interface e UX | `FE — editor de Divulgação` |
| `DB` | schema e migration | `DB — revisão editorial` |
| `INT` | APIs e integrações | `INT — armazenamento de mídia` |
| `SEC` | ameaça, ACL e LGPD | `SEC — isolamento do preview` |
| `QA` | testes e aceite | `QA — Gate da Fase 1` |
| `OPS` | CI, ARM64 e deploy | `OPS — validação ARM64` |

Não manter um chat técnico infinito por departamento. Cada conversa tem um
resultado, uma base e um encerramento claros; o projeto, os arquivos e o Git
preservam a continuidade.

## Papel do Orquestrador

- receber ideias, pedidos, correções e o comando “Avance o projeto”;
- auditar estado, dependências, PRs e bloqueios;
- decidir o próximo trabalho elegível dentro do Gate atual;
- criar contratos de tarefa e separar ownership de arquivos;
- impedir duplicação e escopo concorrente;
- consolidar handoffs e atualizar os documentos canônicos;
- levar decisões de produto a Berg quando alterarem escopo, risco ou direção.

## Contrato de tarefa

Antes da execução, registrar no issue/brief:

```yaml
task_id: EVO-<issue-ou-identificador>
outcome: <resultado verificável>
role: <ARQ|BE|FE|DB|INT|SEC|QA|OPS>
base_branch: develop
base_sha: <sha verificado>
phase_gate: <fase e gate>
dependencies: []
owned_paths: []
scope: []
non_goals: []
acceptance_criteria: []
required_checks: []
risks: []
rollback: <estratégia>
```

O contrato não autoriza automaticamente mudança em `main`, produção, secret,
banco destrutivo ou ampliação de escopo.

## Paralelização segura

O Orquestrador só paraleliza tarefas independentes. Antes disso, monta a ordem
de dependências e define ownership. Alterações sobre o mesmo schema, contrato de
API, componente central ou migration devem ser sequenciais ou coordenadas numa
única branch.

Cada branch nasce do SHA correto e não presume alterações ainda não integradas.
PR empilhado deve declarar base, dependência e ordem de merge.

## Handoff obrigatório no PR

Ao terminar, registrar:

- resultado entregue e limites;
- base e HEAD SHA;
- arquivos alterados;
- contratos/API/schema afetados;
- migrations e compatibilidade;
- testes executados e resultados reais;
- validação de segurança, isolamento, acessibilidade e ARM64 aplicável;
- riscos residuais e rollback;
- dependências desbloqueadas ou criadas;
- atualização central que o Orquestrador deve consolidar.

Sem handoff e evidência, a tarefa permanece incompleta.

## Resposta ao comando “Avance o projeto”

1. ler `AGENTS.md` e este conjunto canônico;
2. verificar `develop`, fase, Gate, issues, PRs e checks vivos;
3. identificar o próximo item desbloqueado e explicar por que ele vem agora;
4. delimitar contrato, impacto, testes e rollback;
5. executar em branch isolada;
6. validar e abrir/atualizar PR em rascunho;
7. consolidar o estado somente com fatos comprovados;
8. informar a Berg resultado, evidências, pendências e próximo passo.

## Conclusão e arquivamento

Quando o resultado estiver integrado e consolidado, arquive o chat técnico ou
renomeie-o com `CONCLUÍDO`. Preserve o Orquestrador como conversa diária. Uma
nova entrega recebe novo chat para não herdar ruído e premissas obsoletas.


## Sincronização obrigatória de Gates e documentação

Após merge funcional, término do CI de integração, implantação ou novo aceite, o Orquestrador reconcilia GATES_STATUS.json e gera a mesma leitura em GATES_STATUS.md, PROJECT_STATE.md, BACKLOG.md e EVOLVIA_MASTER_CODEX.md numa única entrega. Registrar SHA auditado, run/job, UTC/Brasília, limites e próximo aceite por critério. Preservar o JSON anterior em history/ antes de substituir o snapshot.

I exige escopo funcional completo integrado; T exige checks aplicáveis do SHA; D exige a publicação da fonte comprovada; F exige cenário em homologação. Trabalho em branch e parte administrativa de módulo externo continuam parciais. Refinamentos não aumentam denominador nem pontuam novamente. F histórico deve citar seu SHA. Infraestrutura adiada permanece como bloqueio declarado, não prioridade automática acima da direção do Product Owner.

Antes de consolidar, reconsultar develop para detectar avanço concorrente. Validar cálculos e consistência com `node scripts/validate-gates-status.mjs`. A atualização documental cita o último SHA funcional auditado; o próprio commit de documentação não é uma nova entrega funcional. Não atualizar percentuais automaticamente pela quantidade de PRs.
