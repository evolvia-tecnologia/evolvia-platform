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
