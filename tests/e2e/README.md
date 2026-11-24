# Suite E2E, acessibilidade e auditoria de CSS

Frente de qualidade independente da Evolvia. Pacote **isolado**: não altera
`apps/api`, `apps/web`, `package.json` da raiz nem `validacao-v02.yml`.

## Por que existe

A cobertura Web atual verifica, em boa parte, **o texto do código-fonte por
expressão regular** (`assert.match(editor, /Negrito/u)`). Esse estilo não teria
detectado dois defeitos reais encontrados na auditoria do PR #614:

- impressão pelo navegador contornando o bloqueio de etiqueta ilegível;
- totem imprimindo sem aplicar o modelo por categoria.

Aqui os testes exercitam a interface real, em navegador real.

## Pré-requisitos

- Node 22
- Um ambiente **de homologação** já publicado. A configuração recusa produção.

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `EVOLVIA_E2E_BASE_URL` | sim | URL do ambiente. Sem ela nada roda. |
| `EVOLVIA_E2E_EMAIL` | para `@autenticado` | Conta de organizador |
| `EVOLVIA_E2E_SENHA` | para `@autenticado` | Senha |
| `EVOLVIA_E2E_EVENTO_ID` | para `@autenticado` | Evento com credenciamento ativo |
| `EVOLVIA_E2E_EVENTO_SLUG` | para evento público | Evento publicado |
| `EVOLVIA_E2E_EVENTO_SLUG_PAGO` | para compra múltipla | Evento publicado e pago |

Os blocos sem variável são **ignorados com motivo explícito**, nunca aprovados
em silêncio.

## Execução

```bash
cd tests/e2e
npm install
npm run instalar-navegadores
EVOLVIA_E2E_BASE_URL=https://homologacao.exemplo.com npm test
```

Recortes: `npm run test:publico`, `test:autenticado`, `test:acessibilidade`,
`test:responsivo`. Relatório: `npm run report`.

## O que é coberto

| Área | Arquivo |
|---|---|
| Editor de etiquetas: persistência de alinhamento, negrito, cor, fonte e tamanho; prévia; teclado; axe; alvos de toque; 320/390 px | `specs/etiquetas-editor.spec.ts` |
| Bloqueio de impressão ilegível, incluindo `Ctrl+P` | `specs/etiquetas-impressao.spec.ts` |
| Compra múltipla: limites de 2 a 10, documento repetido, axe, 320/390 px | `specs/compra-multipla.spec.ts` |
| Superfícies públicas do Gate 1: axe e reflow | `specs/publico-acessibilidade.spec.ts` |

## Limites deliberados

- **Nenhum teste conclui pagamento.** A suite para na reserva. Não aciona
  gateway nem sandbox.
- **Nenhum teste aciona impressora física.** Verifica o DOM e se `window.print`
  foi chamado. A homologação em Zebra TLP 2844 é manual, por roteiro à parte.
- O axe falha apenas em violações `serious` e `critical`; as demais ficam
  anexadas ao relatório para triagem, sem mascarar nada.
- Alvo de toque: falha abaixo de 24×24 px (WCAG 2.2, critério 2.5.8) e anexa a
  lista dos que ficam abaixo dos 44 px adotados pelo projeto.

## Pendências conhecidas

1. **`package-lock.json` não versionado.** O registro npm estava inacessível no
   ambiente onde a suite foi escrita. Rodar `npm install --package-lock-only`
   em `tests/e2e/` e versionar o resultado; depois trocar `npm install` por
   `npm ci` no workflow.
2. **As versões das dependências não foram resolvidas** contra o registro. Estão
   em faixa `^`; conferir na primeira instalação.
3. **O workflow `.github/workflows/qa-e2e-acessibilidade.yml` não pôde ser
   versionado pelo autor**: o token do conector não tem escopo `workflow`. O
   conteúdo está no PR, para o Codex adicionar.
4. **A suite nunca foi executada contra um ambiente real** pelo autor, que não
   tem acesso à homologação. Os arquivos passaram apenas por validação
   estrutural. A primeira execução deve ser tratada como calibração: seletores
   podem precisar de ajuste.

## Autoria

Claude (Opus 5) — frente de Revisão Independente e Homologação Física.
Conforme o `AGENTS.md`, quem escreve não revisa: esta branch exige revisor
distinto.
