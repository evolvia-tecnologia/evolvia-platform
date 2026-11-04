# Auditor Claude via GitHub Actions — issue #622

Aciona uma auditoria automatizada de um pull request por `workflow_dispatch`,
sem depender da conversa do site. Publica o relatório numa **issue**.

## Por que existe

A sessão do Claude no site só executa quando alguém manda mensagem. **Um
comentário de issue não a acorda.** Enquanto a única via for a conversa, a fila
C1–C6 anda apenas quando o PO está na frente do teclado. Este caminho troca
isso por um disparo manual no GitHub.

## O que ele NÃO é

- **Não é aprovação independente.** O relatório sai assinado como auditoria
  automatizada. O `AGENTS.md` continua exigindo revisor distinto com permissão.
- **Não mescla, não publica, não faz deploy, não muda permissões nem branches.**
  As `permissions` do workflow são `contents: read`, `pull-requests: read` e
  `issues: write`. Não há `contents: write` nem `pull-requests: write`.
- **Não substitui QA físico.** Impressora e operador reais continuam exigidos.

## Instalação

### 1. Mover o workflow (precisa de escopo `workflow`)

```bash
git mv tools/auditor-claude/auditor-claude.yml .github/workflows/auditor-claude.yml
```

O arquivo está aqui, e não em `.github/workflows/`, porque o token do conector
com que o Claude trabalha **não tem escopo `workflow`** e recebe 403 ao gravar
naquele caminho. O conteúdo não precisa de ajuste: é só mover.

### 2. Criar o environment `claude-qa`

`Settings > Environments > New environment > claude-qa`.

Vale exigir aprovação manual por execução (`Required reviewers`). Isso dá um
ponto de controle humano antes de cada gasto de token.

### 3. Cadastrar o secret — **nunca** em issue, chat, commit ou env de browser

`Settings > Environments > claude-qa > Add secret`:

| nome | valor |
|---|---|
| `ANTHROPIC_API_KEY` | chave criada na Anthropic Console |

Crie uma chave **dedicada**, com **limite de gastos** definido na Console. Se a
chave vazar, o limite é o que impede a conta de sangrar.

O `GITHUB_TOKEN` é fornecido pelo próprio Actions; não cadastre nada para ele.

### 4. Disparar

`Actions > Auditor Claude (API) > Run workflow`, informando:

| entrada | exemplo | observação |
|---|---|---|
| `pr` | `614` | PR a auditar |
| `sha` | `46859dd0` | **obrigatória.** O script recusa se não for a HEAD do PR |
| `issue` | `570` | onde o relatório é publicado |
| `modelo` | `claude-sonnet-5-5` | validado no runtime; nome inválido falha com mensagem clara |

## Como ele se protege

| risco | o que impede |
|---|---|
| execução de código de PR não confiável com o secret | só `workflow_dispatch`; o checkout é da branch do disparo, nunca do HEAD do PR; o diff entra pela API, como texto |
| injeção de prompt pelo diff | o diff vai como **dado**, entre cerca sorteada por execução, com instrução de tratar pedido de aprovação como achado. **É mitigação, não imunidade** — o que impede estrago real é o auditor não ter ferramenta nem permissão de escrita além de comentário |
| segredo ou PII no relatório | `semSegredos()` roda no diff **e** no texto devolvido pelo modelo: chave Anthropic, token GitHub, JWT, chave privada PEM, e-mail e CPF |
| relatório duplicado e token gasto duas vezes | marcador `<!-- auditor-claude sha=… tipo=… -->`; se já existe para a SHA, não republica |
| disparo simultâneo | `concurrency` por PR+SHA |
| auditoria irreproduzível | SHA obrigatória, conferida contra a HEAD do PR |
| custo descontrolado | `max_tokens` 4000, diff limitado a 180 KB e 60 arquivos, `timeout-minutes: 15` |
| 429 e instabilidade da API | retentativa com espera crescente em 429/408/5xx; 4xx não repete |
| lockfile comendo o orçamento | lockfiles filtrados por **nome**, não por extensão |

## Limites do recorte, que o relatório declara

O relatório lista, aberto, **o que ficou fora**: binários, lockfiles, caminhos
sensíveis, arquivos sem `patch` no retorno da API e o que foi cortado por
limite. Silêncio sobre um arquivo não é conformidade dele — e o relatório diz
isso com essas palavras.

## Testes

```bash
node --test tools/auditor-claude/
```

Nove casos, sem rede: filtro do recorte, remoção de segredo (incluindo segredo
que o **modelo** repita na resposta), idempotência, validação de argumentos,
política de retentativa, montagem do prompt contra um diff malicioso, e o
relatório declarando o que não avaliou.

Um deles pegou um defeito meu antes de ir ao repositório: `package-lock.json`
passava pelo filtro, porque a extensão é `.json` e eu filtrava só `.lock`.

## O que ainda não foi provado

A chamada real à Messages API **nunca foi executada**: não há chave neste
ambiente, e eu não peço nem recebo chave por conversa. O que está verificado é
tudo que não depende de rede. O primeiro disparo é calibração: trate o
resultado como tal, e confira o custo na Console.
