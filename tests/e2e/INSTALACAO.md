# Instalação e execução da suite E2E

## Caminho normal (máquina com rede)

```bash
cd tests/e2e
npm install                     # gera package-lock.json na primeira vez
git add package-lock.json       # versionar o lockfile gerado aqui
npx playwright install --with-deps chromium firefox webkit
```

Daí em diante, sempre `npm ci` (não `npm install`), que é o que respeita o lockfile.

Conferir que a suite compila, sem precisar de ambiente:

```bash
EVOLVIA_E2E_MODO=inventario npx playwright test --list
```

Executar contra homologação:

```bash
export EVOLVIA_E2E_BASE_URL=https://homolog.exemplo/      # nunca produção
export EVOLVIA_E2E_EMAIL=...                              # conta de teste
export EVOLVIA_E2E_SENHA=...
export EVOLVIA_E2E_EVENTO_ID=...
npx playwright test
```

---

## Bloqueio declarado: `package-lock.json` não está versionado

**Não há lockfile neste diretório e ele não foi forjado.**

Um `package-lock.json` escrito à mão, ou copiado de outro projeto, carrega
hashes de integridade que não correspondem aos tarballs reais. `npm ci` então
falha na verificação — ou, pior, aceita um pacote que ninguém auditou. Um
lockfile inventado é menos seguro que lockfile nenhum, porque mente.

### Erro exato, reproduzível

Ambiente: container Linux 6.18, Node v22.23.4, npm 10.9.9, sem DNS para o
registro.

```console
$ cd tests/e2e && npm install --package-lock-only
npm error code ENOTFOUND
npm error syscall getaddrinfo
npm error errno ENOTFOUND
npm error network request to https://registry.npmjs.org/@playwright%2ftest failed,
npm error network reason: getaddrinfo ENOTFOUND registry.npmjs.org
```

Confirmado que é DNS, não proxy:

```console
$ getent hosts registry.npmjs.org
(sem saída)
$ curl -x "$HTTPS_PROXY" https://registry.npmjs.org/@playwright%2ftest
curl: (6) Could not resolve host: registry.npmjs.org
```

O proxy do ambiente lista `registry.npmjs.org` em `noProxy`, ou seja, o tráfego
deveria sair direto — e não há resolução de nome para ele. Nenhuma variação de
`--proxy`, `--registry` ou `--offline` contorna ausência de DNS.

### Quem desbloqueia, e como

Qualquer máquina com acesso ao registro (a do Codex, um runner do CI, a de
qualquer pessoa do time):

```bash
cd tests/e2e
npm install --package-lock-only          # só resolve a árvore, não baixa nada
git add package-lock.json
git commit -m "chore(qa): lockfile da suite E2E"
```

### Como conferir que o lockfile recebido é legítimo

Antes de confiar nele:

```bash
cd tests/e2e
npm ci                                   # falha se algum integrity não bater
npm ls --all                             # árvore efetiva
npm audit --audit-level=high             # vulnerabilidade conhecida
# as versões instaladas precisam casar com as faixas de package.json:
node -e "for (const p of ['@playwright/test','@axe-core/playwright','axe-core']) \
  console.log(p, require(p + '/package.json').version)"
```

As versões em `devDependencies` estão fixadas em valor exato (sem `^`), para
que o que o CI instala seja o que foi revisado.

---

## Alternativa sem rede (não substitui o lockfile)

Se a máquina já tem Playwright instalado globalmente, há um atalho que torna a
suite executável sem baixar nada:

```bash
bash tools/preparar-runner-offline.sh
```

Ele monta `tests/e2e/node_modules` (não versionado) com links simbólicos para o
pacote `playwright` global, e um atalho `@playwright/test` → `playwright/test`.
Desde a série 1.x o pacote `playwright` expõe o próprio executor de testes em
`playwright/test`, portanto é o mesmo executor, não uma reimplementação.

O script **não** baixa nada, **não** escreve lockfile e **não** instala
`axe-core`. Sem `axe-core`, os testes de varredura axe saem **SKIP com motivo
declarado** e as verificações de `support/wcag-proprio.ts` continuam valendo —
elas são deterministas e independentes do axe, cobrindo os critérios 1.4.3,
1.4.10, 1.4.11, 1.3.1, 2.5.8 e 4.1.2. Isso é cobertura menor que a do axe
(6 critérios contra ~90 regras), e está declarado como tal.

Verificado neste container: `playwright@1.63.0` global, suite executando em
Chromium real.

---

## Verificar a suite sem ambiente de homologação

```bash
bash tools/verificar-suite.sh
```

Sobe uma fixture local que replica o DOM de
`apps/web/components/credential-category-templates.tsx` e roda a suite contra
três variantes, conferindo que PASS, FAIL e SKIP se diferenciam de verdade.
Sai com código 1 se a diferenciação não aparecer.

**Verde aqui valida a suite, não a Evolvia.** A fixture é um dublê de DOM; ela
não tem API, banco, nem regra de negócio. Homologação exige ambiente autorizado.

---

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `EVOLVIA_E2E_BASE_URL` | sim | URL de homologação. A suite recusa produção. |
| `EVOLVIA_E2E_EMAIL` | testes autenticados | conta de teste, nunca pessoal |
| `EVOLVIA_E2E_SENHA` | testes autenticados | — |
| `EVOLVIA_E2E_EVENTO_ID` | testes autenticados | evento fictício de homologação |
| `EVOLVIA_E2E_EVENTO_SLUG` | testes públicos | evento publicado fictício |
| `EVOLVIA_E2E_EVENTO_SLUG_PAGO` | compra múltipla | evento pago fictício |
| `EVOLVIA_E2E_MODO=inventario` | não | lista casos sem ambiente |

Nenhuma credencial entra no repositório. No CI elas vêm de *secrets*; em
máquina local, do shell. Sem as variáveis de autenticação os testes
correspondentes saem SKIP com motivo declarado — e, se forem gate obrigatório,
o relator converte esse SKIP em falha.
