# Evidência CI-E2 — modo economia (retenção e cache)

Data da medição: 2026-09-02  
Repositório: `evolvia-tecnologia/evolvia-platform`  
Base medida: `develop@4d52f4df68d284d61c8ca7e5de077043a01fbd96`  
Issue: `#69`

Este lote conclui apenas o que é seguro e comprovável em código, sem reduzir
Gates. Percentuais subjetivos de minutos não são usados.

## Auditoria — artefatos e logs

| Fonte | Estado em 2026-09-02 | Observação |
| --- | --- | --- |
| `actions/upload-artifact` no workflow canônico | um único artefato `eventos-visual-${{ github.sha }}` | gerado só quando a Web é afetada |
| `retention-days` anterior | `7` | definido em `.github/workflows/validacao-v02.yml` |
| artefatos ativos (API GitHub) | 19, **22 820 633 bytes** | nenhum expirado na janela atual |
| tamanho típico recente | 1 438 089 a 1 508 773 bytes | captura de `/eventos` |
| logs de job | retenção do repositório (padrão GitHub, até 90 dias) | não há `retention-days` de log em YAML |

A redução de retenção aplica-se somente ao artefato visual transitório. Os logs
do run, o SHA e os checks continuam sendo a evidência de auditoria.

## Depois — retenção de artefato

| Campo | Antes | Depois |
| --- | --- | --- |
| `retention-days` de `eventos-visual-*` | 7 | 3 |
| ingestão | inalterada | inalterada |
| vida útil do artefato | 7 dias | 3 dias |
| armazenamento esperado em regime | 19 × 7 dias-artefato medidos agora | mesma ingestão com vida 3/7 da anterior |
| minutos de Actions | não dependem de retenção | **0 min** economizados por esta linha |

Três dias cobrem o diagnóstico de um PR ativo. Capturas antigas não são o
registro de auditoria: o run e o SHA são.

## Auditoria — workflows temporários versionados

Único workflow em `develop` e nesta branch: `.github/workflows/validacao-v02.yml`.

| Workflow (API GitHub) | ID | Última execução | Branch | Conclusão | Presente em `develop`? |
| --- | --- | --- | --- | --- | --- |
| Diagnóstico temporário de armazenamento | 334950273 | 2026-08-15 run `31879446954` | `ops/storage-audit-20260815` | failure | não |
| Gerar lockfile Web seguro | 328692440 | 2026-08-06 run `31114943898` | `feature/v0.2-transversal-foundation` | success | removido em `9d52a3a` |
| Sincronizar versão alpha.3 | 328729258 | 2026-08-06 run `31116710569` | `feature/v0.2-transversal-foundation` | success | removido em `7233add` |
| Temp Web Audit Lock Refresh | 334284679 | 2026-08-14 run `31803573251` | `chore/web-audit-lock-refresh` | success | não |

Os quatro permanecem `state: active` na API porque o GitHub conserva o registro
após a exclusão do arquivo. Desativar exige
`PUT /repos/.../actions/workflows/{id}/disable` (ação administrativa). Fora do
escopo deste lote. Recriar stubs em `develop` reintroduziria arquivos e
ultrapassaria o limite de 4 arquivos.

Gatilhos residuais: os YAML restantes nas branches acima só disparam em `push`
daquela branch. Nenhuma execução depois das datas da tabela.

## Avaliação — cache Buildx por imagem

Não implementado.

| Medição | Valor |
| --- | --- |
| cache Actions ativo | 37 entradas, **1 263 492 493 bytes** (~1,18 GiB) |
| quota pública do cache GHA | 10 GiB por repositório |
| composição | 36× `docker.io--tonistiigi--binfmt-latest-linux-x64` (~32,3 MiB, uma por ref de PR) + 1× npm em `develop` (101 949 605 bytes) |
| disco do servidor Oracle | run `31879446954` falhou; sem `df`/`docker system df` confiável |
| duração atual ARM64 API | run `#509` (PR só API): 140 s |
| duração atual ARM64 Web | run `#508` (PR só Web): 114 s |

O cache `type=gha` também é por ref. Camadas de API e Web (Node Alpine +
`node_modules` + standalone) somam centenas de MiB a >1 GiB por imagem. Dez PRs
concorrentes excederiam 10 GiB com folga. O diagnóstico de disco do servidor não
existe. O ganho de minutos é hipotético: os builds ARM64 já rodam no
`BUILDPLATFORM` nativo (PRs `#74` e `#75`) e duram ~2 min.

## Linha de base de minutos (não alterada por este corte)

Somas de duração de jobs (relógio de parede). A API de `timing.billable` retornou
`0` neste token; por isso a evidência usa `started_at`/`completed_at`.

| Cenário | Run | Qualidade | ARM64 API | ARM64 Web | Integração | Gate | Deploy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR só Web | `#508` | 115 s | skipped | 114 s | 198 s | 3 s | skipped |
| PR só API | `#509` | 118 s | 140 s | skipped | 152 s | 4 s | skipped |
| push `develop` | `#495` | 115 s | 114 s | 121 s | 170 s | 4 s | 74 s (HTTPS falhou; issue `#68`) |

Jobs obrigatórios preservados: qualidade, detecção, ARM64 por imagem, Gate
consolidado, migration/integração, deploy de `push` em `develop`.
`concurrency.cancel-in-progress` continua só em `pull_request`.

## Revisão negativa

- Não há `cache-from` / `cache-to` / `type=gha` no workflow.
- Não há redução de `timeout-minutes` dos Gates.
- `homologacao` permanece `if: github.event_name == 'push' && github.ref == 'refs/heads/develop'`.
- A chave SSH, o host, o Nginx e `main` não foram tocados.

## Pendências explícitas

1. desativação administrativa dos quatro workflows `active` na API;
2. medição de minutos da organização (billing 403 neste token);
3. cache Buildx só após quota e disco do servidor medidos com folga.
