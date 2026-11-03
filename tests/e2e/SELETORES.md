# Conferência de seletores — placar e achados

**Autoria:** Claude (Opus 5) — frente de Revisão Independente e Homologação Física.
**Conferido em:** 02 e 03/11/2026, contra o código real, em `claude/e2e-real-organizer-journeys`.

## Placar: sete de sete telas conferidas tinham defeito

| Tela / módulo | Spec | Defeitos | Produziria |
|---|---|---|---|
| Editor de etiquetas | `etiquetas-editor.spec.ts` | 1 | vermelho falso em 5 asserções |
| Casca do painel | `support/organizador.ts` | 1 | timeout de 30 s em **todo** teste móvel |
| `lib/event-flow.ts` | `perfis-navegacao.spec.ts` | 1 | lacuna de Transmissão subdimensionada |
| Categorias e lotes | `jornada-organizador.spec.ts` | 4 | vermelho falso + preenchimento silencioso errado |
| Cupons e convites | `jornada-beneficios.spec.ts` | 3 | gate obrigatório falhando na 1ª linha |
| Responsável financeiro | `jornada-organizador.spec.ts` | jornada inteira | testava algo que a tela não faz |
| Superfícies públicas | `publico-acessibilidade.spec.ts` | 2 | **verde falso**: SKIP escondia o achado |

**Nenhum apareceria em leitura superficial.** Três só apareceram executando.

### Os dois lados do erro

Os seis primeiros defeitos produziriam **vermelho falso** — culpar o produto por
algo que ele não prometeu. O sétimo é o espelho: **verde falso**. Vale separar,
porque pedem defesas opostas:

| | causa | sintoma | defesa |
|---|---|---|---|
| vermelho falso | seletor inventado, capacidade ausente | reprova sem defeito | ler o componente; detectar capacidade |
| **verde falso** | SKIP condicional, assertiva fraca | **passa com defeito** | SKIP só para capacidade que o produto não tem; assertar o efeito, não o elemento |

Eu construí o mecanismo contra vermelho falso primeiro, e ele abriu caminho para
o segundo: `if (count === 0) test.skip(...)` parece prudente e é, na verdade,
uma aprovação silenciosa quando o padrão **existe** no produto.

**Regra:** SKIP só quando a capacidade ainda não foi construída, com o PR que a
traz nomeado. Se o padrão já existe em outra tela do mesmo repositório, ausência
é desvio e **reprova**.

> Isto recalibra a confiança na suite: ela **não estava pronta** para a primeira
> execução contra homologação. Estaria produzindo vermelho falso em massa, e
> alguém leria isso como defeito do produto — e, nas superfícies públicas,
> verde falso, que é pior: ninguém vai investigar um gate verde.

---

## Por que o erro se repetiu

Quatro causas distintas, que vale separar porque pedem defesas diferentes:

**1. Rótulo inventado em vez de lido.** Eu escrevi `/nome da categoria/`,
`/nome do lote/`, `/adicionar cupom/` — todos plausíveis, nenhum existente. O
rótulo real é `Nome`, e os botões são `+ Cupom`, `+ Convite`, `+ Cortesia`.
*Defesa:* ler o componente antes de escrever o seletor. Não há atalho.

**2. Ignorar multiplicidade.** `Adicionar categoria` e `Salvar configuração`
são renderizados **duas vezes** (cabeçalho e rodapé). Sem `.first()`/`.last()`
o Playwright nem chega a falhar por asserção: estoura antes, com
**strict mode violation**. E `Nome` aparece duas vezes dentro do mesmo
`fieldset` — um `getByLabel('Nome')` ingênuo **preencheria o campo errado em
silêncio, com o teste passando**.
*Defesa:* assertar a contagem, não só o alvo.

**3. Modelo mental errado.** A jornada-5 procurava corrigir dados PF/PJ numa
tela que apenas **confirma** — a edição mora em
`/organizacoes/{id}/dados-fiscais`. Aqui trocar o seletor não resolvia nada.
*Defesa:* ler o fluxo, não só os elementos.

**4. Assertar o elemento em vez do efeito.** O teste do *skip-link* verificava
que o link recebia foco. Nunca verificou que ele **pulava** algo — e em duas
páginas não pulava, porque o `<main>` envolve a navegação. Um teste que confirma
a presença de um controle não confirma que o controle funciona.
*Defesa:* assertar a consequência observável, não a existência do elemento.

