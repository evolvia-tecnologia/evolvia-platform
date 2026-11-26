# Área Master — nascimento do primeiro proprietário

Procedimento para a primeira identidade `PlatformMasterIdentity` com `role: OWNER`
(issue #665). Depois dela, toda nomeação acontece **pela própria Área Master**,
pelo proprietário principal, com trilha — não por este procedimento.

## Por que não existe um botão

Não há rota HTTP que crie identidade Master. Uma rota que cria o próprio poder é
porta aberta: quem a alcançasse viraria dono da plataforma. O nascimento exige
acesso ao banco, que é um privilégio já fora da aplicação.

Por isso o script **não escreve nada**. Ele valida e **gera SQL**, para que você
leia antes de executar. Provisionamento de poder não deve acontecer como efeito
colateral de um comando que ninguém inspecionou.

## Pré-requisitos

1. A conta que será proprietária **já existe** na plataforma e tem **e-mail
   verificado**. Crie pelo cadastro normal, não por SQL.
2. As migrations da Área Master estão aplicadas no banco de destino: a da
   identidade (PR #675) e a da janela de inscrição,
   `20261125154000_platform_master_enrollment_window`. Sem a segunda, a janela
   temporária não tem onde existir e o primeiro acesso não acontece.
3. Você tem o `DATABASE_URL` do ambiente de destino.

## Passo 1 — gerar o SQL

```bash
export DATABASE_URL='postgresql://...'   # ambiente de destino
export NODE_ENV=development              # o script recusa 'production'

node scripts/provisionar-proprietario-master.mjs \
  --email rosberg@exemplo.com \
  --nota "Autorizado pelo proprietário do CNPJ em 18/11/2026" \
  --confirmar-host db.homologacao.interno \
  > /tmp/master-owner.sql
```

`--confirmar-host` tem de ser **igual** ao host do `DATABASE_URL` em uso. É a
guarda contra rodar no banco errado: se divergir, o script recusa e não gera nada.

`--nota` é obrigatória, vai para a coluna `provisionedByNote` e para a trilha, e
é o que responde "quem autorizou". Máximo de 200 caracteres, uma linha.

**O `DATABASE_URL` tem de ser TCP, com host e porta.** URL de socket Unix
(`postgresql:///banco`, ou host em `host=`) não tem host para confirmar, e o
script recusa com essa mensagem. A limitação é deliberada e não é para
contornar: `--confirmar-host` é a única guarda contra executar no banco errado,
e com host vazio não existiria guarda nenhuma — exatamente no caso em que você
não teria como perceber o alvo trocado. Se o ambiente de destino só for
alcançável por socket, use a URL TCP do mesmo banco para gerar o SQL e execute
o arquivo gerado pelo caminho que você já usa.

### Não existe parâmetro para um segundo proprietário

Houve um `--permitir-segundo-proprietario`, e ele **foi removido**. Se você tem
um runbook ou um histórico de shell com essa opção, o comando agora **recusa**,
com mensagem explicando — e não gera SQL.

A recusa é deliberada, e a opção continua sendo *lida* só para poder ser
recusada: ignorá-la em silêncio deixaria você convencido de ter obtido o
comportamento antigo, quando o SQL gerado seria outro.

O motivo é medido, não teórico. A opção transformava a guarda de proprietário
único em comentário, e em PostgreSQL 16.15 o resultado era **dois `OWNER`
ativos** — exatamente o que este procedimento existe para impedir. Nomear um
segundo proprietário é ato do proprietário principal, pela Área Master, com
autoria e trilha. Não há caminho por script.

## Passo 2 — ler o SQL

Abra `/tmp/master-owner.sql`. Ele deve ter, nesta ordem: `BEGIN`,
`PERFORM pg_advisory_xact_lock(665, 1)`, **quatro** `RAISE EXCEPTION` (usuário
inexistente, e-mail não verificado, identidade Master incompatível,
proprietário já existente), o caminho idempotente, um `INSERT` em
`PlatformMasterIdentity`, um `INSERT` em `PlatformAuditLog` e `COMMIT`. Se algo
estiver diferente, pare.

Três coisas na lista merecem explicação, porque são o que mudou depois da
revisão independente da PR #690:

- **A trava vem antes de qualquer leitura de estado, e é ela que torna a guarda
  de proprietário confiável.** `PlatformMasterIdentity` tem índice em
  `(role, status)`, não restrição de unicidade. Sem a trava, duas execuções
  simultâneas para **usuários diferentes** passariam as duas pela verificação
  "já existe proprietário ativo?" e inseririam as duas: nasceriam dois `OWNER`
  ativos. Repetir o **mesmo** usuário já era barrado por `userId @unique`. A
  trava é liberada quando a transação termina, de um jeito ou de outro, e não
  bloqueia leitura de ninguém.
- **A quarta exceção é nova, e substitui um falso sucesso.** Antes, encontrar
  *qualquer* identidade Master para o usuário levava a `RETURN` — caminho de
  sucesso. Então um `DELEGADO`, ou um `OWNER` suspenso, faziam o comando sair
  com código 0 dizendo "nada a fazer", sem criar proprietário e sem gravar
  trilha. Você leria sucesso e concluiria que a área tem titular; não teria, e
  nada avisaria. Agora a idempotência vale **somente** para a mesma identidade
  `OWNER` **ativa**; qualquer outra situação recusa, dizendo o papel e a
  situação encontrados. Este procedimento faz *nascer* o primeiro proprietário:
  ele não promove papel, não reativa identidade suspensa e não altera identidade
  existente.
- **Os dois `id` vêm escritos no arquivo, como literais no formato `c…`**, em
  vez de `gen_random_uuid()`. As colunas são `@default(cuid())`, e em Prisma o
  `cuid()` é gerado no cliente — a coluna não tem `DEFAULT` no banco, então o
  `INSERT` é obrigado a trazer o id. Um UUID ali ficaria com hífen, com 36
  caracteres e sem o `c` inicial: diferente de todos os outros id da mesma
  coluna. Se você reexecutar o gerador, os literais mudam — isso é esperado, e
  não torna o arquivo anterior inválido.

## Passo 3 — executar

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/master-owner.sql
```

Resultados possíveis:

| saída | significado | o que fazer |
|---|---|---|
| `NOTICE: Identidade Master OWNER criada para ...` | pronto | siga para o passo 4 |
| `NOTICE: Nada a fazer: este usuario ja e proprietario Master ativo` | já estava feito; nada mudou | siga para o passo 4 |
| `ERROR: Nao existe usuario com esse e-mail` | a conta não existe | crie pelo cadastro normal |
| `ERROR: O usuario existe mas nao tem e-mail verificado` | conta sem verificação | verifique o e-mail primeiro |
| `ERROR: Este usuario ja possui identidade Master <papel> / <situacao>` | há identidade, mas não é proprietário ativo | trate pela Área Master: promover papel ou reativar identidade suspensa são atos do proprietário, com autoria registrada — não deste script |
| `ERROR: Ja existe proprietario Master ativo` | a área já tem titular | nomeie o novo pela área, não por script |

É uma transação só: em qualquer erro, nem a identidade nem a trilha ficam. Isso
vale também para falha **tardia**, depois das duas escritas — e é esse o caso que
tem prova em PostgreSQL, porque metade gravada seria pior que nada:
proprietário sem trilha é poder sem origem registrada, e trilha sem proprietário
é registro de algo que não aconteceu.

Reexecutar é seguro **para o mesmo proprietário ativo**. O caminho idempotente
informa e não altera.

## Passo 4 — cadastrar a chave de segurança

A identidade nasce **sem** credencial WebAuthn. A primeira chave é registrada por
você, na própria Área Master, pela cerimônia de registro. Antes disso, confira as
três variáveis no ambiente da API:

| variável | em homologação |
|---|---|
| `PLATFORM_MASTER_RP_ID` | o domínio, sem esquema e sem porta |
| `PLATFORM_MASTER_ORIGIN` | a URL exata, com esquema |
| `PLATFORM_MASTER_RP_NAME` | o nome que aparece na cerimônia |

Se o `rpID` não for o domínio ou o `origin` não for a URL exata, a biblioteca
recusa **toda** assertion. É a causa mais comum de WebAuthn que "não funciona".

## O que este procedimento não faz

- Não cria conta de usuário.
- Não registra chave de segurança.
- Não concede nada a delegados — isso é pela área, pelo proprietário.
- Não promove papel nem reativa identidade suspensa.
- Não nomeia um segundo proprietário, e não há parâmetro que permita isso.
- Não roda em produção: o script recusa `NODE_ENV=production`.

## Nota sobre a trilha: ação sistêmica não é ação humana

O `actorUserId` do registro de auditoria recebe `sistema:bootstrap-master`, e não
o id do novo proprietário. Registrar o alvo como ator afirmaria que ele se
autoconcedeu poder pela aplicação, o que não aconteceu. Quem autorizou está em
`reason`.

O prefixo `sistema:` é um namespace, não um valor solto. Relatórios devem chamar
`ehAtorSistemico(actorUserId)` em vez de comparar a literal, para que a próxima
ação sistêmica — reconciliação, rotina agendada, webhook — seja classificada sem
alterar cada consulta.

O namespace não colide com id de pessoa: `User.id` é `cuid()`, alfanumérico e sem
dois-pontos. Há teste prendendo essa propriedade, que falha se o formato do id
mudar.

Consequência a aceitar: relatórios que juntem `actorUserId` com `User` não
encontram pessoa nestas linhas. Isso é correto — não houve pessoa agindo pela
aplicação — e é por isso que a distinção tem de ser feita pelo predicado, e não
pela presença do usuário.

## Decisão de arquitetura — primeiro autenticador em homologação

O provisionamento da #690 cria a identidade do proprietário com e-mail verificado. O operador autorizado usa o procedimento da #739 para abrir uma janela temporária vinculada à identidade e à finalidade. Entregue o segredo diretamente ao titular por canal seguro. O titular entra com sua conta, abre /master em homologação e escolhe “Cadastrar chave com autorização temporária”. Depois do cadastro, deve autenticar-se com a chave para abrir a sessão Master.

A API verifica o desafio, a origem, o RP e a verificação do usuário. A transação bloqueia a identidade e condiciona o consumo à validade da janela, à ausência de revogação e ao desafio vigente. Gravação da credencial, consumo e auditoria ocorrem na mesma transação. A recuperação invalida credenciais e sessões anteriores. A autorização temporária só é aceita na homologação canônica e pelo cenário descartável do CI. A publicação requer revisão independente, CI no SHA candidato e identificação do SHA implantado.

Para habilitar a inscrição na homologação, o operador configura EVOLVIA_AMBIENTE=homologacao e EVOLVIA_PUBLIC_BASE_URL=https://homologacao.evolviatecnologia.com na API. PLATFORM_MASTER_RP_ID deve ser homologacao.evolviatecnologia.com e PLATFORM_MASTER_ORIGIN deve coincidir com a URL pública. O comando de emissão no host exige EVOLVIA_AMBIENTE=homologacao e a confirmação explícita do host PostgreSQL. Guarde a identificação da janela e a correlação da operação para auditoria.

## Revogar uma janela aberta

A janela dura no máximo 60 minutos, e às vezes isso é tempo demais: o segredo
foi entregue à pessoa errada, a nota registrou o chamado errado, ou o canal de
entrega vazou. Esperar o vencimento com um segredo válido em trânsito não é
resposta, e `UPDATE` à mão em banco de homologação é exatamente o que estes
scripts existem para evitar.

```bash
node scripts/revogar-inscricao-master.mjs \
  --email titular@exemplo.org \
  --identidade cmasteridentidade... \
  --nota "Canal de entrega do segredo comprometido, chamado CH-7" \
  --correlacao ch-7 \
  --confirmar-host homologacao-db \
  --confirmar-revogacao > revogacao.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f revogacao.sql
```

Como os outros, ele **não escreve no banco**: imprime SQL para você ler antes de
executar. O bloco é uma transação só — ou a revogação e a trilha acontecem
juntas, ou nada acontece.

O que ele faz: marca `revokedAt` nas janelas **abertas** daquela identidade,
limpa o desafio gravado e registra a trilha com quantas janelas fechou. O que
ele **não** faz: não apaga credencial, não encerra sessão, não altera a
identidade. Para isso o comando é `recuperar-acesso-master.mjs --finalidade
recuperacao`, e a diferença importa — recuperar **apaga** autenticadores, e
ninguém deve chegar nesse efeito querendo cancelar um convite.

Duas escolhas que surpreendem e são deliberadas:

- **Identidade suspensa também pode ter janela revogada.** Abrir para identidade
  suspensa devolveria acesso por via indireta e por isso é recusado; fechar uma
  autorização pendente é sempre seguro. Exigir `ACTIVE` aqui deixaria sem recurso
  justamente o caso em que a suspeita foi o motivo da suspensão.
- **Se não havia nada aberto, o comando FALHA.** Zero linhas afetadas não sai
  como sucesso: quem revoga precisa saber se havia o que revogar, porque ler
  silêncio como "fechado" é como deixar de procurar um segredo que continua
  valendo em outro lugar. Se o segredo já foi consumido, a credencial existe e o
  caminho é a recuperação.

Janela já consumida não é tocada. Marcar revogação nela diria que o registro do
autenticador foi desfeito, e não foi.

Depois de revogar, abrir outra é o caminho normal: a guarda de janela única
passa a deixar, porque não há mais autorização em aberto.

## Nota sobre a migration: o que é idempotente, e o que não é

A distinção tem consequência operacional, então vale escrita precisa.

`20261125154000_platform_master_enrollment_window` **não é um SQL
re-executável**. São sete comandos `CREATE`/`ALTER` sem `IF NOT EXISTS`: rodar o
arquivo duas vezes contra o mesmo banco falha no primeiro `CREATE TYPE`. Medido
em PostgreSQL 16.15: a segunda execução para na primeira instrução, com
`type "PlatformEnrollmentPurpose" already exists`.

O que é idempotente é o **`prisma migrate deploy`**. Ele registra cada migration
aplicada em `_prisma_migrations` e salta as que já estão lá, então uma segunda
publicação do mesmo SHA não reaplica nada. O CI comprova esse comportamento, e
não o outro — é o passo que grava `migrate-segunda-execucao.log` e exige
`No pending migrations to apply`.

Na prática: publicar duas vezes é seguro; executar o arquivo `.sql` à mão duas
vezes não é. E não se corrige isso editando a migration depois de aplicada — o
`migrate` guarda o checksum do arquivo, e alterá-lo passa a acusar divergência
em todo ambiente onde ela já rodou.

O SQL **do provisionamento** é outra coisa, e esse sim é re-executável para o
mesmo proprietário ativo, como o Passo 3 explica. Os dois sentidos de
"idempotente" conviviam neste procedimento sem serem distinguidos, e confundi-los
é o que faz alguém reaplicar o arquivo errado.
