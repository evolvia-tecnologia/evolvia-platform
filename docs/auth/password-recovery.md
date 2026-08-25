# Recuperação segura de senha

Este documento registra o contrato incremental da issue #40. A recuperação é
uma frente transversal de autenticação e não altera a sequência funcional 1→11
nem autoriza iniciar a Fase 2.

## Primeiro corte: fundação não exposta

O primeiro corte cria somente primitivas e persistência:

- token opaco com 256 bits de entropia, codificado em Base64 URL-safe;
- persistência exclusiva do hash SHA-256, nunca do token puro;
- expiração inicial de 30 minutos;
- estados verificáveis de ativo, expirado, consumido e revogado;
- migration expansiva com rollback da aplicação: versões anteriores ignoram a
  nova tabela;
- relação do token com a identidade, sem depender de organização ou evento para
  descobrir uma conta.

Nenhuma rota pública, CTA ou envio é habilitado neste corte. Isso impede que uma
interface decorativa prometa uma entrega ainda inexistente.

## Contrato do lote funcional

Antes de expor `POST /auth/password/forgot` e
`POST /auth/password/reset`, o mesmo PR deve comprovar:

1. resposta pública equivalente para conta existente e inexistente;
2. rate limit por origem e identificador normalizado sem armazenar dado pessoal
   em claro;
3. revogação de tokens anteriores e consumo atômico, protegendo concorrência e
   reuso;
4. aplicação da política central de senha e hash bcrypt vigente;
5. auditoria sanitizada sem token, hash, e-mail ou dado organizacional;
6. transporte real por abstração independente de fornecedor, com remetente e
   URL-base HTTPS configurados por ambiente;
7. falha explícita e observável quando o transporte estiver indisponível, sem
   retornar token ao cliente;
8. teste de entrega em homologação e evidência do SHA exato;
9. invalidação de sessões existentes quando a arquitetura suportar; enquanto
   isso não existir, a limitação permanece documentada e bloqueia conclusão.

A UI acessível em português só entra após o contrato backend existir. Deve
cobrir vazio, carregamento, sucesso genérico, erro recuperável, token expirado e
token já usado, além de teclado, foco, leitor de tela, contraste e reflow.

## Segurança e minimização

- EVA pode orientar, mas nunca recebe senha ou token e não redefine credenciais.
- O endpoint público não aceita `organizationId` nem `eventId`; a identidade
  é localizada apenas pelo e-mail normalizado e nenhuma associação é retornada.
- Token, hash e endereço não entram em logs, mensagens de erro, analytics ou
  metadados de auditoria.
- O token puro existe apenas durante geração e montagem da mensagem.
- O DTO público de solicitação contém somente o e-mail; o de redefinição contém
  somente token e nova senha.

## Rollback

Antes de qualquer uso funcional, o rollback da aplicação consiste em reverter o
commit: a tabela nova permanece inerte e pode ser removida apenas em uma
migration restritiva posterior, depois de validar que não contém evidência útil.
Não há migration destrutiva neste corte.

## Serviço de solicitação não exposto

A camada de aplicação usa portas explícitas para persistência, rate limit,
entrega, auditoria e diagnóstico. Antes de consultar a identidade, aplica rate
limit com uma chave HMAC do e-mail normalizado e um pepper exclusivo do
ambiente. O endereço não é usado como chave em claro.

A busca retorna somente identidades elegíveis com e-mail já verificado. O estado
canônico `User.emailVerifiedAt` é opcional e foi introduzido por migration
expansiva: contas existentes continuam não verificadas até uma confirmação real
da issue #42. O adaptador consulta apenas `id`, `email` e
`emailVerifiedAt`, retorna DTO mínimo e nega elegibilidade quando o estado está
ausente. Nenhuma rota deve ser registrada antes do restante do contrato funcional.

Conta elegível, conta inexistente e falhas operacionais posteriores à consulta
recebem a mesma mensagem pública. Falhas de persistência ou entrega geram
diagnóstico sem dado pessoal; uma entrega falha revoga o token recém-criado.
Auditoria recebe somente ação, resultado e identificador interno do usuário,
nunca endereço, token, hash, organização ou evento.

