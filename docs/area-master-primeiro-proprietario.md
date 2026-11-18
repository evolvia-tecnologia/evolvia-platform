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
2. A migration da Área Master está aplicada no banco de destino (vem da PR #675).
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

## Passo 2 — ler o SQL

Abra `/tmp/master-owner.sql`. Ele deve ter, nesta ordem: `BEGIN`, três
`RAISE EXCEPTION` (usuário inexistente, e-mail não verificado, proprietário já
existente), o caminho idempotente, um `INSERT` em `PlatformMasterIdentity`, um
`INSERT` em `PlatformAuditLog` e `COMMIT`. Se algo estiver diferente, pare.

## Passo 3 — executar

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/master-owner.sql
```

Resultados possíveis:

| saída | significado |
|---|---|
| `NOTICE: Identidade Master OWNER criada para ...` | pronto |
| `NOTICE: Nada a fazer: este usuario ja possui identidade Master` | já estava feito; nada mudou |
| `ERROR: Nao existe usuario com esse e-mail` | crie a conta pelo cadastro primeiro |
| `ERROR: O usuario existe mas nao tem e-mail verificado` | verifique o e-mail primeiro |
| `ERROR: Ja existe proprietario Master ativo` | nomeie o novo pela área, não por script |

É uma transação só: em qualquer erro, nem a identidade nem a trilha ficam.

Reexecutar é seguro. O caminho idempotente informa e não altera.

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
