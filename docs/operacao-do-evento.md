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
um identificador alfanumérico curto, normalizado, sem texto livre. Antes do hash,
converter para maiúsculas e remover somente espaços e hífens de apresentação;
recusar outros caracteres e não aceitar resultado vazio. A chave inclui o tipo
do documento e o país emissor do passaporte, para não juntar números iguais
de países diferentes. Vínculos legados precisam de migração/aliases auditados,
sem fusão automática de identidades.

Provar o documento significa: a pessoa está autenticada pelo e-mail e o
documento entra numa inscrição confirmada dessa conta, ou um e-mail novo pede
a vinculação e a confirmação sai para um e-mail que já estava ligado àquele
documento. Digitar o CPF ou o passaporte de outra pessoa não lista eventos,
não mostra nome e não mostra e-mail.

Uma nova inscrição confirmada, com documento informado pela própria pessoa,
não comprova sozinha a propriedade desse documento nem abre participações
anteriores vinculadas a outra conta. Quando já houver vínculo com outro e-mail,
a confirmação vai apenas ao último endereço cujo vínculo tenha sido
explicitamente verificado; não escolher um endereço apenas porque recebeu
uma inscrição. Se não houver endereço verificado acessível, usar recuperação
assistida com prova independente, finalidade e auditoria, sem revelar o
histórico antes da confirmação e sem conceder acesso ao operador de portaria.
Essa recuperação é requisito futuro, não funcionalidade entregue.

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

Correções de check-in/presença ou material lançado por engano usam estorno
lógico por equipe autorizada, com motivo, ator e data/hora. Preservar o registro
original e a referência do estorno na auditoria; não apagar a evidência. A
presença usada por relatórios/certificados considera apenas fatos ativos.
Esse estorno não altera pagamento nem libera reutilização de ingresso sem a
política de acesso correspondente.

O totem já existe e não é refeito. Ele encontra a inscrição por QR Code, CPF
ou e-mail, e também pelo número da inscrição quando o organizador liga essa
busca. A pessoa confirma nome, categoria e empresa antes da impressão. Sair
não registra a entrada. Imprimir faz o check-in e abre a etiqueta. Presença
do dia é o acréscimo desta fatia, no mesmo posto.

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
presença, submissões nem arquivos. Limpar também as referências a logo, capa,
fundo de certificado e outros EventMediaAsset do evento de origem; o novo evento
usa o nome/fallback e mostra a pendência até novo upload autorizado. Não manter
IDs de mídia do outro evento nem URLs de arquivo privado.

### 8. Link oculto e troca de categoria

Resultado: um evento pode ficar acessível só por link, fora da vitrine. A
organização troca a categoria de uma inscrição do próprio evento quando a pessoa
entrou na categoria errada, com auditoria e sem alterar pagamento já confirmado
em silêncio. No primeiro corte, inscrição com pagamento confirmado só troca
para categoria cujo preço final recalculado seja igual ao valor efetivamente
pago, preservando o snapshot financeiro e auditando a mudança. Diferença de
valor bloqueia a troca até existir um fluxo explícito de ajuste/reembolso;
não converter a diferença em cortesia ou desconto automaticamente.

### 9. Avisos por e-mail

Resultado: a organização avisa uma pessoa ou um grupo do próprio evento, por
e-mail, com o nome e os dados já autorizados da ficha. O filtro usa categoria,
situação da inscrição, presença ou resultado científico. Serve para mudança de
horário, cancelamento e recado individual. WhatsApp não é canal. O envio não
revela a lista de outro evento.

### 10. Prazo com hora, lote visível e fila

Resultado: a página pública mostra e respeita o instante de abertura e de
encerramento da inscrição e da submissão, não só o dia. A organização escolhe
se a página mostra só o lote atual e as vagas restantes, ou a escada de preços.
Quando a vaga acaba, a pessoa pode entrar numa fila de espera daquele lote ou
daquela atividade, sem inscrição confirmada e sem pagamento.

A compra tem um tempo para ser concluída. O padrão é 15 minutos e a
organização pode alterar esse número. A ficha continua pedida uma vez por
participante. A organização pode passar a pedir a ficha uma vez por comprador,
quando uma pessoa leva mais de uma entrada. O botão público já diz inscrição,
ingresso ou convite conforme o evento. Contribuição não vira um tipo novo de
pagamento.

### 11. Científico operacional

