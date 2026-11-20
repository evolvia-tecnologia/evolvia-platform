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

**Com blob de resultado.** O autor reconstruiu o arquivo inteiro em disco,
aplicou o patch e registrou o hash do resultado. A conferência é de ponta a
ponta.

**Sem blob de resultado.** O autor validou que o patch APLICA — âncoras
conferidas por asserção, diff gerado por script, aplicação testada contra um
arquivo simulado — mas não reconstruiu o arquivo todo, porque retranscrever um
arquivo crítico à mão é o risco que este diretório existe para evitar. A
garantia do lado de quem aplica é o próprio `git apply`, que recusa qualquer
divergência de contexto sem alterar nada, mais o diffstat esperado. **Devolva o
`git hash-object` resultante** para o autor registrar.

## Patches

| patch | arquivo | blob de origem | blob de resultado | diffstat | referência |
|---|---|---|---|---|---|
| `691-fiacao-inscricao.patch` | `registration-reservations.service.ts` | `31974e10ff31d89d04a69eacd6f4e3972816f536` | `88ca8208ac7a201bb53c584f2a5a348b63e0d7cd` | +35/-0 | #691 — **aplicado** em `7a7d75dc` |
| `691-fiacao-pagamento.patch` | `registration-order-checkout.service.ts` | `4ef8d13bd7e9c84fd3b2addc0823e9828c16bc71` | a confirmar na aplicação | +35/-0 | #691 |

### `691-fiacao-inscricao.patch` — aplicado

Ligou o ponto de consumo `nova_inscricao`. Aplicado em `7a7d75dc` com +35/-0 num
arquivo só, que confere com o esperado.

Quatro hunks, nenhuma linha existente alterada: import, método privado
`exigirSemBloqueioDeModeracao(tx, eventId)`, e duas chamadas — `reserveOrder` e
`reserve` — ambas DENTRO da transação, logo após a conferência de
`EventStatus.PUBLISHED`.

### `691-fiacao-pagamento.patch`

Liga o ponto `novo_pagamento`. Três hunks, nenhuma linha existente alterada.

**O lugar da conferência é a decisão deste patch.** Ela fica entre dois limites
que não podem ser invertidos:

- **depois** dos retornos antecipados que devolvem checkout ACTIVE ou PAID
  existente, porque cobrança em andamento precisa continuar legível e
  conciliável — suspender um evento não apaga a cobrança de quem já está
  pagando, e o webhook do provedor também não passa por aqui;
- **antes** de `intent.prepare`, que cria a linha de checkout — conferir depois
  dela deixaria uma linha CREATING órfã para um evento que nunca vai cobrar.

A conferência **não é transacional**, e não dá para ser: a chamada ao provedor
acontece fora de transação. A janela existe e está declarada no próprio
comentário do código. O que a estreita é `nova_inscricao`, já aplicado: evento
suspenso não acumula pedido novo.

Validado por aplicação contra arquivo simulado; blob de resultado a confirmar
quem aplicar.
