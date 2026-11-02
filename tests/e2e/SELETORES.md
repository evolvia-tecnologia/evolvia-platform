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
