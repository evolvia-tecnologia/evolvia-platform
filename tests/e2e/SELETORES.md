# Conferência de seletores — editor de etiquetas

Conferido em 02/11/2026 contra o código da base do PR #625
(`develop` @ `8231d359`, branch `claude/qa-e2e-acessibilidade` @ `63f6e99c`):

- `apps/web/components/credential-category-templates.tsx`
- `apps/web/components/credential-label.tsx`

## Defeito encontrado na primeira versão do #625

A primeira versão de `specs/etiquetas-editor.spec.ts` afirmava cinco controles
de formatação por campo — alinhamento, negrito, cor, tipo de fonte e tamanho.
**Nenhum deles existe no componente da base.** Eles chegam com o PR #614.

Rodando contra `develop`, aqueles cinco `expect` falhariam apontando um defeito
que o produto não tem. Isso é pior que não testar: produz um vermelho que, lido
rápido, culpa o Codex por algo que ninguém prometeu naquela versão.

**Correção aplicada:** `support/capacidades.ts` detecta a presença da barra de
formatação antes de asserir. Ausente, o teste sai **SKIP com a dependência
nomeada** (`Depende de PR #614`). Presente, assere integralmente, sem nenhuma
tolerância adicional. A asserção não foi afrouxada — foi condicionada à
existência do recurso.

Os dois testes que dependem da barra carregam `@gate-etiqueta`, então o SKIP
deles **reprova a execução** pelo relator (`support/relatorio.ts`): não dá para
esquecer que aquele gate nunca rodou.

## Tabela de conferência

| Seletor usado no spec | Existe na base? | Origem no código |
|---|---|---|
| `page.locator('ol li')` | sim | `<ol className={styles.fields}>` com `<li>` por campo |
| `getByRole('button', { name: /^subir / })` | sim | `aria-label={`Subir ${display(code)}`}` |
| `getByRole('button', { name: /^descer / })` | sim | `aria-label={`Descer ${display(code)}`}` |
| `getByRole('button', { name: /^remover / })` | sim | `aria-label={`Remover ${display(code)}`}` |
| `getByRole('button', { name: /restaurar padrão/ })` | sim | texto do botão |
| `getByRole('button', { name: /salvar modelo da categoria/ })` | sim | texto do botão |
| `getByRole('heading', { name: /configuração de etiquetas/ })` | sim | título da seção de check-in |
| `getByLabel('Prévia da etiqueta')` | sim | `credential-label.tsx`, `aria-label` quando `preview` |
| `getByLabel(/alinhamento de/)` | **não** | PR #614 |
| `getByRole('checkbox', { name: /negrito/ })` | **não** | PR #614 |
| `getByLabel(/cor de/)` | **não** | PR #614 |
| `getByLabel(/tipo de fonte de/)` | **não** | PR #614 |
| `getByLabel(/tamanho da fonte de/)` | **não** | PR #614 |
| `[data-fit-warning]`, `role="alert"` de etiqueta ilegível | **não** | PR #614 |

Dois detalhes que valem registro, porque são fáceis de errar:

- O `<aside>` da prévia tem `aria-label="Prévia do crachá da categoria"`.
  O `aria-label="Prévia da etiqueta"` está um nível abaixo, na `<section>` de
  `credential-label.tsx`. São dois alvos diferentes; o spec usa o de dentro.
- O `<select>` de categoria não tem `aria-label`: o nome acessível vem do
  `<label className={styles.category}>Categoria do evento`, que envolve o campo.

## Regra adotada

Capacidade ausente no ambiente ⇒ **SKIP com dependência nomeada**.
Nunca FAIL (culparia o produto) e nunca asserção afrouxada (esconderia a
regressão quando o recurso chegar).

Quando o #614 integrar, os testes voltam a valer sozinhos — a detecção é
dinâmica, não há etiqueta para remover à mão.

---

# 03/11/2026 — a quarta classe de defeito

Commits `4e2c31de` (support), `7f7998b4` (spec), `fdf63bf0` (fixture).
Relato completo em #625 `#issuecomment-6618956757`.

As três classes já registradas — **vermelho falso**, **verde falso** e **alvo
errado** — descrevem uma asserção que afirma a coisa errada. A quarta é
diferente, e mais difícil de ver na leitura:

> **Asserção que não pode reprovar, por usar uma API fora do contrato dela.**

O código parece afirmar a coisa certa. O veredito dele é constante.

```ts
getComputedStyle(el, ':focus-visible').outlineStyle   // devolve sempre ''
```

O segundo argumento de `getComputedStyle` é um pseudo-**elemento** (`::before`,
`::marker`). `:focus-visible` é pseudo-**classe** e não é endereçável ali. O
retorno é um `CSSStyleDeclaration` **vazio** (`length === 0`), logo
`.outlineStyle` é `''`, e `'' !== 'none'` faz `.not.toBe('none')` **passar
sempre** — inclusive num botão sem anel de foco nenhum.

Revisão de código não pega isso: a linha lê bem. O que pega é rodar o teste
contra uma tela que **deveria** reprovar. Daí a variante
`EVOLVIA_FIXTURE_SEM_FOCO=1`.

## O que foi medido, e por que cada medição mudou o código

