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
