# Comunicação do evento — #594

Primeiro recorte: rascunhos persistidos, sem envio. API protegida por AuthGuard e
OWNER/ADMIN/MANAGER da organização do evento; OPERATOR não recebe acesso.
GET /events/:eventId/communication/drafts lista até100 resumos sem corpo;
GET /:draftId abre a versão; PUT /:draftId salva assunto/corpo/expectedRevision.
UUID do cliente preserva identidade após perda de resposta. Revisão otimista
impede sobrescrever outra edição; repetição idêntica da gravação recém-confirmada
retorna a versão sem outra auditoria. Lock na linha Event serializa gravações e o
limite100 entre instâncias. Consultas incluem evento e organização derivados no
servidor. Auditoria armazena somente identificador/revisão, sem conteúdo.

Rota singular /eventos/[id]/painel/comunicacao com menu após Divulgação; rota
legada plural redireciona. Editor rico existente é reutilizado. Ao trocar evento,
o componente remonta e descarta respostas antigas. Campo fica bloqueado durante
gravar/abrir; alterações pendentes bloqueiam abrir outro rascunho. Antes de sair
pelo navegador há aviso; links internos pedem confirmação quando há alterações.
Navegação por código/histórico e o ensaio de navegador ainda exigem validação. Conteúdo não vai para localStorage. Prévia React escapa texto; API recusa
HTML/controles, header injection no assunto, links sem HTTPS e estilos inválidos.

Migration aditiva com FK composta RESTRICT; rollback da aplicação conserva
rascunhos e tabela. Sem apagar conteúdo. Sem alteração de secrets/infra.

Pendências do resultado594: filtros/audiência, SMTP/TLS/SSRF, chave de criptografia
provisionada pelo responsável (ausente hoje), fila e estados incertos/idempotentes,
confirmação e tela simples de resultado real do lote. Nenhum botão de envio ou
credencial insegura foi criado. Não confundir rascunho salvo com e-mail enviado.
Ainda faltam CI Node22/ARM64/PostgreSQL, revisão Gemini, publicação e ensaio
320/390px/teclado da nova tela. Testes locaisAPI7 e navegação8, compilaçãoAPI e
PrismaGenerate aprovados emNode24 como complemento. Sem novo crédito na matriz.


## Prévia dos destinatários — segundo recorte594

API GET /events/:eventId/communication/audience/categories e POST
/events/:eventId/communication/audience/preview com categoryIds/payment/page.
OWNER/ADMIN/MANAGER do próprio evento/org, sem acesso de operador. Público deste
recorte: somente inscrições CONFIRMED. Não presume autores/coautores, comissão
ou expositores inscritos; esses públicos separados continuam pendentes.

Categorias combinam em OU e se cruzam em E com situação financeira. PAID exige
checkout canônico PAID, paidAt e valor positivo no mesmo escopo; ZERO significa
valor final zero confirmado (gratuito/isento), sem alegar pagamento. E-mails usam
normalização existente, rejeitam controles e são deduplicados antes da paginação
50. Contagem informa inscrições, e-mails ausentes e contatos repetidos. Acima de
5000 inscrições correspondentes, API recusa prévia parcial e pede filtros.
Seleção de categoria alheia é recusada antes da leitura de inscrições. API não
retorna CPF, documento, cadastro completo, código de acesso ou dados financeiros.

Prévia é consultiva e não autoriza envio; não persiste público nem dispara
mensagem. Não implementa consentimento de marketing ou supressões, ainda
obrigatórios antes de envio pertinente. A lista deve ser recalculada e congelada
no futuro comando de confirmação. Alterar filtros limpa a prévia e invalida
resposta anterior; troca de evento remonta o componente. Paginação representa
estado vivo, não snapshot de campanha. Sem migration nova. Ensaios reais de
browser/mobile/teclado e integração PostgreSQL do query ainda pendentes.

Testes locais acumulados27 (15API+12Web/harness), compilaçãoAPI aprovada Node24;
CI Node22/ARM64 e Gemini do novo delta obrigatórios. Nenhum incremento na matriz.


## Autores correspondentes — continuidade594

A prévia aceita audience CORRESPONDING_AUTHORS e submissionStatus ALL ou
SUBMITTED/UNDER_REVIEW/ACCEPTED/REJECTED/ACCEPTED_WITH_CHANGES. Exige submittedAt
não nulo; rascunhos/incompletos não entram. Autoria, trabalho e pessoa ativa usam
evento/org no servidor; não exige inscrição do autor nem inclui todos coautores.
Nome usa snapshot da autoria, com fallback para pessoa; e-mail atual da pessoa
usa normalização existente. Mesmo e-mail em vários trabalhos aparece uma vez,
antes da paginação50. Mais5000 autorias correspondentes gera conflito explícito,
sem lista parcial. Categorias/pagamento são incompatíveis com este público;
situação científica não se aplica às inscrições. DTO somente nome/e-mail e
contagens. Troca de público limpa filtros/prévia e descarta resposta antiga.
Não é seleção final nem envio de aviso/carta individual por trabalho; SMTP,
conteúdo por submissão, idempotência de entrega e recebimento continuam pendentes.
Não conclui G5.8/G6.8/G7.4 nem pontua implementação. Sem migration/envio externo.

