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