---

## Técnica adotada

**Escopo por `role=group` usando o `<legend>`.** `<fieldset>` expõe
`role=group` e usa o `<legend>` como nome acessível, então `"Categoria 1"`,
`"Lote 1"`, `"Convite 1"` são alvos estáveis:

```ts
const categoria = page.getByRole('group', { name: /^Categoria 1$/u });
const lote = categoria.getByRole('group', { name: /^Lote 1$/u });
```

**Nunca classes de CSS Module.** São hasheadas no build —
`registration-commercial-builder_category__a1b2c`. A fixture
`fixture/comercial.cjs` usa hashes fictícios **de propósito**: qualquer seletor
que dependa de nome de classe falha nela.

**Contagem asserida onde há ambiguidade:**

```ts
expect(await campos.count(),
  'esperava 2 campos "Nome": o da categoria e o do lote aninhado.').toBe(2);
```

Uma reordenação futura falha ali, em vez de preencher o campo errado.

**Confirmação positiva, não ausência de erro.** Os componentes usam
`role=status` no sucesso e `role=alert` no erro. Checar só
`getByRole('alert')).toHaveCount(0)` passa **sem ter salvo**. As jornadas agora
exigem o `status` com `/salvos/`.

**Fixture de duas direções para cada assertiva nova.** Uma assertiva só vale se
reprovar o caso quebrado **e** passar no correto. `fixture/bypass.cjs` tem quatro
rotas por isso: `/correto` (passa), `/quebrado` (reprova), `/sem-link` (reprova,
não pula) e `/card-com-footer` (passa — `<footer>` dentro de `<article>` já não é
`contentinfo`, então acusar seria culpar o produto por marcação correta).

A quarta rota existe para proteger contra um erro **meu**: uma assertiva fiel só
ao código de hoje vira falso-positivo quando o código muda legitimamente.

---

## Tabela de conferência

### `registration-commercial-builder.tsx` (categorias e lotes)

| Seletor | Existe? | Realidade |
|---|---|---|
| `getByRole('group', {name:/^Categoria \d+$/})` | ✓ | `<legend>Categoria N</legend>` |
| `getByRole('group', {name:/^Lote \d+$/})` | ✓ | `<legend>Lote N</legend>` |
| `getByLabel('Nome', {exact:true})` | ✓ | **2 por categoria**: dela e do lote |
| `'Adicionar categoria'` | ✓ | **2×**, só se `categories.length > 0` |
| `'Criar primeira categoria'` | ✓ | só no estado vazio |
| `'Salvar configuração'` | ✓ | **2×**, `disabled` sem alteração pendente |
| `'Adicionar lote'` | ✓ | 1 por categoria |
| `role=status` com `/salvos/` | ✓ | "Categorias e lotes salvos." |
| ~~`/nome da categoria/`~~ | **✗** | o rótulo é só `Nome` |
| ~~`/nome do lote/`~~ | **✗** | o rótulo é só `Nome` |

### `registration-benefits-builder.tsx` (cupons e convites)

| Seletor | Existe? | Realidade |
|---|---|---|
| `'+ Convite'` | ✓ | sempre habilitado |
| `'+ Cupom'`, `'+ Cortesia'` | ✓ | **`disabled` se o evento não é pago** |
| `getByLabel('Código', {exact:true})` | ✓ | `disabled` após o 1º salvamento |
| `'Salvar benefícios'` | ✓ | 1×, `type=submit`, no **topo** |
| `/desconto/` | ✓ | **`disabled` fora de CUPOM** |
| ~~`/adicionar (cupom\|benefício\|convite)/`~~ | **✗** | "Adicionar benefício" é `aria-label` de um `<div>` |
| ~~`/código/` (não exato)~~ | **✗** | casa também com a caixa `Código ativo` |

### `financeiro/page.tsx` (responsável financeiro)

| Seletor | Existe? | Realidade |
|---|---|---|
| `heading 'Responsável financeiro'` | ✓ | `<h1>` |
| `/confirmar (responsável financeiro\|novamente)/` | ✓ | só habilita em DRAFT/SETUP/HOMOLOGATION |
| `link /dados PF\/PJ da organização/` | ✓ | → `/organizacoes/{id}/dados-fiscais` |
| `group /quem paga a comissão/` | ✓ | 2 radio |
| `definition` com `/terminado em \w{2}/` | ✓ | `maskTaxId` — **o documento nunca aparece completo** |
| ~~`/corrigir\|alterar dados\|editar/`~~ | **✗** | não existe botão assim |
| ~~`getByRole('textbox')`~~ | **✗** | a tela **não tem textbox nenhum** |

