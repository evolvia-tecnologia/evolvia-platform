# Contraste dos tokens — medição e correção proposta (CL-06)

**Autoria:** Claude (Opus 5) — frente de Revisão Independente e Homologação Física.
**Medido contra:** `apps/web/app/design-tokens.css` em `claude/qa-e2e-acessibilidade@927de40d`.
**Verificável por:** `EVOLVIA_E2E_MODO=inventario npx playwright test --grep @contraste`

Este documento **propõe**. Não altera `apps/web`, não toca o PR #614 e não aplica
nada: a correção deve entrar por branch de quem é dono do código, revisada pelo
Gemini.

---

## O erro de método que eu cometi antes, e que esta medição corrige

Nas auditorias anteriores eu medi contraste **contra o branco**. Está errado como
método: o sistema tem cinco superfícies claras, e a mais escura delas é
`--color-surface-violet-soft` (`#f4eaff`). Toda razão cai ali.

Consequência concreta: na #570 eu disse que `#8a9cb5` levaria `--color-border` a
3:1. Depois corrigi para `#8396b0`. **As duas estavam erradas:**

| Cor | sobre `#ffffff` | sobre `#f4eaff` | pior caso |
|---|---|---|---|
| `#8a9cb5` — minha 1ª sugestão | 2,80:1 | 2,41:1 | reprova |
| `#8396b0` — minha 2ª sugestão | **3,02:1** | **2,60:1** | **reprova** |
| `#78879e` | 3,65:1 | 3,14:1 | passa |
| `#748399` — **proposta** | 3,85:1 | 3,31:1 | passa |

A segunda sugestão passava no teste que eu estava fazendo e reprovava no teste
que importava. É exatamente o tipo de erro que um número aferido à mão produz e
um gate automatizado não — motivo pelo qual a correção vem acompanhada do gate.

---

## Medição atual

### 1.4.11 — contraste de componente (mínimo 3:1)

**Nenhum token de borda opaco atinge 3:1 em nenhuma superfície clara.**

| Token | `surface` | `subtle` | `canvas` | `soft` | `violet-soft` |
|---|---|---|---|---|---|
| `--color-border` `#d9e2ef` | 1,31 | 1,25 | 1,21 | 1,18 | **1,12** |
| `--color-border-strong` `#c6d3e5` | 1,52 | 1,45 | 1,40 | 1,37 | **1,30** |

Toda borda de campo, select e caixa de marcação do sistema fica entre **1,12:1 e
1,52:1**, contra o mínimo de 3:1. Para quem tem baixa visão, **o limite dos
campos de formulário é invisível**. Afeta o Gate 1 (acessibilidade humana, ainda
pendente) e o Gate 2 (formulários de inscrição).

### 1.4.3 — contraste de texto

| Token | pior caso | superfície do pior caso | Veredito |
|---|---|---|---|
| `--color-text` `#10233d` | 13,58:1 | violet-soft | passa |
| `--color-text-strong` `#111a2f` | 14,89:1 | violet-soft | passa |
| `--color-text-muted` `#5d6f87` | **4,42:1** | violet-soft | **reprova** texto comum |
| `--color-text-subtle` `#71809a` | 3,44:1 | violet-soft | só texto grande |

`--color-text-muted` passa em 4,91:1 sobre branco e **reprova em 4,42:1** sobre a
superfície violeta. É marginal — 0,08 — mas 1.4.3 não tem faixa de tolerância.

---

## Correção proposta

### Parte 1 — token novo para borda de controle (risco zero)

A proposta **não escurece `--color-border`**, de propósito. O critério 1.4.11 se
aplica ao contorno que *identifica um componente*, não a divisor decorativo.
Escurecer o token global mudaria o peso visual de toda tabela, card e separador
do produto — uma mudança estética grande, que eu não tenho como avaliar sem ver
a aplicação, para resolver um problema que é só dos controles.

Então: **adicionar** um token, sem mexer nos existentes.

```diff
   --color-border: #d9e2ef;
   --color-border-strong: #c6d3e5;
+  /* Contorno que identifica um componente de interface: campo, select, caixa
+     de marcação, área de upload. WCAG 2.2 criterio 1.4.11 exige 3:1, e a
+     afericao precisa ser contra --color-surface-violet-soft (#f4eaff), que é a
+     superfície clara mais escura: medir contra #ffffff deixa passar cor que
+     reprova. #748399 dá 3,85:1 sobre branco e 3,31:1 no pior caso.
+     Divisor puramente decorativo continua em --color-border. */
+  --color-border-interactive: #748399;
```