Resultado: completar o científico já existente, sem recriar a estrutura. A
organização distribui trabalhos, define critério eliminatório e depois
classificatório, recebe nota digitada, retoma um parecer sem zerar a banca e
avisa o avaliador. Baixa os arquivos de uma vez. Resumo e relatório podem ser
arquivos separados. Cabe uma segunda versão e o slide depois da aprovação.
Todo arquivo novo segue a leitura passiva de PDF: o servidor grava e devolve
os bytes, não executa o arquivo.

A configuração que ainda faltava fica no processo de submissão, sem um segundo
modelo. Cada forma de apresentação liga submissão e avaliação em separado. O
autor sugere a forma só quando a organização pede. Os campos opcionais são
nome científico, endereço da instituição, agência de fomento, conflito de
interesse e referências. O resumo conta caracteres ou palavras, com mínimo e
máximo. A autorização dos anais tem texto em português e aceite do autor;
espanhol e inglês são opcionais. A organização define apresentadores por
trabalho, avaliadores por trabalho, nota única de 0 a 10 ou critérios com peso,
e se só o coordenador fecha aceite ou recusa. O prazo do e-pôster depois do
aceite fica registrado; o arquivo continua passivo. A autorização é o texto que
o autor aceita; ela não publica anais nem DOI. A estação científica é outra
coisa: o organizador liga, em cada trabalho aprovado, o resumo, o e-poster ou
os dois. O link público fica na área dele e pode ir para o totem. Login por CPF, senha de
avaliador à vista e upload de vídeo ficam de fora.

No mesmo processo, sem taxa de submissão e sem vender anais: quem precisa
estar inscrito para enviar (ninguém, o autor principal, ao menos um autor ou
todos), o limite de envios de uma pessoa ou de vínculos dela, a modalidade
que pode ficar oculta, a carta de aceite e a aprovação com ressalvas. A
quantidade de avaliações necessárias para decidir o trabalho é outro número,
diferente do teto de avaliadores.

O rascunho #411, ainda não integrado, cobre coautoria no envio, parecer por
link de uso único, decisão explícita da organização e ePoster em PDF passivo
depois do aceite. No gate de trabalhos, o organizador define o mínimo de um
autor (só quem envia a inscrição), a quantidade de caracteres do título, a
quantidade do resumo em caracteres ou palavras, área ou área e subárea, as
modalidades de submissão e se pede outros autores, ordem e instituição.
Continuam neste contrato: critério eliminatório e
classificatório, retomada do parecer, aviso ao avaliador, download em lote,
resumo e relatório como arquivos separados, segunda versão e slide, a regra de
quem mais precisa estar inscrito, modalidade oculta, carta de aceite e o mínimo
de pareceres distinto do teto de avaliadores.

### 12. Programação na página pública

Resultado: a página do evento mostra dias, horários, salas e quem apresenta,
com foto e função quando a organização publicar. A pessoa autenticada vê a
própria agenda. Link de rede social do palestrante fica de fora.

### 13. Certificado

Resultado: depois da presença da fatia 4, a organização emite certificado só
para quem teve presença registrada ou papel científico confirmado. Os campos
saem dos dados do evento e da pessoa, inclusive carga horária, autor e coautor.
O verso é opcional. O download não é cobrado. Até esta fatia existir, a ajuda
pública continua dizendo que o certificado automático não é emitido.

Os papéis são participação, atividade, convidado, submissão aprovada,
apresentação e avaliador. A liberação é manual ou automática alguns dias
depois do fim do evento. Cada papel começa desligado.

### 14. Reembolso visível e cupom em quantidade

Resultado: a regra de reembolso aparece antes do pagamento. As janelas são:
em nenhum momento, até 30 dias antes do início, até 7 dias, até 1 dia, ou a
qualquer momento. Cupom pode ser gerado em quantidade, para um patrocinador, e
pode valer para uma atividade quando a atividade é vendida à parte. O cupom
não vira desconto silencioso fora da regra já configurada. Esta fatia não
dispara estorno sozinha enquanto a cobrança real estiver desligada.

### 15. Transmissão

Resultado: o evento guarda um link https de videoconferência, vídeo ao vivo
ou gravação. Só a inscrição confirmada vê esse link, na área do participante.
A página pública não mostra o endereço. Não há upload de arquivo, player com
comentário nem página externa incorporada.

