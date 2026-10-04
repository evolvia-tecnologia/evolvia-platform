# Operação do evento — contrato para o Orquestrador

Direção aceita pelo Product Owner em 04/10/2026. Este arquivo manda incorporar.
Não descreve código já entregue. `main` e produção continuam sem promoção.

Base verificada ao registrar o contrato: `develop` em
`9fd1aa2b0915519e79f6e0428b950066c17904e6`. Antes de implementar, confira o
`develop` vivo e reaproveite inscrição, ficha, lote, credenciamento, científico
e divulgação que já existirem.

## Decisão de identidade

O login continua pelo e-mail da conta `User`. CPF ou passaporte não autentica.

CPF ou passaporte é a chave do histórico de eventos em que a própria pessoa
participou. Hoje `ParticipantIdentityLink` é único em
`(identityHash, emailHash)`. Esse par parte o histórico quando o e-mail muda.
A fatia 1 troca essa regra: o mesmo documento, já provado, permanece o mesmo
histórico em outro e-mail.

A ficha já trava `identity_document`. A fatia 1 deixa de tratar documento
estrangeiro genérico e passa a pedir uma escolha explícita: CPF ou passaporte.
CPF de 11 dígitos continua com os dígitos verificadores. Passaporte aceita só
um identificador alfanumérico curto, normalizado, sem texto livre.

Provar o documento significa: a pessoa está autenticada pelo e-mail e o
documento entra numa inscrição confirmada dessa conta, ou um e-mail novo pede
a vinculação e a confirmação sai para um e-mail que já estava ligado àquele
documento. Digitar o CPF ou o passaporte de outra pessoa não lista eventos,
não mostra nome e não mostra e-mail.

O histórico da pessoa separa dois fatos: inscrição confirmada e presença
registrada. A organização de um evento vê os inscritos e a presença daquele
evento. Não vê os outros eventos daquele documento, nem de outra organização.

O documento completo aparece para a própria pessoa na área dela e para o
credenciamento daquele evento. Log, auditoria e exportação de outra
organização guardam no máximo um identificador mascarado. O hash não volta a
ser o documento.

## Fatias

Cada fatia nasce em branch isolada, com tela, API, banco e testes. Não antecipa
a seguinte. Isolamento por `organizationId` e `eventId`, auditoria, idempotência,
migration aditiva e rollback. Interface em português e WCAG 2.2 AA.

### 1. Histórico por CPF ou passaporte

Resultado: a pessoa autenticada vê os eventos em que aquele documento
participou, mesmo depois de trocar o e-mail, e só depois da prova descrita acima.

### 2. Pessoas e exportação

Resultado: no evento, a organização abre a lista operacional de inscritos e
exporta uma planilha daquele evento. Cada campo da ficha é uma coluna e cada
inscrito é uma linha. A exportação não inclui outro evento nem o histórico
pessoal do documento.

### 3. Relatórios do evento

Resultado: um lugar só mostra, daquele evento, visitas da página em quantidade
agregada, inscritos, submissões, vendas no período e quanto já foi recebido.
Não há perfil nominativo de visitante. Não há repasse de saldo, antecipação nem
pagamento de fornecedor.

### 4. Presença por dia e por atividade

Resultado: o posto registra presença geral, presença do dia, presença na
atividade e entrega de material. Uma leitura de QR já usada nesse mesmo fato
não conta de novo. Certificado futuro só poderá usar presença ou papel
científico confirmado. Esta fatia não emite certificado.

### 5. Inscrição na atividade

Resultado: inscrever-se no evento e inscrever-se numa atividade são passos
separados. A atividade tem vaga, cortesia, limite de quantas a pessoa pode
pegar e bloqueio de horário coincidente. A pessoa pode indicar preferência. Quem
confirma o horário é a organização.

### 6. Avaliação do evento

Resultado: a organização publica um questionário, a pessoa responde, e a
organização exporta as respostas daquele evento. Exigir a resposta antes de um
futuro certificado é opção desligada por padrão. Esta fatia não emite
certificado e não cobra download.

### 7. Clonar evento

Resultado: a organização copia categorias, lotes, ficha, programação e o modelo
de certificado, e informa as novas datas. A cópia não leva inscritos, pagamentos,
presença, submissões nem arquivos.

### 8. Link oculto e troca de categoria

Resultado: um evento pode ficar acessível só por link, fora da vitrine. A
organização troca a categoria de uma inscrição do próprio evento quando a pessoa
entrou na categoria errada, com auditoria e sem alterar pagamento já confirmado
em silêncio.

## Fora de escopo

Doação como tipo de entrada, marcação de assento, transmissão, anais, DOI,
WhatsApp como aviso padrão, aplicativo nativo do organizador, taxa para baixar
certificado, taxa percentual sobre inscrição, relógio de escassez, base única de
participantes da organização entre eventos e qualquer mudança de senha de conta
de teste.

Meia-entrada não vira módulo. Continua categoria mais comprovante, opcional ou
exigido antes do pagamento. O lote já guarda instante de abertura e
encerramento. A página pública deve mostrar e respeitar esse horário. Isso se
corrige na fatia de inscrição se o `develop` vivo ainda mostrar só o dia.

## Aceite de cada fatia

- O critério da fatia acima acontece na tela e na API.
- Outra organização e outro evento não leem o dado.
- Documento alheio não abre histórico.
- Testes cobrem o caso feliz e o vazamento recusado.
- `tsc` e os testes do módulo passam no HEAD da fatia.
- O PR fica em rascunho, sem merge e sem deploy, até o Product Owner pedir o contrário.

## Rollback

Cada fatia usa migration aditiva. Desligar a fatia devolve a leitura anterior
sem apagar inscrição, presença, arquivo nem pagamento já gravados.
