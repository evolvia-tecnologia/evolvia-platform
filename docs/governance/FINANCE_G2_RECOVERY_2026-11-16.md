# Evolvia — reconciliação financeira G2 e execução sem retrabalho
**Checkpoint:** 16/11/2026 · **Natureza:** documentação de arquitetura, escopo e evidências; **não representa merge, deploy ou crédito automático no Gate**.

**Fontes canônicas:** [AGENTS.md](../../AGENTS.md), [DECISIONS.md](DECISIONS.md) (EVO-018/EVO-022/EVO-023), [GATES_STATUS.md](GATES_STATUS.md), [Evolvia Master Codex](EVOLVIA_MASTER_CODEX.md). **Contratos vivos:** [#571 — coordenação](https://github.com/evolvia-tecnologia/evolvia-platform/issues/571#issuecomment-6903931593), [#679 — processamento de reembolso](https://github.com/evolvia-tecnologia/evolvia-platform/issues/679), [#680 — validação dos formulários](https://github.com/evolvia-tecnologia/evolvia-platform/pull/680), [#491 — PR legado fechado](https://github.com/evolvia-tecnologia/evolvia-platform/pull/491).

## 1. Resumo e diagnóstico reproduzível
O PR legado **#491** permaneceu Draft, com conflitos e sem CI no SHA `af45d9d9da550b4bd29ecc4d4af3d3511531971c`. A comparação GitHub mostrou **27 commits à frente / 78 atrás** de `develop@8741613681c55f60de93f6f6072d7ba1c5c895dc` e **10 threads de revisão** não encerradas. Seus 19 arquivos incluem `schema.prisma`, `app.module.ts` e `asaas-checkout.service.ts`, hoje materialmente evoluídos em `develop`.

**Prova da duplicidade:** na comparação por conteúdo/blob, os arquivos abaixo do PR legado possuem o **mesmo SHA** que os arquivos já em `develop`:
- `apps/api/src/registration-refund.service.ts` — blob `a532a5b66a175a9bff5778de8a937d13cf4ae82b`;
- `apps/api/src/registration-refund-policy.ts` — blob `d4902bcacd435cb503e65f2ba04c210729ed47ec`;
- `apps/api/src/registration-refund.controller.ts` — blob `560068bce374a3a1c6d87139e61aad046efd678d`;
- `apps/web/components/registration-refund-organizer.tsx` — blob `ec68133203f228ac0da5af0441d520ed36a7bb18`;
- migration `20261008013000_registration_refund_policy`, política, testes e demais partes da UI conferidas também estão presentes. **Isto não prova que os 19 arquivos inteiros são idênticos.** Os arquivos compartilhados e alguns de inscrição/checkout diferem.

A branch antiga **não deve ser rebaseada ou integrada cegamente**. O PR #491 foi **fechado sem merge como suplantado pelo conteúdo já integrado**, preservando seu histórico e sem creditar o G2.11. Não significa que houve estorno financeiro.

## 2. O que existe e o que não existe
| Camada | Evidência já encontrada no `develop` | Lacuna para G2.11 |
| --- | --- | --- |
| Regra / aceitação | `EventRefundPolicy`, `EventRefundPolicyVersion`, `RegistrationRefundAcceptance`; regra na jornada de compra | Conservar snapshot versionado e validar compatibilidade com compra múltipla |
| Solicitação | `RegistrationRefundRequest`, status `REQUESTED/APPROVED/REJECTED`; controller, autenticação, serviço | Conectar pedido autorizado à transação financeira canônica |
| Organização | Aprovação/recusa com justificativa, listagem e auditoria; UI já integrada | A aprovação precisa permanecer claramente **aguardando processamento** |
| Checkout / pagamentos | `EventRegistrationCheckout` e fluxo Asaas já evoluíram para compras agrupadas | Mapear valor elegível e operação do provedor por pedido ou item, sem dupla devolução |
| Processamento | Nenhuma prova de devolução efetiva/conciliada no fluxo de #491 | Operação persistida, idempotência, gateway, webhooks, retries, reconciliação, parcial, falha e compensação |
| Interfaces | Formulários já presentes; [#680](https://github.com/evolvia-tecnologia/evolvia-platform/pull/680) corrige validações de texto em PR novo | Estados de processamento e recibo do provedor somente depois do backend implementado e homologado |

**Distinção de segurança:** `APPROVED` é decisão administrativa, não prova de dinheiro devolvido. Não marcar `REFUNDED`, não cancelar credencial, não atualizar relatório financeiro e não prometer restituição até confirmação reconciliada e auditável.

## 3. Contrato vertical G2.11 — #679
Responsável pelo processamento financeiro: **Codex**, branch própria **originada de `develop` vivo**; Work faz integração serializada dos arquivos compartilhados, mediante ACK e handoff de patch/commit. Cursor/Claude/Gemini não editam esta frente.

### 3.1 Fluxo de estado recomendado
`REQUESTED` → `APPROVED_PENDING_PROCESSING` (decisão administrativa) → `PROCESSING` (operação de estorno enfileirada) → `SUCCEEDED` **somente após confirmação e conciliação externa**. Falhas transitórias têm estado `RETRY_PENDING` com limite; recusa administrativa `REJECTED`; falha definitiva `FAILED` exige tratamento operacional. A nomenclatura exata deve ser reconciliada com as enums do banco e serviço antes da migration: **não substituir implicitamente os status já utilizados**.

### 3.2 Invariantes financeiros
- Identificar `organizationId`, `eventId`, comprador, reserva, checkout e **ordem de compra múltipla**. O registro de devolução pertence à transação financeira e aos itens elegíveis, não apenas ao identificador isolado de reserva.
- Operação idempotente com chave escopada por transação e parcela, unicidade no banco e inbox de webhook durável; duplicação/replay não gera nova devolução nem duplica saldo.
- Validar teto, centavos, moeda, descontos, split, estornos parciais, valores já restituídos e concorrência com atualizações do gateway; sem cálculo com ponto flutuante.
- Salvar intenção **antes** de qualquer chamada externa; tratar falha parcial com estados/retry/reconciliação e auditoria; evitar efeitos externos dentro da transação do banco de dados.
- Provedor em **sandbox/fake injetável** enquanto não houver credenciais e autorização; verificar autenticação, assinatura e pertencimento do webhook. Nenhuma cobrança/estorno real é autorizada por este documento.
- Proteção `deny-by-default`, política por ator, vínculo estrito de organização/evento, DTO mínimo, logs sem PII/credenciais, não exposição de chaves ou dados do provedor.
- Credenciais de acesso, kits, certificados e benefícios não são revogados por decisão administrativa; política de transição pós-estorno exige confirmação, auditoria e testes.

### 3.3 Entrega verificável
1. Inventário dos modelos de checkout individuais e agrupados, contrato dos pagamentos Asaas e primeiro caso negativo reproduzível.
2. Schema/migration **aditivos**, serviços/contrato de gateway, API, tela de acompanhamento e auditoria; revisão Work prévia para `schema.prisma`, `app.module.ts` e `asaas-checkout.*`.
3. Testes: isolamentos cross-tenant/cross-event, partial/full, double-click/double-webhook, concorrência, queda antes/depois do provedor, cancelamento, retry, uso de centavos e reversão segura. PostgreSQL e HTTP reais; Web; testes ARM64; revisão independente.
4. Evidência de sandbox, conciliação e homologação com dados fictícios. Sem esta evidência, G2.11 continua pendente.
5. Handoff no PR: `PR | HEAD/base | arquivos reservados | testes (comando, quantidade, resultado) | CI | threads/review | riscos/rollback | READY/BLOCKED`.

## 4. Outros critérios financeiros: retirar filas antigas
- **G2.13:** o [#557](https://github.com/evolvia-tecnologia/evolvia-platform/pull/557) foi reconhecido em handoff anterior como candidato legado suplantado pelo serviço relacionado ao [#579](https://github.com/evolvia-tecnologia/evolvia-platform/pull/579), já incorporado. O que permanece é provar **canal, destinatário autorizado, concorrência entre réplicas e recebimento** quando a política de aceite exigir; não duplicar o serviço ou contar e-mail simulado como recebido.
- **G2.14:** [#613](https://github.com/evolvia-tecnologia/evolvia-platform/pull/613) prepara somente política de rascunho `AWAITING_MUNICIPAL_ADAPTER`; não existe emissão NFS-e comprovada. Bloqueios: município do emissor, regime/código de serviço, adaptador/provedor autorizado, ambiente de homologação e persistência de emissão/cancelamento/consulta idempotente. Nenhum XML ou nota pode ser inventado.
- **G2.10:** a compra múltipla exige preservar checkout de pedido agrupado e idempotência já existente; nunca transplantar `asaas-checkout.service.ts` antigo de #491 sobre `develop`.

## 5. Correção de UX segregada — PR #680
O [#680](https://github.com/evolvia-tecnologia/evolvia-platform/pull/680) modifica somente dois componentes de formulários e o teste Web: normaliza e valida justificativa/motivo entre 10–500 caracteres **antes do POST**, bloqueia segundo clique enquanto uma decisão está em curso e testa a ordem do bloqueio. HEAD conhecido após revisão: `870ac0af1c04c62888eb1f8ed0a41d9bbbf01c75`; CI `43877157993` **estava em execução na consulta**, portanto não inferir aprovação/merge ou deploy. Retorno monetário continua fora deste PR.

## 6. Governança EVO-022: menos retrabalho, mais resultado
- **Um dono por branch/path**; compartilhados com ACK explícito e integração serializada pelo Work.
- **WIP máximo de dois PRs críticos em desenvolvimento**, mais uma revisão documental; concluir antes de abrir novo PR.
- **Diagnosticar por blob e diff com `develop` antes de repetir desenvolvimento**. Não tomar histórico de issue como estado presente.
- **Não repetir ordens horárias sem SHA, teste ou bloqueio novo**. Mensagens no GitHub não ligam sessões independentes do Codex, Cursor, Claude ou Gemini.
- Evidência `CI SUCCESS` do HEAD + revisão independente `APPROVED` + threads resolvidas + proteção respeitada precedem merge. Merge precede homologação; homologação precede crédito EVO-018.
- A medição permanece no último baseline auditado: **85/93 critérios de implementação (92,9154%)**, com índice I/T/D/F histórico **69,9707%**, sem Go de produção; estes percentuais são **snapshot anterior**, não nova medição do dia.
- Documentos `PROJECT_STATE.md`, `BACKLOG.md`, `EVOLVIA_MASTER_CODEX.md` e `GATES_STATUS.md/.json` devem ser reconciliados **após o merge do PR documental #677**, sem abrir edições paralelas aos seus arquivos. Esta página preserva o checkpoint e passa a fonte de atualização para o integrador.

## 7. Propriedade intelectual e benchmark científico
Conservar as capacidades aprendidas com Mitte/Even3 como referência de requisitos, **sem cópia de interface/código ou conteúdo proprietário**. Gemini trata G7.4 (cartas com decisão, versão, autorização e entrega ao autor) antes de G6.8 (comunicação em lote com público/consentimento, idempotência, prévia e auditoria), observando [diretriz científica publicada](https://github.com/evolvia-tecnologia/evolvia-platform/issues/641#issuecomment-6917208024). Nenhum desses itens recebe crédito por tarefa atribuída, PR Draft ou simulação sem critérios.

## 8. Segurança, impacto e rollback documental
Esta atualização **não altera API, schema, migration, segredo, fatura, pagamento ou ambiente**. A decisão de fechar #491 refere-se ao PR legado, **não apaga branches nem código**. Reverter esta documentação não altera dados nem runtime. Reverter código futuro requer plano de compensação financeira e preservação de auditoria, não apenas `git revert`. Governança e evidências permanecem rastreáveis pelos links acima.
