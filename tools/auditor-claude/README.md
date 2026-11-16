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
naquele caminho. O conteúdo não precisa de ajuste: é só mover — o `run:` chama
`node tools/auditor-claude/auditar-pr.mjs`, caminho a partir da raiz do
repositório, que continua válido depois da mudança.

Isto foi **reverificado em 16/11/2026**, e não é suposição herdada: uma tentativa
de gravar em `.github/workflows/` devolveu `403 Resource not accessible by
integration` na criação da árvore. A falha é atômica, então nada foi criado.

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

## Variáveis de ambiente

| variável | padrão | para que |
|---|---|---|
| `AUDITOR_LIMITE_BYTES` | `180000` | teto do diff enviado |
| `AUDITOR_LIMITE_ARQUIVOS` | `60` | teto de arquivos no recorte |
| `AUDITOR_LIMITE_TOKENS` | `4000` | `max_tokens` da resposta |
| `AUDITOR_TIMEOUT_MS` | `120000` | tempo limite por requisição |
| `AUDITOR_TENTATIVAS` | `3` | tentativas em 429/408/5xx |
| `AUDITOR_MODELO` | `claude-sonnet-5-5` | modelo, se `--modelo` não vier |
| `AUDITOR_API_GITHUB` | `https://api.github.com` | base da API do GitHub |
| `AUDITOR_API_ANTHROPIC` | `https://api.anthropic.com/v1` | base da API da Anthropic |

As duas últimas existem por dois motivos: permitem o **teste de integração**
contra um servidor local, e permitem apontar para um gateway corporativo sem
fork. Código que não dá para testar sem credencial não é testado.

## Como ele se protege

| risco | o que impede |
|---|---|
| execução de código de PR não confiável com o secret | só `workflow_dispatch`; o checkout é da branch do disparo, nunca do HEAD do PR; o diff entra pela API, como texto |
| injeção de prompt pelo diff | o diff vai como **dado**, entre cerca sorteada por execução, com instrução de tratar pedido de aprovação como achado. **É mitigação, não imunidade** — o que impede estrago real é o auditor não ter ferramenta nem permissão de escrita além de comentário |
| segredo ou PII no relatório | `semSegredos()` roda no diff **e** no texto devolvido pelo modelo: chave Anthropic, token GitHub, JWT, chave privada PEM, e-mail e CPF |
| relatório duplicado e token gasto duas vezes | marcador `<!-- auditor-claude sha=… tipo=… -->`; se já existe para a SHA, não republica |
| disparo simultâneo | `concurrency` por PR+SHA |
| auditoria irreproduzível | SHA obrigatória, conferida contra a HEAD do PR |
| **relatório de código que já não é o atual** | a HEAD é **reconferida depois do modelo e antes de publicar**; se mudou, o relatório abre com aviso nomeando as duas SHAs |
| custo descontrolado | `max_tokens` 4000, diff limitado a 180 KB e 60 arquivos, `timeout-minutes: 15` |
| 429 e instabilidade da API | retentativa com espera crescente em 429/408/5xx; 4xx não repete |
| lockfile comendo o orçamento | lockfiles filtrados por **nome**, não por extensão |
| **injeção de comando pelas entradas do disparo** | as entradas vão por `env:`, nunca interpoladas no texto do `run:`, e há teste negativo que recusa qualquer interpolação fora de `env:`/`concurrency:` |
| falha de rede transitória abortando a auditoria | a retentativa trata exceção de `fetch` e estouro de tempo limite, não só `status` |

### Sobre a HEAD que se move no meio

`conferirSha` roda no começo e recusa SHA que não seja a HEAD. Mas entre ela e a
publicação passam a leitura do diff e a chamada ao modelo, que levam minutos. Se
alguém empurrar commit nessa janela, o recorte lido por `recortarDiff` já é do
código **novo**, enquanto o relatório sai rotulado com a SHA **velha** — rótulo
e conteúdo discordam, e quem lê acha que leu o estado atual.

A auditoria **não** é descartada: os tokens já foram gastos e o relatório vale
para a SHA que ele viu. O que não se admite é publicar isso em silêncio, então o
relatório abre declarando as duas SHAs, antes de qualquer outra coisa, e o log
do job registra a divergência. O marcador de idempotência continua sendo da SHA
auditada, então um disparo novo apontando para a HEAD nova publica normalmente.

## Limites do recorte, que o relatório declara

O relatório lista, aberto, **o que ficou fora**: binários, lockfiles, caminhos
sensíveis, arquivos sem `patch` no retorno da API e o que foi cortado por
limite. Silêncio sobre um arquivo não é conformidade dele — e o relatório diz
isso com essas palavras.

## Testes

```bash
node --test tools/auditor-claude/*.test.mjs
```

