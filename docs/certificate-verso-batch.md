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


## Extensão dos cinco papéis científicos — candidato de 26/10

A mesma branch de resultado é retomada pelo Codex após #549, baseada emdevelopfcb089cd. Não há execução Cursor. Cada configuração de papel recebe `back` opcional; PUT antigo sem o campo preserva o valor, null/vazio remove apenas do modelo futuro. Tags/formatação são validadas pelo papel. A transação de emissão relê configuração e elegibilidade e congela snapshotBackBody com frente/evento/horas. Emissões legadas ou sem verso arquivado não recebem verso retroativo. Consulta pública e PDF usam o mesmo retrato.

POST `/events/:eventId/certificate-roles/:role/issue` aceita `{batchId: UUIDv4}` para um lote auditável. Mesmo identificador no mesmo evento/organização/papel recupera o resultado original, inclusive vazio e após desligar o modelo, sem reemitir/auditar novamente. Clientes anteriores sem corpo continuam o fluxo existente. Novo lote exige nova chave; o navegador retém a chave após erro e bloqueia clique duplo. A seleção é automática no servidor e limitada a40 elegíveis; não aceita destinatários ou horas do cliente. Revalidação serializável e unicidade abortam corridas; repetir a mesma chave recupera o vencedor. Pacote, certificados e auditoria são atômicos; DTO/auditoria não expõem e-mails, documentos ou textos.

GET `/:role/batches` lista os20 lotes recentes com contagens/identificador/data. GET `/:role/batches/:batchId/pdf` exige ACL e escopo composto, lê apenas os certificados daquele lote e rejeita retrato incompleto/divergência de contagem em vez de truncar ou usar modelo atual. Lotes vazios são recuperáveis, sem PDF vazio. PDFs conservam estilos/Unicode e verso em página separada pelo renderizador existente. Histórico anterior ao novo contrato mantém acesso individual pelo código; não é inventado lote retroativo. Paginação além dos20 pacotes recentes permanece uma limitação explícita.

Migração20261026040000 somente expande: verso nullable em configuração/snapshot, nova tabela de lote e FK composta por identificador/evento/organização/papel, checks de contagem0..40 e snapshot de verso completo. Rollback: reverter aplicação preservando tabela, colunas e históricos; sem DROP/backfill. Testes de serviço, editor/retry e PostgreSQL descartável incluem duas conexões no mesmo pedido, ACL/papel/tenant, legado, modelo alterado e invariância do PDF. Validação local é complementar Node24; Node22, PostgreSQL/migrations, Web/ARM64 e Gemini dependem do CI do SHA candidato. Não conta G11.2 como concluído antes da evidência restante de integração/publicação/homologação/aceite.