A origem recebida pelo serviço deve ser uma chave sanitizada produzida por
middleware confiável, considerando a configuração real de proxy. IP bruto não
deve entrar em auditoria ou logs de negócio.

## Adaptador Prisma não exposto

O adaptador Prisma está registrado no contêiner da API, mas nenhuma rota o
consome. A elegibilidade permanece deny-by-default e não consulta usuários
enquanto a issue #42 não fornecer um estado canônico de e-mail verificado.

A substituição revoga todos os tokens não consumidos e não revogados do usuário
e cria o novo hash na mesma transação com isolamento serializável. Conflitos
`P2034` recebem no máximo três tentativas determinísticas; qualquer outra
falha é propagada para a camada anti-enumeração.

A migration possui índice único parcial por usuário para permitir no máximo um
token não resolvido. Tokens expirados são revogados durante a próxima
substituição, preservando histórico sem abrir uma janela concorrente. A
revogação após falha de entrega é idempotente e não altera tokens consumidos ou
já revogados.

## Rate limit persistente ainda não exposto

O adaptador Prisma usa buckets de 15 minutos separados por origem e identidade,
com limites iniciais de cinco e três solicitações. As duas dimensões são
verificadas e incrementadas na mesma transação serializável; conflito `P2034`
recebe no máximo três tentativas. Se qualquer limite estiver esgotado, nenhuma
dimensão é incrementada.

A tabela armazena somente HMAC SHA-256. Endereço IP e e-mail nunca são
persistidos. Buckets expirados são removidos oportunisticamente por índice de
expiração. Checks de banco restringem dimensões conhecidas e contagem positiva.

A origem é resolvida a partir do socket. `X-Forwarded-For` só é considerado
quando o proxy imediatamente conectado pertence à lista explícita de endereços
confiáveis; a cadeia é percorrida até a primeira origem não confiável. A chave
resultante é HMAC com pepper exclusivo. O futuro endpoint deverá fornecer essa
configuração por ambiente e não poderá habilitar confiança irrestrita em proxy.


## Auditoria persistente e diagnóstico operacional ainda não expostos

A solicitação usa uma tabela de auditoria própria do fluxo público, pois o
`AuditLog` de domínio exige `organizationId` e não pode receber um escopo
inventado. Cada evento persiste somente a ação fixa, o resultado e, quando a
conta é elegível, o identificador interno opcional do usuário. Exclusões de
conta preservam a evidência e anulam essa referência. E-mail, token, hash,
origem, organização, evento e metadados livres não fazem parte do modelo.

Falhas operacionais em lookup, persistência, entrega, revogação ou auditoria
emitem apenas um código de evento constante e o estágio enumerado. O
diagnóstico não recebe exceção, endereço, identidade ou segredo, e nunca altera
a resposta pública anti-enumeração. Os adaptadores estão registrados no
contêiner, mas permanecem sem rota consumidora até o transporte real e o wiring
completo serem comprovados.


## Consumo atômico do token ainda não exposto

O serviço interno de redefinição reutiliza a política central de senha e o
bcrypt com custo 12. O token opaco é validado pelo formato e convertido em
SHA-256 antes de alcançar a persistência; token e senha em claro não entram no
store, auditoria, diagnóstico ou mensagens de erro.

O adaptador Prisma localiza e consome o token, atualiza o hash da senha e grava
a auditoria `password_recovery.reset / RESET_COMPLETED` dentro da mesma
transação serializável. A atualização condicional protege contra corrida e
reuso; token ausente, expirado, revogado ou consumido produz a mesma rejeição
pública. Conflitos `P2034` recebem no máximo três tentativas.

Rejeições são auditadas sem usuário, token, hash ou motivo específico. Falhas de
hash ou persistência produzem apenas operação e estágio enumerados. O serviço e
o adaptador estão registrados como fundação interna, mas nenhuma rota ou UI é
exposta neste corte. A revogação de sessões existentes continua pendente até a
arquitetura de sessões suportá-la e permanece bloqueadora da conclusão da issue.

