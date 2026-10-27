# Relatórios agregados para BI — versão 1

Direção do PO em26/10: API somente leitura e Relatórios por assunto. Este corte
não configura contas, credenciais, gateway ou atualização agendada no PowerBI.

## Contrato HTTP

`GET /events/:eventId/registration-form/post-event-report/bi`

Na homologação, o prefixo público é `/api`. Autenticação somente pelo cabeçalho
`Authorization: Bearer <TOKEN_DA_SESSAO>`. Nunca colocar token em URL, parâmetro,
arquivo compartilhado ou relatório público. A sessão existente mantém a sua
expiração; este endpoint não emite token nem amplia permissões.

Apenas OWNER/ADMIN/MANAGER da organização do evento. OPERATOR e outra
organização não consultam o relatório. O leitor existente autoriza antes de
consultar fontes e usa o mesmo snapshot RepeatableRead, filtros de organização
e evento e teto de50mil registros. Não há escrita, publicação ou envio externo.
`Cache-Control: private, no-store` evita reutilização por cache compartilhado.

## Resposta JSON

`schemaVersion: 1`, `eventId`, `generatedAt` (UTC), `timeZone` e `rows`.
Cada linha possui `metric`, `dimension` (texto fixo/data ou null), `value`
(inteiro não negativo) e `unit` (`count` ou `BRL_cents`). O cliente deve verificar
a versão e usar as unidades; valores monetários não são reais decimais.

| Métricas | Condição e interpretação |
| --- | --- |
| registration.confirmed | Inscrições confirmadas; reservas incompletas não são inscritos |
| reservation.pending/expired/cancelled | Reservas em populações separadas |
| attendance.present/absent/first_by_day | Credenciamento habilitado; primeiro check-in, sem comprovar permanência |
| payment.paid/exempt/review/unverified | Pagamento habilitado; contagens por situação |
| payment.received/registration.confirmed_price | Centavos recebidos e preço confirmado, sem equivaler a receita líquida |
| visits.total/by_day | Aberturas aceitas, sem identificar visitantes únicos |
| scientific.submissions/planned_activities | Científico habilitado; estado registrado e atividades planejadas |

Módulo desabilitado é omitido; ausência de métrica não significa zero. A versão
1 exclui nomes, contatos, documentos, IDs de pessoas/inscrições, categorias,
respostas da ficha e rótulos personalizados. Dimensões científicas usam enums
permitidos e dimensões de visitas/presença usam datas, sem texto livre.

Um cliente BI pode ler `rows` como tabela JSON usando o cabeçalho autorizado.
A conexão efetiva no PowerBI, renovação da sessão e atualização agendada exigem
ensaio separado; não estão comprovadas por teste local ou CI deste endpoint.

## Navegação e rollback

O catálogo de Relatórios usa assuntos recolhíveis nativos. O assunto selecionado
abre inicialmente; a busca abre os resultados e não altera a seleção/exportação.
A abertura manual é preservada por relatório e termo de busca, inclusive durante
a busca, sem impedir o uso do teclado no controle nativo.
Links dos módulos continuam sujeitos às próprias permissões. CSV e impressão
existentes permanecem. Teclado/leitor de tela/mobile exigem ensaio humano.

Sem schema, migration ou alteração de autenticação. Reverter o código remove a
projeção BI e restaura o catálogo anterior, preservando todos os dados de origem.