Nada quebra: nenhum seletor existente muda de aparência até ser migrado.

### Parte 2 — migração, seletor por seletor

Só as bordas que **identificam controle** adotam o token novo:

```css
input, select, textarea,
input[type="checkbox"], input[type="radio"],
[role="combobox"], [role="checkbox"],
.dropzone, .upload {
  border-color: var(--color-border-interactive);
}
```

O inventário exato dos seletores depende de varredura em `apps/web`, que eu não
consigo fazer: `add_repo` recusa o clone deste repositório. **Entrego a
ferramenta em vez do resultado:**

```bash
python3 tools/auditar-css.py apps/web --json
```

Ela já relata alvo de toque, token inexistente, vocabulário paralelo e conflito
de cascata, e sai com código 1 em achado de severidade ALTA — serve como gate.

### Parte 3 — `--color-text-muted`

```diff
-  --color-text-muted: #5d6f87;
+  --color-text-muted: #5c6d85;   /* 4,54:1 no pior caso; era 4,42:1 */
```

Diferença visualmente imperceptível, resolve o 1.4.3 em todas as superfícies.

### Parte 4 — `--color-text-subtle`: decisão de produto, não minha

`#71809a` dá 3,44:1 no pior caso: atende **texto grande** (≥ 18,66 px negrito ou
≥ 24 px) e não texto comum. Dois desfechos legítimos:

- **(a)** documentar no design system que é exclusivo de texto grande, e fazer o
  auditor de CSS reprovar seu uso em `font-size` menor; ou
- **(b)** escurecer para `#5f6d85` (4,50:1) e liberar para qualquer tamanho.

**Não escolho por vocês.** (a) preserva a hierarquia visual que alguém desenhou
de propósito; (b) é mais simples de manter. O gate atual cobra apenas os 3:1 de
texto grande, para não inventar um requisito que ninguém declarou.

---

## O gate que acompanha

`tests/e2e/specs/tokens-contraste.spec.ts` mede o arquivo e reprova. Executado:

```
PASS  3   superfícies de referência · texto grande · conjunto de tokens medido
FAIL  2   1.4.3 (--color-text-muted) · 1.4.11 (nenhuma borda em 3:1)
```

As duas falhas são a evidência dos defeitos acima; **não devem ser consertadas
afrouxando a asserção.** Com a correção aplicada, viram verde sozinhas.

Dois detalhes de desenho do gate que valem explicar:

- **Mede contra as cinco superfícies**, não contra branco. Foi o que pegou meu
  próprio erro.
- **Fixa o conjunto de tokens de cor opacos que conhece.** Se alguém adicionar
  um token novo, o gate falha e obriga a decidir se ele entra na medição. Um
  gate que não sabe o que deixou de medir não é gate.

Ele roda sem navegador, sem ambiente e sem registro npm:

```bash
EVOLVIA_E2E_MODO=inventario npx playwright test --grep @contraste
```

---

## O que isto **não** cobre

- **Composição em tela.** Token aprovado não garante tela aprovada: `opacity`,
  sobreposição e gradiente mudam o resultado. Quem cobre isso é
  `support/wcag-proprio.ts` (que resolve o fundo efetivo subindo a árvore) e o
  axe, ambos dependentes de ambiente publicado.
- **Tokens `rgba()`.** Vidro e bordas sobre fundo escuro ficam fora: o resultado
  depende do que está atrás, que só a varredura em tela sabe.
- **Modo escuro.** `design-tokens.css` declara `color-scheme: light` e não traz
  bloco `prefers-color-scheme: dark`. Se houver intenção de tema escuro, a
  medição precisa ser repetida inteira — nenhum número aqui vale para ele.
- **Impressão térmica.** A paleta das etiquetas do #614 passa com folga no
  modelo de cor (pior caso 6,29:1), mas em transferência térmica monocromática
  as sete cores tendem a sair na cor do ribbon. Isso só o teste físico resolve;
  está no Bloco B3 do roteiro de homologação.
