# Patches para executor autorizado

Patches gerados quando a sessão que escreve o código **não tem acesso de clone
nem push** ao repositório e a única via disponível — a API do GitHub — exige
reenviar o arquivo inteiro a cada alteração.

Para arquivo pequeno isso é aceitável e o formato do diff confirma a
fidelidade. Para arquivo grande ligado a inscrição, cobrança ou reembolso, não
é: retranscrever 50 KB à mão já produziu um erro neste repositório (391 linhas
publicadas contra 351 no disco, em novembro de 2026). Daquela vez era um
arquivo de teste.

Então a alteração vem como patch: pequeno, legível, aplicável por ferramenta.

## Como aplicar

```sh
# 1. Confira que o arquivo de destino é o esperado.
git hash-object apps/api/src/<arquivo>
#    tem de bater com o "blob de origem" da tabela abaixo

# 2. Aplique.
git apply --check patches/<nome>.patch   # recusa sem alterar nada se não casar
git apply patches/<nome>.patch

# 3. Confirme o resultado.
git hash-object apps/api/src/<arquivo>
#    compare com o "blob de resultado", quando houver
```

Se o passo 1 não bater, **não force**: o arquivo mudou desde a geração do patch
e quem o escreveu precisa regerar sobre a base nova. `git apply` sem `--3way`
recusa por conta própria, e isso é a proteção funcionando.

## Duas classes de patch, e a diferença importa

**Conferido de ponta a ponta — com blob de resultado.** O autor teve o arquivo
original em disco sem transcrevê-lo, aplicou o patch e registrou o hash do
resultado. É o caso quando a ferramenta salva a resposta em arquivo por exceder
o limite de tamanho: a cópia é exata por construção.

**Validado por aplicação — sem blob de resultado.** O autor conferiu as âncoras
por asserção, gerou o diff por script e testou a aplicação contra um arquivo
simulado, mas não reconstruiu o arquivo todo — porque retranscrever um arquivo
crítico à mão é o risco que este diretório existe para evitar. A garantia do
lado de quem aplica é o próprio `git apply`, que recusa qualquer divergência de
contexto sem alterar nada, mais o diffstat esperado. **Devolva o
`git hash-object` resultante** para o autor registrar.

## Patches

| patch | arquivo | origem | resultado | diffstat | estado |
|---|---|---|---|---|---|
| `691-fiacao-inscricao.patch` | `registration-reservations.service.ts` | `31974e10ff31d89d04a69eacd6f4e3972816f536` | `88ca8208ac7a201bb53c584f2a5a348b63e0d7cd` | +35/-0 | **aplicado** em `7a7d75dc` |
| `691-fiacao-pagamento.patch` | `registration-order-checkout.service.ts` | `4ef8d13bd7e9c84fd3b2addc0823e9828c16bc71` | a confirmar | +35/-0 | aberto |
| `691-fiacao-balcao.patch` | `event-desk.service.ts` | `8fb46bc052135194df44e8d72fc5b680665320c0` | `0cf77cf21302013623ca88e15410c3e050ba13ad` | +45/-14 | aberto |

Os três ligam pontos de `PONTOS_DE_CONSUMO` em `platform-moderation-enforcement.ts`.

### `691-fiacao-inscricao.patch` — aplicado

`nova_inscricao`. Aplicado em `7a7d75dc` com +35/-0 num arquivo só, conforme o
esperado.

Quatro hunks, nenhuma linha existente alterada: import, método privado
`exigirSemBloqueioDeModeracao(tx, eventId)`, e duas chamadas — `reserveOrder` e
`reserve` — ambas DENTRO da transação, logo após a conferência de
`EventStatus.PUBLISHED`. Dentro da transação de propósito: fora dela haveria
janela entre perguntar e reservar.

### `691-fiacao-pagamento.patch`

`novo_pagamento`. Três hunks, nenhuma linha existente alterada.

**O lugar da conferência é a decisão deste patch**, entre dois limites que não
podem ser invertidos:

- **depois** dos retornos antecipados que devolvem checkout ACTIVE ou PAID
  existente, porque cobrança em andamento precisa continuar legível e
  conciliável — suspender um evento não apaga a cobrança de quem já está
  pagando, e o webhook do provedor também não passa por aqui, porque barrá-lo
  perderia dinheiro em trânsito;
- **antes** de `intent.prepare`, que cria a linha de checkout — conferir depois
  dela deixaria uma linha `CREATING` órfã de um evento que nunca vai cobrar.

A conferência **não é transacional**, e não dá para ser: a chamada ao provedor
acontece fora de transação. A janela está declarada no comentário do código. O
que a estreita é `nova_inscricao`, já aplicado: evento suspenso não acumula
pedido novo.

### `691-fiacao-balcao.patch`

`acesso_operacional`. Quinze hunks, mas treze deles são de uma linha.

O balcão tem 25 métodos públicos. Em vez de espalhar quinze conferências, o
patch usa o ponto único que o arquivo já tinha: `requirePublished`, chamado por
12 operações e por **nenhuma leitura**. `context`, `search`, `report` e os
relatórios de kit não passam por ele — ou seja, o recorte "balcão recusa
operação; leitura do painel continua" já estava desenhado no arquivo.

O estado de moderação é carregado uma vez em `eventFor`, por onde todo método
passa. Buscá-lo em cada operação multiplicaria a consulta e abriria a chance de
alguém esquecer.

**O guarda foi renomeado** para `requireBalcaoOperavel`, e isso merece o olhar da
revisão. Um guarda que passa a conferir duas coisas independentes não pode
continuar com o nome de uma só: status é ciclo de vida, a linha de moderação é
restrição administrativa, e confundir as duas foi o defeito corrigido nesta
mesma frente. Para evento FINISHED ou CANCELLED isso deixa de ser estético — a
moderação nunca escreve `Event.status` nesses estados, então a linha é o único
guarda que resta.

**Limite declarado:** seis métodos seguem liberados — `updateCategoryLabel`,
`updateLabel`, `updateSelfService`, `issueTotemLink`, `revokeTotemLink` e
`saveKit`. Eles chamam `requireOrganizer`, não o guarda de operação: são
configuração do organizador, não operação de balcão. Barrá-los sob moderação é
decisão de produto, não de implementação.