### `event-workspace.tsx` (casca do painel)

| Seletor | Existe? | Observação |
|---|---|---|
| `navigation /navegação do evento/` | ✓ | **`aria-hidden` ≤ 900 px com menu fechado** |
| `button /mostrar menu lateral/` | ✓ | alterna com "Ocultar menu lateral" |
| `group /secretaria e credenciamento/` | ✓ | contém Credenciamento e Totens |
| `link /totens/` | ✓ | href termina em `/painel/check-in#totens` |
| `[data-shell="panel"]` / `"operation"` | ✓ | a casca aparece antes da navegação |

### Superfícies públicas (`publico-acessibilidade.spec.ts`)

| Seletor / estrutura | Existe? | Realidade |
|---|---|---|
| `link /pular para o conteúdo/` | ✓ | em **4** componentes, não no layout raiz |
| `#main-content` | ✓ | o `<main>`, com `tabIndex={-1}` |
| `navigation /navegação principal/` | ✓ | `public-site-header.tsx` |
| rotas `/`, `/eventos`, `/login`, `/acessibilidade` | ✓ | todas existem |
| header **fora** do `<main>` | **✗ em 2 de 4** | `/` e `/eventos` envolvem o header |
| ~~`if (count===0) test.skip()`~~ | — | **virava verde falso**; agora reprova |

**Achado de produto:** em `app/page.tsx` e `app/eventos/page.tsx` o
`<main id="main-content">` envolve o `<header>`, então o *skip-link* leva o foco
para um ponto **antes** da navegação — não pula nada (WCAG 2.2 2.4.1, nível A).
Mesma causa faz `<header>` perder `banner` e `<footer>` perder `contentinfo`.
A estrutura correta já existe em `app/login/page.tsx` e
`components/public-help-article.tsx`.

---

## Um achado positivo

`financeiro/page.tsx` mascara CPF/CNPJ com `maskTaxId` → `"terminado em XX"`.
**Nada estava verificando isso.** A jornada-5 agora assere duas coisas: que a
máscara aparece, e que **nenhum CPF completo** aparece na tela. Um documento
inteiro vazando ali seria achado de segurança, e o teste anterior não notaria.

---

## Nota de método: busca vazia não é evidência de ausência

Procurei `"Pular para"` e `skip-link` com a busca de código do GitHub: **zero
resultados** nas duas. Lendo os arquivos direto, o *skip-link* está em quatro
componentes. O índice está incompleto para este repositório.

**Só leitura direta de arquivo autoriza afirmar que algo não existe.** Isto vale
para qualquer frente que use a mesma ferramenta para concluir que falta algo.

---

## Pendente de conferência

| Tela | Spec | Situação |
|---|---|---|
| `/organizacoes/{id}/dados-fiscais` | `jornada-organizador.spec.ts` | **`test.fixme`** — não escrito no escuro |
| Impressão de etiqueta | `etiquetas-impressao.spec.ts` | não conferida |
| `/evento/{slug}` | `publico-acessibilidade.spec.ts` | não conferida |
| Ficha de inscrição | `jornada-1b` | o campo de arquivo só foi suposto |

**Suponha que têm defeito.** A taxa é de **sete em sete**, e a amostra já não é
pequena. `jornada-5b` ficou marcada `test.fixme` em vez de escrita no escuro,
justamente por isso: escrever sem conferir é produzir mais vermelho falso.

## Regras adotadas

**1. Nenhum seletor novo sem ler o componente.** E, onde houver ambiguidade de
multiplicidade, a contagem vai asserida junto — para que o teste falhe ao
mudar, em vez de acertar o alvo errado em silêncio.

**2. Assertar o efeito, não o elemento.** Presença de controle não é prova de
que o controle funciona. O *skip-link* existia, recebia foco e não pulava nada.

**3. SKIP só para capacidade que o produto ainda não tem**, com o PR que a traz
nomeado. Se o padrão já existe em outra tela do mesmo repositório, ausência é
desvio e **reprova**. SKIP condicional sobre padrão existente é aprovação
silenciosa.

**4. Busca vazia não é evidência de ausência.** Só leitura direta de arquivo
autoriza afirmar que algo não existe neste repositório.
