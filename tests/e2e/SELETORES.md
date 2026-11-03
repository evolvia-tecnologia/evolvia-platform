# Conferência de seletores — placar e achados

**Autoria:** Claude (Opus 5) — frente de Revisão Independente e Homologação Física.
**Conferido em:** 02 e 03/11/2026, contra o código real, em `claude/e2e-real-organizer-journeys`.

## Placar: seis de seis telas conferidas tinham defeito

| Tela / módulo | Spec | Defeitos | Produziria |
|---|---|---|---|
| Editor de etiquetas | `etiquetas-editor.spec.ts` | 1 | vermelho falso em 5 asserções |
| Casca do painel | `support/organizador.ts` | 1 | timeout de 30 s em **todo** teste móvel |
| `lib/event-flow.ts` | `perfis-navegacao.spec.ts` | 1 | lacuna de Transmissão subdimensionada |
| Categorias e lotes | `jornada-organizador.spec.ts` | 4 | vermelho falso + preenchimento silencioso errado |
| Cupons e convites | `jornada-beneficios.spec.ts` | 3 | gate obrigatório falhando na 1ª linha |
| Responsável financeiro | `jornada-organizador.spec.ts` | jornada inteira | testava algo que a tela não faz |

**Nenhum apareceria em leitura superficial.** Três só apareceram executando.

> Isto recalibra a confiança na suite: ela **não estava pronta** para a primeira
> execução contra homologação. Estaria produzindo vermelho falso em massa, e
> alguém leria isso como defeito do produto.

---

## Por que o erro se repetiu

Três causas distintas, que vale separar porque pedem defesas diferentes:

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

---

## Um achado positivo

`financeiro/page.tsx` mascara CPF/CNPJ com `maskTaxId` → `"terminado em XX"`.
**Nada estava verificando isso.** A jornada-5 agora assere duas coisas: que a
máscara aparece, e que **nenhum CPF completo** aparece na tela. Um documento
inteiro vazando ali seria achado de segurança, e o teste anterior não notaria.

---

## Pendente de conferência

| Tela | Spec | Situação |
|---|---|---|
| `/organizacoes/{id}/dados-fiscais` | `jornada-organizador.spec.ts` | **`test.fixme`** — não escrito no escuro |
| Compra múltipla | `compra-multipla.spec.ts` | não conferida |
| Impressão de etiqueta | `etiquetas-impressao.spec.ts` | não conferida |
| Páginas públicas | `publico-acessibilidade.spec.ts` | não conferida |
| Ficha de inscrição | `jornada-1b` | o campo de arquivo só foi suposto |

**Suponha que têm defeito.** A taxa até agora é de seis em seis, e a amostra já
não é pequena. `jornada-5b` ficou marcada `test.fixme` em vez de escrita no
escuro, justamente por isso: escrever sem conferir é produzir mais vermelho
falso.

## Regra adotada

**Nenhum seletor novo sem ler o componente.** E, onde houver ambiguidade de
multiplicidade, a contagem vai asserida junto — para que o teste falhe ao
mudar, em vez de acertar o alvo errado em silêncio.
