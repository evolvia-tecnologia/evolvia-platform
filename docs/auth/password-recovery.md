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

A busca retorna somente identidades elegíveis com e-mail já verificado. Enquanto
a confirmação real da issue #42 não existir, nenhum adaptador pode considerar
uma conta elegível e nenhuma rota deve ser registrada.

Conta elegível, conta inexistente e falhas operacionais posteriores à consulta
recebem a mesma mensagem pública. Falhas de persistência ou entrega geram
diagnóstico sem dado pessoal; uma entrega falha revoga o token recém-criado.
Auditoria recebe somente ação, resultado e identificador interno do usuário,
nunca endereço, token, hash, organização ou evento.

A origem recebida pelo serviço deve ser uma chave sanitizada produzida por
middleware confiável, considerando a configuração real de proxy. IP bruto não
deve entrar em auditoria ou logs de negócio.
