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
#    tem de bater com o "blob de resultado"
```

Se o passo 1 não bater, **não force**: o arquivo mudou desde a geração do patch
e quem o escreveu precisa regerar sobre a base nova. `git apply` sem
`--3way` recusa por conta própria, e isso é a proteção funcionando.

## Patches abertos

| patch | arquivo | blob de origem | blob de resultado | referência |
|---|---|---|---|---|
| `691-fiacao-inscricao.patch` | `apps/api/src/registration-reservations.service.ts` | `31974e10ff31d89d04a69eacd6f4e3972816f536` | `88ca8208ac7a201bb53c584f2a5a348b63e0d7cd` | #691 |

### `691-fiacao-inscricao.patch`

Liga o ponto de consumo `nova_inscricao` da moderação (#691). Quatro hunks, e
**nenhuma linha existente é alterada ou removida** — só acréscimos:

1. um import de `platform-moderation-enforcement`;
2. o método privado `exigirSemBloqueioDeModeracao(tx, eventId)`;
3. uma chamada em `reserveOrder`, dentro da transação;
4. uma chamada em `reserve`, dentro da transação.

As duas chamadas ficam logo após a conferência de `EventStatus.PUBLISHED` e
antes de qualquer leitura de catálogo ou escrita. Dentro da transação de
propósito: fora dela haveria janela entre perguntar e reservar, e uma suspensão
aplicada nesse intervalo deixaria passar exatamente a inscrição que ela existe
para impedir.

A recusa reusa a frase de evento indisponível que o método já usa, para que a
apresentação pública não conte que há moderação em curso.

Verificado antes de entregar: `git apply --check` passa sobre o blob de origem,
e aplicar reproduz exatamente o blob de resultado. Não é um diff descrito de
memória.

**Depois de aplicar**, o ponto correspondente em `PONTOS_DE_CONSUMO`
(`platform-moderation-enforcement.ts`) deixa de ser pendência, e a prova em
PostgreSQL da recusa de inscrição nova pode entrar em
`apps/api/tests-postgres/`.