## Emissão revogável e confirmação atômica ainda não expostas

O estado canônico de verificação agora possui persistência própria para tokens opacos. A migration expansiva cria `EmailVerificationToken`, armazena somente SHA-256, mantém expiração, consumo e revogação, e limita cada usuário a um token não resolvido. Não existe backfill: contas antigas continuam não verificadas.

A emissão interna recusa conta ausente ou já verificada, revoga tokens anteriores e cria o novo hash na mesma transação serializável. A confirmação valida formato e expiração, consome o token por atualização condicional, grava `User.emailVerifiedAt` somente quando ainda nulo e revoga tokens irmãos atomicamente. Conflitos `P2034` recebem no máximo três tentativas; token ausente, expirado, consumido, revogado ou conta já verificada recebe rejeição pública única.

O token puro continua restrito à fronteira interna que futuramente chamará o transporte. Nenhuma rota, resposta JSON, CTA ou UI foi habilitada neste corte. O próximo lote deve integrar transporte real configurado por ambiente, auditoria sanitizada e emissão no cadastro antes de expor confirmação ou recuperação ao usuário.

## Transporte HTTP transacional ainda não exposto

O adaptador `HttpPasswordRecoveryDelivery` implementa a porta independente de
fornecedor já usada pelo serviço de solicitação. Ele envia um contrato
`evolvia.transactional-email.v1` para um gateway HTTPS configurado por ambiente,
sem adicionar SDK de provedor à API e sem registrar token, endereço ou segredo.

A configuração é opt-in e exige o conjunto completo:

- `EVOLVIA_EMAIL_DELIVERY_ENDPOINT`: endpoint HTTPS do gateway;
- `EVOLVIA_EMAIL_DELIVERY_TOKEN`: credencial bearer mantida fora do repositório;
- `EVOLVIA_EMAIL_FROM`: remetente validado, sem quebra de linha;
- `EVOLVIA_PUBLIC_BASE_URL`: origem pública HTTPS usada no link.

Configuração parcial ou URL insegura falha de modo explícito e sanitizado.
Quando nenhuma variável está definida, a aplicação continua disponível, mas o
adaptador nega a entrega. O serviço superior então revoga o token e mantém a
resposta anti-enumeração.

O link usa `/redefinir-senha#token=...`: o fragmento evita enviar o token em
requisições HTTP, access logs e cabeçalhos `Referer` antes de a futura página
cliente consumi-lo. O gateway recebe corpo HTML e texto, chave de idempotência
derivada por SHA-256 e timeout de dez segundos. Respostas não 2xx, timeout e erro
de rede se convertem na mesma falha operacional sem incorporar dados sensíveis.

O adaptador está registrado no contêiner. A superfície pública descrita abaixo
permanece no PR até que os segredos sejam configurados e a entrega seja
comprovada no SHA exato em homologação.

### Verificação de e-mail no mesmo transporte

O mesmo gateway agora possui a porta `HttpEmailVerificationDelivery`, sem SDK
ou regra específica de fornecedor. A mensagem usa a finalidade
`email-verification`, assunto e conteúdo próprios e link
`/verificar-email#token=...`. Recuperação e verificação derivam chaves de
idempotência com namespaces diferentes, mesmo que recebam acidentalmente o mesmo
token, impedindo colisão entre jornadas.

A configuração HTTPS, o remetente, o timeout e o tratamento sanitizado de
falhas são compartilhados. O token continua somente no corpo estritamente
necessário para a entrega e não aparece nos headers. O adaptador está registrado
no contêiner, mas emissão no cadastro, reenvio, auditoria de verificação,
endpoints e UI permanecem não expostos até o próximo gate.


## Cooldown e limite de reenvio ainda não expostos

A emissão da verificação aplica, na mesma transação serializável que substitui o
token ativo, cooldown inicial de 60 segundos e janela deslizante de 15 minutos
com no máximo três emissões por usuário. O controle consulta somente
`userId + createdAt` dos tokens já persistidos; não cria armazenamento de
e-mail, IP, origem, token puro ou metadado livre.