| medição (Chromium, 03/11/2026) | resultado | o que mudou por causa dela |
|---|---|---|
| `getComputedStyle(el, ':focus-visible')` | `length === 0`, `outlineStyle === ''` | a asserção nunca reprovava |
| asserção antiga contra tela sem anel de foco | **passou** | verde falso confirmado no código real |
| `.focus()` **depois** de um clique de mouse | `:focus-visible` = `false`, contorno `none` | ler o estilo real após `.focus()` daria **vermelho falso**; daí a manobra `focus()` → `Shift+Tab` → `Tab` |
| `outline-style: none` | `outline-width` computado = **`3px`** | checar largura seria um segundo verde falso |
| anel por `box-shadow` | `outlineStyle === 'none'` | olhar só o contorno daria vermelho falso; a comparação é por **diferença** |
| botão 10×10 em `visibility:hidden` e em `opacity:0` | retângulo **preservado**, ambos reportados | vermelho falso em `alvosDeToque` |
| `visibility` em filho que re-declara `visible` dentro de pai `hidden` | própria = `visible` | ler no **próprio elemento**; andar pelos ancestrais trocaria um vermelho falso por outro |
| `opacity` 0.3 dentro de 0.3 | produto `0.09`, nenhum valor isolado denuncia | `opacity` **não** é herdada: aqui o passeio pelos ancestrais é obrigatório |
| `--borda` `#8a9cb5` sobre branco | **2.80:1**, mínimo 3:1 (1.4.11) | a minha própria fixture nascia reprovada |

## Três regras novas

**6. Predicado repetido em dois lugares vai divergir.**
`culpadosDeTransbordo` e `alvosDeToque` tinham, cada um, a sua noção de
"visível", as duas erradas do mesmo jeito, e nenhuma de acordo com a de
`wcag-proprio.ts`. Agora o predicado é um só, compartilhado. Com uma definição
só, elas não podem divergir de novo.

**7. A fixture tem de nascer conforme.**
Enquanto a minha reprovava 1.4.11, o `verificarWcagSemAxe` só havia sido visto
**reprovando** — e isso é indistinguível de "reprova sempre". Uma fixture que
nasce reprovada impede provar a direção que **aprova**. Hoje ele está provado
nas duas: reprova 2.80:1, aprova 3.54:1.

**8. Conferir o sha do blob publicado contra o local.**
O arquivo que publiquei tinha **1909 bytes a mais** que o que eu havia rodado:
um `replace` em python engoliu um bloco de comentário inteiro. Só o
`git hash-object` denunciou — o conteúdo "parecia certo" na leitura. Validar o
método primeiro, num arquivo não modificado, antes de confiar na comparação.

## Evidência não deve chamar de falha o que passa

O anexo `alvos-abaixo-de-44px.json` listava **como achado** controles de 24×24 a
43×43, que **estão conformes** com 2.5.8 (AA) e só não atingem a meta de 44px do
projeto. Evidência assim gasta o tempo de quem revisa e ensina a ignorar o
anexo. Agora cada linha traz `abaixoDe24` e o anexo separa `reprovados` de
`abaixoDaMetaSemReprovar`.

## Limite de toda medição acima

**Chromium apenas.** Os binários de firefox e webkit não existem na máquina de
verificação e `playwright install` precisa de rede bloqueada (bloqueio **B1**,
npm por DNS, #571). `firefox-desktop`, `webkit-desktop` e `mobile-390` falham
no *launch*, não no teste.

Isso importa aqui: o comportamento de `getComputedStyle` com pseudo-elemento
inválido e a heurística de `:focus-visible` podem diferir entre motores. Em
outro motor a asserção antiga poderia ser **vermelho** falso em vez de verde
falso — quebrada de qualquer jeito, mas não há como afirmar qual. A correção
para de depender desse comportamento e afere o efeito observável, que é por que
ela *deve* atravessar motores; a **medição**, porém, é de um motor só.

## Itens abertos, declarados

- **A fixture não prova a direção positiva do `@gate-etiqueta`.** Ela replica o
  DOM do #614, não o comportamento: não persiste a formatação nem aplica estilo
  na prévia. `FORMATACAO=1` tira a detecção de capacidade do SKIP e faz o caso
  asserir de verdade, mas as duas asserções reprovam por limite da fixture.
  Enquanto isso, aquele gate não está verificado na direção que passa.
- **As duas branches divergiram nos dois sentidos.** `claude/qa-e2e-acessibilidade`
  (#625) tem a versão nova de `etiquetas-editor.spec.ts`, `support/ambiente.ts` e
  deste arquivo; `claude/e2e-real-organizer-journeys` (#629) tem a versão nova de
  `publico-acessibilidade.spec.ts`, `compra-multipla.spec.ts` e
  `etiquetas-impressao.spec.ts`. Consequência concreta: **o #625 sozinho ainda
  carrega o skip-link com SKIP falso** (`locator.count()` não espera, e a
  asserção só checa foco, não que o link *pula*), que já está corrigido no #629.
  Mesclar o #625 primeiro, como está, levaria esse teste para a `develop`.
  Precisa de decisão de ordem de merge; não resolvo sozinho.
- **`"remover fixtures temporárias"`** do microcorte continua sem definição. As
  fixtures são as contraprovas de duas direções — sem elas não há como mostrar
  que um teste reprova quando deve.