**23 casos, 23 passando, nenhum deles precisa de chave nem de internet.**

Os arquivos são listados por **glob**, e não por diretório. `node --test
tools/auditor-claude/` falha no Node 22 com `Cannot find module`: o runner trata
o diretório como módulo de entrada em vez de descobrir os testes dentro dele.
Este README e o workflow traziam a forma com diretório, que quebraria o passo de
teste em toda execução. Foi achado rodando o comando de verdade — reler o YAML
não acharia.

`auditar-pr.test.mjs` — 13 casos sobre as **decisões**: filtro do recorte,
remoção de segredo (incluindo segredo que o **modelo** repita na resposta),
idempotência, validação de argumentos, política de retentativa, montagem do
prompt contra um diff malicioso, o relatório declarando o que não avaliou, e o
aviso de HEAD desatualizada aparecendo só quando ela mudou de fato.

`integracao.test.mjs` — 10 casos sobre o **caminho de rede**. Sobe um servidor
local que se passa pelas duas APIs e roda o script por `execFile`, como o
workflow roda:

| caso | prova |
|---|---|
| 1 | caminho feliz: publica, com aviso de não-aprovação, marcador, recorte e tokens |
| 2 | 429 duas vezes: retenta e conclui |
| 3 | 429 sempre: desiste **sem** publicar |
| 4 | SHA que não é a HEAD: recusa **antes** de gastar token |
| 5 | idempotência: não chama o modelo nem republica |
| 6 | recorte vazio e resposta sem texto: as duas recusam publicar |
| 7 | **segredo do diff não chega ao prompt, e segredo que o modelo repete não chega ao comentário** |
| 8 | modelo inválido: falha com mensagem clara, sem publicar |
| 9 | **HEAD muda no meio: publica com o aviso no topo e registra no log, nunca em silêncio** |
| 10 | **socket derrubado duas vezes: retenta a falha de rede e conclui** |

O caso 7 é o mais importante: ele afere o que **saiu do processo**, lendo o que
o servidor falso recebeu — não o que a função devolve.

Dois defeitos foram pegos por teste antes de chegarem ao repositório:
`package-lock.json` passava pelo filtro, porque a extensão é `.json` e o filtro
olhava só `.lock`; e o comando de teste do próprio workflow não funcionava.

Três correções, três mutantes, cada um morto por um teste específico e só por
ele: removida a releitura do PR em `main()`, cai o caso 9; a exceção deixando de
ser retentada (`if (true) break` no `catch`), cai o caso 10; a entrada voltando a
ser interpolada no `run:`, cai o teste do workflow.

O primeiro mutante que eu tentei para a retentativa removia o `try {` e quebrava
a sintaxe — falhava tudo, o que prova que o arquivo é necessário e nada sobre a
lógica. Troquei por um que compila e só muda o comportamento. Mutante que não
compila não é prova.

## Os oito achados da revisão, e o que eu fiz com cada um

Cinco aceitos, três recusados.

**Aceitos.** Injeção de comando pelas entradas (o mais sério — as entradas
passaram a ir por `env:`); retentativa que ignorava exceção de `fetch`, e
portanto abortava na primeira falha de rede; `dados?.head` em vez de
`dados.head`, para corpo nulo dar mensagem e não `TypeError`; guarda de tipo em
`ehAuditavel`; e `argv = []` em `lerArgumentos`. Os três primeiros são defeitos
de verdade; os dois últimos são robustez barata, e cada um recebeu teste.

**Recusados: os três que mandavam trocar o modelo padrão `claude-sonnet-5-5`
por `claude-3-5-sonnet-latest`.** Esse é um identificador de geração anterior.
Aceitar seria rebaixar o modelo com base em conhecimento desatualizado — a mesma
forma de erro que eu cometi ao propor promover uma PR que rebaixaria o Next.js
de 15.5.28 para 15.5.25.

O ponto que decide, porém, não é quem está certo sobre o nome: `conferirModelo`
valida o identificador contra a API **em runtime**, e o caso 8 do teste de
integração prova que nome inválido falha com mensagem clara **antes** de gastar
token. O padrão é um palpite verificado na execução, não uma afirmação. Se eu
estiver errado sobre o nome, o primeiro disparo diz, de graça.

## O que ainda não foi provado

A conversa com `api.anthropic.com` e `api.github.com` **reais**. Não há chave
neste ambiente, e eu não peço nem recebo chave por conversa.

O que os 23 testes provam é que o script se comporta corretamente diante de
respostas com a **forma** que aquelas APIs devolvem, inclusive as de erro. Se a
forma real divergir do que foi modelado, isso aparece no primeiro disparo — e
é por isso que o primeiro disparo segue sendo **calibração**. Confira o custo
na Console depois dele.