Tentativas bloqueadas não revogam o token ativo nem chamam o transporte. O
coordenador preserva a mesma mensagem pública indisponível, mantém internamente
o tempo de espera para uma futura superfície autenticada e audita somente
`RATE_LIMITED` com o identificador interno. Rate limit esperado não é enviado
como falha operacional aos diagnósticos.

Tokens revogados após falha de entrega continuam contando na janela, impedindo
que indisponibilidade do gateway seja usada para gerar emissões ilimitadas. O
índice já existente `EmailVerificationToken(userId, createdAt)` sustenta a
consulta; não há nova tabela. A migration deste lote apenas acrescenta o valor
`RATE_LIMITED` ao enum de auditoria, de forma expansiva.

## Confirmação auditável e jornada pública

A confirmação atômica do token agora passa por um coordenador interno que
diferencia conclusão, rejeição esperada e indisponibilidade operacional sem
registrar o token, seu hash, e-mail, origem, organização, evento ou exceção.
Token inválido, expirado, consumido, revogado e conta já confirmada continuam
recebendo a mesma rejeição pública.

A auditoria persiste somente a ação `email_verification.confirm` e o resultado
enumerado. Falha de auditoria é diagnosticada por evento e estágio constantes,
sem substituir o sucesso ou a rejeição do usuário. A migration apenas amplia o
enum e a allowlist já existentes. O serviço está registrado no contêiner, mas
nenhuma rota, DTO ou UI é publicada antes da configuração e prova do transporte
transacional por ambiente.

## Jornada pública de recuperação

O primeiro corte ponta a ponta publica no PR as rotas
`POST /auth/password/forgot` e `POST /auth/password/reset`, além das páginas
`/esqueci-senha` e `/redefinir-senha`. O login passa a oferecer o link real
“Esqueci minha senha”.

A solicitação:

- valida e normaliza o e-mail;
- deriva HMACs separados para identidade e origem;
- só considera `X-Forwarded-For` quando o socket pertence à lista explícita de
  proxies confiáveis;
- mantém a mesma confirmação para conta elegível e inexistente;
- retorna `429` com a mesma mensagem anti-enumeração quando o limite é
  atingido;
- nunca retorna token, hash, e-mail canônico ou estado da conta.

A página de redefinição captura o token do fragmento, remove-o imediatamente da
barra de endereço e o envia apenas no corpo do POST. A API aplica a política
central de senha e o consumo atômico já documentado. Token inválido, expirado,
consumido ou revogado recebe uma única mensagem pública.

Além das quatro variáveis do transporte, o runtime passa a exigir:

- `PASSWORD_RECOVERY_IDENTIFIER_PEPPER`: segredo exclusivo para pseudonimizar
  o identificador informado;
- `PASSWORD_RECOVERY_ORIGIN_PEPPER`: segredo distinto para pseudonimizar a
  origem;
- `EVOLVIA_TRUSTED_PROXY_ADDRESSES`: lista opcional, separada por vírgula, de
  endereços de proxies realmente confiáveis.

Os dois peppers devem ter pelo menos 32 caracteres, não podem ser iguais a
outras credenciais e não entram no Git. A API falha fechada na inicialização se
eles estiverem ausentes ou fracos. Por isso, este PR não pode ser integrado nem
implantado antes da configuração segura dos ambientes e da prova do gateway.


### Superfície pública de confirmação

O PR publica `POST /auth/email/verify` e a página `/verificar-email`. O DTO
aceita exclusivamente o token opaco canônico. A página captura o token do
fragmento, remove-o imediatamente da barra de endereço e o envia somente no
corpo do POST.

Sucesso retorna apenas uma mensagem estável, sem data interna, usuário ou
e-mail. Token ausente, inválido, expirado, consumido, revogado ou pertencente a
conta já confirmada mantém a mesma rejeição pública; falha operacional usa uma
indisponibilidade sanitizada. A interface possui estados anunciados para leitor
de tela, navegação por teclado, foco visível, reflow e `noindex`.

