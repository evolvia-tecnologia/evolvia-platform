# Handoff — quórum da decisão científica

Data: 05/10/2026. Contrato: PR #411.
Base de integração conferida: develop@dbb150ec2aceafc210e6f3bd7b8e2c9f5a6c8e67.
Dependência funcional: #411@eb9d5826a78d5f730dc7b478bd4210d4bf963187.
Branch isolada baseada no candidato científico para não reescrever a branch ativa.
Aplicar apenas o commit de três arquivos após conferir o HEAD vivo; não substituir a árvore inteira.

A decisão exige reviewersPerSubmission pareceres SUBMITTED+CLEAR do próprio organizationId/eventId/submissionId. Campo nulo legado conserva mínimo um. Configuração inválida bloqueia a decisão. Coordenador continua obrigatório quando configurado.
Estado do evento/trabalho, configuração, contagem, coordenador, atualização e auditoria participam de uma transação Serializable. Escrita condicionada ao estado/escopo impede sobrescrever decisão concorrente. P2034 retorna 409 para nova tentativa explícita, sem sucesso aparente ou retry silencioso.
Auditoria inclui somente estado e contagens, sem identidade dos pareceres.

Validação local: 11/11 testes de serviço real transpileado com Prisma/Nest reais e banco substituído, Node24. Cobertura: quórum 1/2, nulo, configuração inválida, filtros de status/conflito/escopo, coordenador, corrida de estado, falha de auditoria, P2034 e cancelamento de evento.
Esta prova não substitui CI Node22, PostgreSQL real/concorrência, ARM64 ou ensaio autenticado em homologação.
Sem schema/migration ou alteração dos arquivos científicos. Rollback por reversão do commit preserva dados e PDFs.

O runtime /eventos continua sendo tratado no PR #411. Não integrar enquanto checks/revisão do candidato final estiverem pendentes. Sem percentuais por código em branch, sem encerramento de Gate, sem main/produção.
