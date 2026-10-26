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


## Evidência integrada e histórico paginado — 26/10

#549 e #601 estão integrados/publicados; #601 squash4337c99c, CI40272157015 completo verde e publicação40273335894/job121414197364 com readinessAPI/PostgreSQL/HTTPS200 em26/10 às05:33:23UTC. Isso sustenta G11.2 I/T/D; F continua pendente, sem Go público. Os trechos anteriores descrevem os candidatos nos respectivos instantes históricos.

Este novo delta acrescenta `beforeId` opcional a GET `/:role/batches`, mantendo o array e máximo20 por resposta. O servidor valida UUIDv4 e localiza o cursor no mesmo evento/organização/papel autorizado antes de ler a página. Ordena data desc e id desc; o predicado estrito data menor OU mesma data/id menor evita deslocamento por lotes novos e trata empates. Cursor inexistente/alheio recebe404 sem expor outra organização; formato inválido recebe400. Sem offset, nova entidade ou migration.

O painel oferece Carregar lotes anteriores e Atualizar histórico, anuncia carregamento/contagem e conserva páginas/cursor ao falhar. Bloqueia clique duplo sincronicamente, descarta respostas após trocar papel/evento e mantém PDF por pacote. A paginação de participação continua no contrato anterior de100 pacotes; esta alteração se limita aos cinco papéis científicos. Não pontua o novo delta antes de integração/CI/publicação nem encerra o aceite humano.


## Histórico completo dos pacotes de participação

GET /events/:eventId/certificate/batches preserva o array de até100 pacotes não vazios. O cursor opcional beforeId (UUIDv4) busca pacotes anteriores por createdAt/id decrescentes, incluindo empate de data. O cursor é validado após ACL e deve pertencer ao mesmo evento/org e a um pacote não vazio; chave inexistente/alheia responde404 e formato inválido400. DTO continua somente id, issuedCount, hours e createdAt. Nenhuma migration ou mudança de emissão/PDF.

A tela permite carregar páginas anteriores, preserva páginas e cursor em falha recuperável, impede requisição dupla e descarta resposta de evento desmontado ou atualização superveniente. Atualizar pacotes volta à primeira página após sucesso; falha conserva o histórico já carregado. Esta consulta é sobre pacotes existentes, sem reemissão, e-mail ou cobrança. Rollback da aplicação conserva todos os pacotes. Ensaio de hooks e testes de serviço são complementares ao CI Node22/ARM64/PostgreSQL e não substituem jornada autenticada/mobile/teclado nem aceite humano. Nenhum novo crédito na matriz por este refinamento.