A confirmação pode ser validada isoladamente no CI com token estruturalmente
válido e inexistente. A emissão no cadastro, o reenvio e a prova de entrega real
continuam bloqueados até configurar endpoint, credencial, remetente e URL-base
HTTPS do gateway no ambiente alvo.


## Emissão integrada ao cadastro

Após a transação criar usuário, organização e associação, o cadastro chama o
coordenador de verificação com exclusivamente o identificador interno do novo
usuário. O destinatário é relido do estado canônico pelo adaptador; o controller
e o cliente nunca fornecem um endereço alternativo ao envio.

Entrega concluída retorna somente `emailVerification.status = SENT`. Se
persistência, transporte ou revogação falharem, o coordenador aplica a
compensação e a resposta usa somente `PENDING`, sem e-mail, token, hash, origem
ou detalhe operacional. A conta e a organização já confirmadas pela transação
não são apagadas por uma falha externa; isso preserva consistência e permite um
reenvio posterior controlado por cooldown e rate limit.

O CI comprova o wiring e o contrato mínimo da resposta. A evidência `SENT` em
um ambiente real continua condicionada ao endpoint HTTPS, credencial, remetente
e URL-base configurados fora do repositório.


## Orientação pós-cadastro e reenvio autenticado

Depois do cadastro, a interface preserva a sessão e encaminha o organizador para
`/confirmar-email`. O estado mínimo `SENT` ou `PENDING` é transferido apenas
por `sessionStorage`, removido após a leitura e nunca inclui endereço ou token
na URL.

A rota autenticada `POST /auth/email/resend` deriva o usuário exclusivamente
do JWT validado pelo servidor. Ela não aceita e-mail, usuário, organização ou
evento no corpo. O coordenador existente aplica cooldown de 60 segundos, limite
de três emissões em 15 minutos, revogação compensatória e auditoria sanitizada.

A tela anuncia sucesso, limite, sessão expirada e indisponibilidade para leitor
de tela; mantém teclado, foco visível, contraste, reflow e uma saída explícita
para o painel. A entrega real continua dependendo da configuração externa do
gateway, sem alterar a segurança ou a testabilidade do fluxo.


## Continuidade de confirmação no login

O login consulta somente identificador, nome, e-mail, hash de senha e o estado
canônico `emailVerifiedAt`. Após autenticar as credenciais, a resposta inclui
apenas `emailVerification.status = VERIFIED | PENDING`; a data interna de
verificação não é exposta.

Contas pendentes são encaminhadas à orientação `/confirmar-email`, onde podem
reenviar o link ou continuar ao painel. A política não infere posse pelo login e
não bloqueia funções além do necessário. Credenciais inválidas continuam usando
a mesma resposta pública, sem revelar se a conta existe ou seu estado de
verificação.


## Orientação persistente no painel

O contrato autenticado `GET /me` inclui somente
`emailVerification.status = VERIFIED | PENDING`. A consulta lê
`emailVerifiedAt` do banco, remove a data antes de montar a resposta e não
infere verificação por sessão, login, organização ou evento.

Enquanto o estado for `PENDING`, o painel exibe um aviso acessível com atalho
para a jornada de confirmação. O aviso não mostra o endereço, não bloqueia o
painel e explica que a confirmação é necessária para recuperação segura e
futuras operações sensíveis. Em mobile, a ação ocupa a largura disponível sem
causar overflow.


## Cooldown visível e preventivo

A tela de confirmação desabilita o reenvio durante 60 segundos após cadastro,
envio concluído ou resposta `429`. O botão apresenta a contagem regressiva e
mantém a explicação associada por `aria-describedby`, evitando tentativas
previsivelmente rejeitadas.

O instante de nova tentativa é guardado apenas em `sessionStorage`, não contém
e-mail, token ou identificador e é removido assim que a tela o consome. Login
posterior limpa um valor antigo para não impor espera sem emissão recente. Esse
controle é somente UX; cooldown e limite persistentes no backend continuam
autoritativos.