Se esse link único do evento já estiver em `develop`, o Orquestrador não cria
outro modelo. A continuação, no mesmo formato, é um link por atividade, também
só para inscrição confirmada.

### 16. Credenciamento que ainda falta

Resultado: o posto já reúne os endereços do credenciamento deste evento:
posto da equipe, navegador do celular, leitor de QR, lista de etiquetas,
relatório, impressão da lista, sorteio entre confirmados e totem. O
Orquestrador não cria outro painel nem outro sorteio para esses endereços.

O totem estável já confirma os dados antes de imprimir: a logo da Divulgação
e o nome do evento à esquerda, uma busca por vez, CPF mascarado, teclado de e-mail, QR
mascarado no mesmo campo do código de barras, número da inscrição opcional,
Sair sem check-in e reimpressão quando a entrada já existia. O Orquestrador
não recria essa tela.

O link com validade também já está no mesmo painel, ao lado do endereço
estável. O organizador escolhe 1, 7 ou 30 dias, ou uma data entre 30 minutos
e 90 dias. O endereço completo só aparece na hora em que é gerado. Gerar
outro encerra o anterior. Encerrar corta o acesso na hora. A página estável
continua. O que fica guardado é o resumo da validade, não o segredo do
endereço. O Orquestrador não recria esse link.

Presença por dia continua na fatia 4. Aplicativo para instalar continua de
fora: o celular usa o endereço do posto no navegador.

### 17. Área do expositor

Resultado: com a capacidade de expositor ligada, o menu Expositor e serviços
em `/eventos/{id}/painel/expositores` é onde a organização cria o que a
empresa e o prestador veem. Inclui expositor ou prestador, consulta cadastros
e credenciais, configura formulários, cadastra produtos dentro de um
formulário de solicitação, publica arquivos, acompanha o financeiro e exporta
os pedidos de cada público.

Cada formulário tem ordenação, descrição, público (expositor, prestador ou
ambos), tipo (credencial, solicitação ou documento), ativo, obrigatório e
prazo. PDF e Word são links https. O servidor não recebe o arquivo.

A área da empresa fica em `/evento/{slug}/expositor` e só abre com o evento
publicado. Ela mostra os formulários ativos daquele público. Fora do prazo, a
empresa vê o formulário e não envia novo pedido nem nova credencial. A entrada
usa o e-mail de acesso e o documento da empresa. Representante entra com o
próprio e-mail e o mesmo documento. Senha de expositor não entra no modelo. E-mail e documento identificam a empresa,
mas não comprovam a posse do e-mail. Antes de integrar a área, a sessão precisa
comprovar essa posse ou usar identidade de conta já verificada, sem senha
compartilhada de expositor. O #408 continua bloqueado até essa prova e seus
testes negativos.

A empresa atualiza contato e endereço, inclui representante, lança credencial
dentro da cota quando o formulário de credencial está aberto e solicita
produto no formulário de solicitação. Documento, cota e e-mail de acesso
permanecem com a organização. Credenciado e impresso só a equipe marca. O
pedido nasce solicitado; a organização confirma ou cancela. Não emite boleto
nem usa gateway.

Este modelo já está no rascunho #408. O Orquestrador não cria outro menu, outro
formulário de expositor, outra senha de estande nem upload nesta área.

## Regras que atravessam as fatias

- O posto da fatia 4 funciona no navegador do celular. Não há aplicativo nativo.
- O nome do crachá continua separado do nome civil.
- A ficha já tem lista, escolha única e múltipla escolha. Não recriar esses tipos.
- Meia-entrada continua categoria mais comprovante, opcional ou exigido antes do pagamento.
- Campo aberto de formulário continua sem injection. Arquivo recebido continua sem execução.

## Fora de escopo

Doação como tipo de entrada, marcação de assento, anais, DOI, WhatsApp como
aviso padrão, aplicativo nativo do organizador, upload de vídeo, comentário na
transmissão, senha compartilhada do evento, senha de expositor, boleto da
central do expositor, upload na área do expositor, taxa para baixar certificado, taxa
percentual sobre inscrição, relógio de escassez, base única de participantes da
organização entre eventos, inscrição em grupo como módulo, permissão menu a
menu, captcha e qualquer mudança de senha de conta de teste.
Quantidade de acompanhantes e o que cada pessoa leva cabem na ficha e na
exportação da fatia 2.

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