## Autores e coautores — continuidade594

A opção separada ALL_SCIENTIFIC_AUTHORS usa todas as autorias dos trabalhos
efetivamente submetidos nos estados científicos permitidos, mantendo pessoa
ativa e escopo org/evento em autoria, trabalho e pessoa. Não exige inscrição nem
converte a seleção de correspondentes em seleção de todos silenciosamente.
Nome usa snapshot da autoria; e-mail usa contato atual da pessoa. E-mails ausentes
ou inválidos são contados, e repetidos são agrupados antes de paginar50 contatos.
O limite5000 conta autorias, não pessoas únicas; excedê-lo recusa a lista parcial.
Categorias e situação financeira continuam incompatíveis com os públicos de
autores; filtro por situação científica permanece disponível. A prévia não
congela destinatários nem autoriza envio, não aplica consentimento de marketing
ou supressão e não comprova entrega. SMTP/criptografia/fila continuam pendentes.

Testes focais exercitam consulta/ACL/DTO/teto/deduplicação e interação renderizada.
O teste PostgreSQL usa relações reais sem inscrições, filtra rascunhos e pessoas
inativas, verifica eventos da mesma organização e outra organização/operador.
Toda a fixture desse teste é revertida pela transação, sem apagar dados prévios.
CI Node22/ARM64/PostgreSQL, revisão Gemini e ensaio humano são gates de entrega;
não pontuar branch ou prévia como G5.8/G6.8/G7.4 concluídos.


## Regressão de hidratação que bloqueou607

O buildNext15.5.28 foi ensaiado com HTML fragmentado e dados fictícios. A versão
anterior apresentou React418HTML: ao repetir beginWork do host main após um
filho RSC suspender, o cursor já estava no header interno. Os filhos de main no
catálogo e na página pública usam agora Fragment com chave estável. A chave
impede a remoção automática do fiber Fragment; a reconciliação dos filhos pode
suspender sem repetir a entrada no host main. Nenhum novo nó visual, fallback,
espera global, patch de React, modo client-only ou supressão de erro foi usado.

O ensaio local compilado corrigido passou80 navegações alternando catálogo e
evento com entrega lenta, além de30 cenários no harnessCDP completo. O comando
scripts/validate-public-catalog-hydration.mjs mantém as16 provas nos quatro
viewports e acrescenta30 navegações desktop em loopback, com HTML em128bytes/1ms,
incluindo o evento descoberto. A prova adicional só roda em ambiente HTTP de
loopback; a validação remota existente permanece igual. O artefato original do
catálogo incorpora o resultado streamed, inclusive falhas, e cada erro continua
reprovando o comando. O proxy é ferramenta de ensaio, não servidor da aplicação;
recusa origem remota/credenciais e comandos de escrita, preserva bytesUTF8,
assets/status e fecha conexões. Dois testes focais verificam essas fronteiras.

CI completo, novo teste PostgreSQL e revisão Gemini do novo delta são necessários
antes do merge. Os dados locais são fixtures sem envio real, não homologação
humana nem aceite de Comunicação/SMTP. Não altera percentual da matriz.


Ensaio adicional do componente real em navegador com APIfixture:320/390/1366px,
seleção de autores/coautores pelo teclado, filtroACCEPTED, payload mínimo,
financeiro/categorias bloqueados, contagem e limpeza ao trocar público, sem erroJS.
A320px o seletor financeiro impunha coluna335px e scrollWidth348; a coluna do
card usa minmax(0,1fr) para respeitar o contêiner. Após correção, semoverflow nos
três tamanhos. Prova do componente com fixtures, sem equivaler a jornada
autenticada completa, entrega de e-mail, homologação humana ou F.

Revisão5668925252: o handler de erro do upstream cobre agora também assets,
antes do ramo de passthrough. Interrupção de asset reproduzida: antes, a leitura
só acabava pelo timeout do cliente; depois, conexão encerrada e rejeição imediata.
Terceiro teste do proxy cobre esse aborto sem absorver a falha nem relaxar o gate.

A prova CI40523688395/artefato12744591152 confirmou o catálogo normal e detectou
três418 ainda no evento completo. Fixture local enriquecida reproduziu o host
article sendo retomado com cursor no divmarketplace interno. A apresentação
pública agora também separa seus filhos com Fragment de chave estável; o HTML
visual e os metadados permanecem.80navegações ricas passaram após essa correção.
O harness da composição da programação passou a fornecer o exportReact.Fragment
realmente importado; suas asserções de menu, ordem e doisCTAs foram preservadas
e os dois testes passaram. Essa correção não retira nem relaxa a prova CI que a
revelou; novo CI completo e Gemini ainda exigidos antes de integração.
