# Certificado de participação: verso e pacotes — #549

Continua a branch entregue ec5112de, reconciliada com develop e07ac256,
sem apagar os snapshots de #597 ou os estilos de #596. Codex assumiu a edição;
Gemini revisa o delta novo. Não altera os demais papéis científicos.

O organizador configura verso opcional com as mesmas tags e estilos do corpo.
PUT antigo sem campo back preserva o verso; null/blank remove somente o modelo
futuro. Cada emissão nova congela frente, verso, nome do evento, horas e arte.
Emissões sem verso arquivado continuam sem verso; não há backfill histórico.
A consulta Web e o PDF mostram o verso em página separada, com código original.

POST /events/:eventId/certificate/batches exige OWNER/ADMIN/MANAGER e comando
{requestId: UUIDv4, expectedRevision, afterId: string|null}. A identidade é
retida no navegador ao perder resposta. Mesma chave/seleção recupera o resultado;
chave reutilizada com seleção/revisão diferente recebe409. Liberação/revisão,
organização e evento são conferidos no servidor. Seleciona até400 inscrições
confirmadas com presença não revertida e sem certificado; emite no máximo40.
Locks e segunda consulta revalidam inscrição/presença antes da gravação. Lote e
certificados são atômicos; concorrência única aborta e pode ser repetida com a
mesma chave. O cursor avança também sobre nomes inválidos, impedindo que a
primeira janela inválida bloqueie pessoas posteriores. Depois de corrigir nomes
pulados, reinicie pela primeira janela (reabrir configuração).

Um resultado vazio guarda apenas a identidade/contagens do pedido para retry,
sem certificado nem auditLog de emissão. Resultados não vazios auditam somente
contagens/horas, ator e escopo. Sem e-mail/documento/nomes em auditoria.
Migração aditiva, FK composta no pacote e checks de contagem/horas; preserva dados
em rollback da aplicação. Não remover a tabela nem os snapshots.

GET /batches lista no máximo100 pacotes não vazios mais recentes (DTO mínimo),
e GET /batches/:batchId/pdf baixa apenas as segundas vias daquele pacote. O painel
oferece atualização e download de cada pacote. Leitura mantém a ACL de
segundas vias do módulo existente; emissão permanece restrita à edição.
O PDF existente /batch continua limitado aos primeiros40 do evento.

Validação local: API compilada e48 testes focais, incluindo extração Poppler do
verso e harness de serviço; Web4 testes, incluindo clique duplo/erro/retry/cursor.
Três testes PostgreSQL novos aguardam CI. Harness não prova navegador, banco ou
concorrência real. CI Node22/ARM64, revisão Gemini e ensaio autenticado320/390px,
teclado e impressora pendentes. Não declara G11.2 completo: pacotes/versos dos
papéis científicos, paginação histórica além100, homologação e aceite permanecem
pendentes. Sem crédito novo na matriz, envio real, main/produção/infra/secrets.

A migration20261026011000 valida snapshotBackBody somente depois da criação do
snapshot20261025170000. A validação foi separada da expansão legada para manter
a instalação limpa ordenada e a atualização de bancos existentes.
